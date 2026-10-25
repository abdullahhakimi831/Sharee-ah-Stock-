/*
 * Builds data/shariah-ratios.json from official SEC filings.
 *
 * For every US-listed stock in js/shariah-data.js (plus data/extra-symbols.json)
 * it downloads the company's XBRL "company facts" from the SEC and computes the
 * AAOIFI-style financial screens:
 *
 *   interest income            / revenue      < 5%
 *   interest-bearing debt      / market value < 33%
 *   cash + interest securities / market value < 33%
 *   receivables                / market value < 49%
 *
 * Runs nightly from .github/workflows/shariah-data.yml. No API key needed for the
 * SEC; market value comes from Finnhub when FINNHUB_KEY is set, otherwise from
 * Stooq's free end-of-day quotes.
 *
 * Usage: node scripts/build-shariah-data.mjs
 * Env:   SEC_USER_AGENT  contact string the SEC asks for (defaults to the repo)
 *        FINNHUB_KEY     optional, more reliable market caps
 *        MOCK_DIR        optional, read responses from local files (for testing)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}data/shariah-ratios.json`;
// The SEC asks automated clients to identify themselves: "Name email@domain".
// A repository secret SEC_USER_AGENT is best; the fallbacks are tried in order.
const UA_CANDIDATES = [
  process.env.SEC_USER_AGENT,
  "Sharee-ah Stock Tracker abdullahhakimi831@users.noreply.github.com",
  "ShareeahStockTracker/1.0 (+https://github.com/abdullahhakimi831/Sharee-ah-Stock-)",
].filter(Boolean);
let UA = UA_CANDIDATES[0];
const FINNHUB_KEY = process.env.FINNHUB_KEY || "";
const MOCK_DIR = process.env.MOCK_DIR || "";

const LIMITS = { interest: 5, debt: 33, cash: 33, receivables: 49 };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- HTTP (SEC allows ~10 requests/second; stay well under) ----------
let lastSec = 0;
async function getJSON(url, { sec = false } = {}) {
  if (MOCK_DIR) {
    const file = `${MOCK_DIR}/${url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9.]+/g, "_")}`;
    if (!existsSync(file)) throw new Error(`mock missing: ${file}`);
    return JSON.parse(await readFile(file, "utf8"));
  }
  if (sec) { const wait = 150 - (Date.now() - lastSec); if (wait > 0) await sleep(wait); lastSec = Date.now(); }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Encoding": "gzip, deflate" } });
    if (res.ok) return res.json();
    if (res.status === 404) throw new Error("not found");
    if (res.status === 403 && sec) {
      const next = UA_CANDIDATES[UA_CANDIDATES.indexOf(UA) + 1];
      if (next) { console.log(`SEC refused user agent "${UA}", trying the next one.`); UA = next; attempt--; await sleep(500); continue; }
      throw new Error("HTTP 403 from the SEC. Add a repository secret SEC_USER_AGENT like \"Your Name you@example.com\" (Settings > Secrets and variables > Actions).");
    }
    if (attempt === 3) throw new Error(`HTTP ${res.status}`);
    await sleep(1000 * attempt);
  }
}
async function getText(url) {
  if (MOCK_DIR) {
    const file = `${MOCK_DIR}/${url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9.]+/g, "_")}`;
    return existsSync(file) ? readFile(file, "utf8") : "";
  }
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  return res.ok ? res.text() : "";
}

// ---------- Symbols ----------
async function loadSymbols() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${await readFile(`${ROOT}js/shariah-data.js`, "utf8")}\nthis.DB = SHARIAH_DB;`, ctx);
  const list = Object.entries(ctx.DB)
    .filter(([, d]) => d.sector !== "Islamic ETF") // funds don't file company financials
    .map(([s]) => s);
  const extraFile = `${ROOT}data/extra-symbols.json`;
  if (existsSync(extraFile)) list.push(...JSON.parse(await readFile(extraFile, "utf8")).map(s => s.toUpperCase()));
  return [...new Set(list)];
}

// ---------- XBRL fact helpers ----------
const FORMS = new Set(["10-K", "10-Q", "10-K/A", "10-Q/A"]);
const days = (a, b) => (new Date(b) - new Date(a)) / 864e5;

function units(facts, tag) {
  const f = facts["us-gaap"]?.[tag] || facts.dei?.[tag];
  if (!f) return [];
  return f.units.USD || f.units.shares || Object.values(f.units)[0] || [];
}

/* Latest balance-sheet value (an instant) for the first tag that has data. */
function latestInstant(facts, tags, onOrBefore) {
  for (const tag of tags) {
    const pts = units(facts, tag).filter(p => !p.start && FORMS.has(p.form) && (!onOrBefore || p.end <= onOrBefore));
    if (!pts.length) continue;
    const end = pts.reduce((m, p) => (p.end > m ? p.end : m), "");
    const best = pts.filter(p => p.end === end).sort((a, b) => b.filed.localeCompare(a.filed))[0];
    return { tag, val: best.val, end, form: best.form, filed: best.filed, accn: best.accn };
  }
  return null;
}

/* Value at a specific balance-sheet date (so all parts of a sum line up). */
function instantAt(facts, tag, end) {
  const pts = units(facts, tag).filter(p => !p.start && p.end === end && FORMS.has(p.form));
  return pts.length ? pts.sort((a, b) => b.filed.localeCompare(a.filed))[0].val : null;
}

/* Latest full fiscal-year value (duration of roughly one year) for the first tag with data. */
function latestAnnual(facts, tags, end) {
  for (const tag of tags) {
    const pts = units(facts, tag).filter(p => p.start && days(p.start, p.end) > 330 && days(p.start, p.end) < 380 && (end ? p.end === end : true));
    if (!pts.length) continue;
    const last = pts.reduce((m, p) => (p.end > m ? p.end : m), "");
    const best = pts.filter(p => p.end === last).sort((a, b) => b.filed.localeCompare(a.filed))[0];
    return { tag, val: best.val, start: best.start, end: best.end, form: best.form, filed: best.filed, accn: best.accn };
  }
  return null;
}

const TAGS = {
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"],
  interest: ["InvestmentIncomeInterest", "InterestIncomeOther", "InvestmentIncomeInterestAndDividend", "InterestAndDividendIncomeOperating", "InterestIncomeOperating"],
  debtTotal: ["LongTermDebt", "DebtLongtermAndShorttermCombinedAmount", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"],
  debtParts: [
    ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],
    ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"],
    ["ConvertibleDebtNoncurrent", "ConvertibleNotesPayable", "SeniorNotes"],
  ],
  shortDebt: ["ShortTermBorrowings", "CommercialPaper"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"],
  securities: ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent", "MarketableSecuritiesNoncurrent", "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent", "HeldToMaturitySecurities"],
  receivables: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent", "AccountsNotesAndLoansReceivableNetCurrent"],
  shares: ["EntityCommonStockSharesOutstanding"],
  sharesFallback: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic"],
};

function financials(facts) {
  const notes = [];
  // Anchor every balance-sheet item to the most recent report date
  const anchor = latestInstant(facts, ["Assets"]) || latestInstant(facts, TAGS.cash);
  if (!anchor) return { error: "No balance sheet in SEC data" };
  const end = anchor.end;
  const sumAt = (tags) => {
    let total = 0, used = [];
    for (const t of tags) { const v = instantAt(facts, t, end); if (v != null) { total += v; used.push(t); } }
    return { total, used };
  };

  // Interest-bearing debt
  let debt = null, debtHow = "";
  for (const t of TAGS.debtTotal) { const v = instantAt(facts, t, end); if (v != null) { debt = v; debtHow = t; break; } }
  if (debt == null) {
    const parts = TAGS.debtParts.map(alts => { for (const t of alts) { const v = instantAt(facts, t, end); if (v != null) return [t, v]; } return null; }).filter(Boolean);
    if (parts.length) { debt = parts.reduce((s, p) => s + p[1], 0); debtHow = parts.map(p => p[0]).join(" + "); }
  }
  const short = sumAt(TAGS.shortDebt);
  if (debt == null && !short.used.length) { debt = 0; debtHow = "no debt reported"; notes.push("No interest-bearing debt reported."); }
  else { debt = (debt || 0) + short.total; if (short.used.length) debtHow += (debtHow ? " + " : "") + short.used.join(" + "); }

  // Cash + interest-bearing securities
  let cash = null, cashTag = "";
  for (const t of TAGS.cash) { const v = instantAt(facts, t, end); if (v != null) { cash = v; cashTag = t; break; } }
  const sec = sumAt(TAGS.securities.filter((t, i, a) => {
    // don't double count: skip AFS lines when Marketable Securities lines exist for the same side
    if (t.startsWith("AvailableForSale") && t.endsWith("Current") && instantAt(facts, "MarketableSecuritiesCurrent", end) != null) return false;
    if (t.startsWith("AvailableForSale") && t.endsWith("Noncurrent") && instantAt(facts, "MarketableSecuritiesNoncurrent", end) != null) return false;
    if (t === "MarketableSecuritiesCurrent" && instantAt(facts, "ShortTermInvestments", end) != null) return false;
    return true;
  }));
  const cashAll = (cash || 0) + sec.total;

  // Receivables
  let receivables = null, recTag = "";
  for (const t of TAGS.receivables) { const v = instantAt(facts, t, end); if (v != null) { receivables = v; recTag = t; break; } }

  // Revenue and interest income for the same fiscal year when possible
  const revenue = latestAnnual(facts, TAGS.revenue);
  const interest = revenue && (latestAnnual(facts, TAGS.interest, revenue.end) || latestAnnual(facts, TAGS.interest));
  if (revenue && !interest) notes.push("No separate interest income line found; treated as 0.");

  // Shares outstanding (for market value)
  const sh = latestInstant(facts, TAGS.shares) || latestAnnual(facts, TAGS.sharesFallback);
  if (!sh) notes.push("Shares outstanding not found.");

  return {
    asOf: end, form: anchor.form, filed: anchor.filed, accn: anchor.accn,
    revenue: revenue?.val ?? null, revenueYearEnd: revenue?.end ?? null,
    interestIncome: interest?.val ?? (revenue ? 0 : null),
    debt, cashAndSecurities: cashAll, receivables,
    shares: sh?.val ?? null,
    tags: { debt: debtHow, cash: [cashTag, ...sec.used].filter(Boolean).join(" + "), receivables: recTag, revenue: revenue?.tag, interest: interest?.tag || null },
    notes,
  };
}

// ---------- Market value ----------
async function marketCap(sym, shares) {
  if (FINNHUB_KEY) {
    try {
      const p = await getJSON(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`);
      if (p?.marketCapitalization) return { value: p.marketCapitalization * 1e6, source: "Finnhub" };
    } catch {}
  }
  if (!shares) return null;
  // Stooq: free end-of-day quotes, no key. Symbols like BRK.B become brk-b.us
  const s = `${sym.toLowerCase().replace(".", "-")}.us`;
  const csv = (await getText(`https://stooq.com/q/l/?s=${s}&f=sd2t2ohlcv&h&e=csv`)).trim().split(/\r?\n/);
  const head = (csv[0] || "").split(","), row = (csv[1] || "").split(",");
  const close = parseFloat(row[head.findIndex(h => /close/i.test(h))]);
  if (close > 0) return { value: close * shares, price: close, source: "Stooq close × SEC shares" };
  return null;
}

// ---------- Main ----------
const round = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 100) / 100);

async function main() {
  const symbols = await loadSymbols();
  const tickers = await getJSON("https://www.sec.gov/files/company_tickers.json", { sec: true });
  const cikOf = {};
  for (const t of Object.values(tickers)) cikOf[t.ticker.toUpperCase()] = t.cik_str;

  let previous = {};
  if (existsSync(OUT)) { try { previous = JSON.parse(await readFile(OUT, "utf8")).stocks || {}; } catch {} }

  const stocks = {}, skipped = {};
  for (const sym of symbols) {
    const cik = cikOf[sym] ?? cikOf[sym.replace(".", "-")];
    if (!cik) { skipped[sym] = "Not in the SEC's company list"; continue; }
    try {
      const data = await getJSON(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`, { sec: true });
      if (!data.facts?.["us-gaap"]) { skipped[sym] = "Files under IFRS (foreign company), not supported yet"; continue; }
      const f = financials(data.facts);
      if (f.error) { skipped[sym] = f.error; continue; }
      const mc = await marketCap(sym, f.shares);
      const ratios = {
        interest: f.revenue ? (Math.max(0, f.interestIncome) / f.revenue) * 100 : null, // some filers report net (negative) figures
        debt: mc ? (f.debt / mc.value) * 100 : null,
        cash: mc ? (f.cashAndSecurities / mc.value) * 100 : null,
        receivables: mc && f.receivables != null ? (f.receivables / mc.value) * 100 : null,
      };
      const pass = Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, v == null ? null : v < LIMITS[k]]));
      const known = Object.values(pass).filter(v => v != null);
      const entry = {
        name: data.entityName, cik,
        asOf: f.asOf, revenueYearEnd: f.revenueYearEnd, form: f.form, filed: f.filed,
        filingUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${f.accn.replace(/-/g, "")}/`,
        values: { revenue: f.revenue, interestIncome: f.interestIncome, debt: f.debt, cashAndSecurities: f.cashAndSecurities, receivables: f.receivables, shares: f.shares, marketCap: mc?.value ?? null, price: mc?.price ?? null },
        marketCapSource: mc?.source ?? null,
        ratios: Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, round(v)])),
        pass,
        financialPass: known.length ? known.every(Boolean) : null,
        tags: f.tags,
        notes: [...f.notes, ...(mc ? [] : ["Market value unavailable, so the debt, cash and receivables ratios couldn't be computed."])],
      };
      // Keep one history point per reporting date
      const hist = (previous[sym]?.history || []).filter(h => h.asOf !== f.asOf);
      hist.push({ asOf: f.asOf, checked: new Date().toISOString().slice(0, 10), ratios: entry.ratios });
      entry.history = hist.sort((a, b) => a.asOf.localeCompare(b.asOf)).slice(-24);
      stocks[sym] = entry;
      console.log(`${sym.padEnd(6)} ok  debt ${entry.ratios.debt ?? "-"}%  cash ${entry.ratios.cash ?? "-"}%  rec ${entry.ratios.receivables ?? "-"}%  int ${entry.ratios.interest ?? "-"}%`);
    } catch (e) {
      skipped[sym] = `Error: ${e.message}`;
      if (previous[sym]) stocks[sym] = { ...previous[sym], stale: true }; // keep last good data
      console.log(`${sym.padEnd(6)} skip ${e.message}`);
    }
  }

  await mkdir(`${ROOT}data`, { recursive: true });
  const out = {
    generated: new Date().toISOString(),
    method: "AAOIFI-style financial screens from SEC XBRL filings. Market value = current market capitalization.",
    limits: LIMITS,
    stocks, skipped,
  };
  await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`\nWrote ${Object.keys(stocks).length} stocks, skipped ${Object.keys(skipped).length}.`);
  for (const [s, why] of Object.entries(skipped)) console.log(`  skipped ${s}: ${why}`);
  if (!Object.keys(stocks).length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });

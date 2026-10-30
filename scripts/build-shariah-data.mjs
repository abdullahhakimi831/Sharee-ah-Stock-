/*
 * Builds data/shariah-ratios.json from official SEC filings.
 *
 * For every US-listed stock in js/shariah-data.js (plus data/extra-symbols.json):
 *
 *  1. Financial screens from the company's XBRL "company facts", measured four ways:
 *       AAOIFI   debt, cash  vs current market value        (30% / 30%)
 *       S&P      debt, cash  vs 36-month average market value (33% / 33%), receivables 49%
 *       DJIM     debt, cash, receivables vs 24-month average market value (33% each)
 *       MSCI     debt, cash, receivables + cash vs total assets (33.33% each)
 *     plus interest income / revenue (< 5%). A figure missing from the filing is
 *     reported as missing, never as 0.
 *  2. Shariah fund confirmation: the latest SEC N-PORT holdings of SPUS, HLAL and UMMA.
 *  3. Optional (ANTHROPIC_API_KEY set): Claude reads the latest 10-K and lists revenue
 *     from impermissible activities with quotes. Cached per filing, so it only runs
 *     when a company files a new annual report.
 *
 * Runs nightly from .github/workflows/shariah-data.yml.
 *
 * Env:   SEC_USER_AGENT     "Name email" the SEC asks automated clients to send
 *        FINNHUB_KEY        optional, current market value
 *        TWELVE_DATA_KEY    optional, monthly price history if Stooq is unavailable
 *        ANTHROPIC_API_KEY  optional, enables the 10-K reading step
 *        MOCK_DIR           optional, read responses from local files (for testing)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}data/shariah-ratios.json`;
// The SEC asks automated clients to identify themselves: "Name email@domain".
const UA_CANDIDATES = [
  process.env.SEC_USER_AGENT,
  "Sharee-ah Stock Tracker abdullahhakimi831@users.noreply.github.com",
  "ShareeahStockTracker/1.0 (+https://github.com/abdullahhakimi831/Sharee-ah-Stock-)",
].filter(Boolean);
let UA = UA_CANDIDATES[0];
const FINNHUB_KEY = process.env.FINNHUB_KEY || "";
const TWELVE_KEY = process.env.TWELVE_DATA_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const MOCK_DIR = process.env.MOCK_DIR || "";

const METHODS = {
  aaoifi: { name: "AAOIFI", base: "marketCap", baseLabel: "current market value", limits: { interest: 5, debt: 30, cash: 30 } },
  sp: { name: "S&P Shariah", base: "avg36", baseLabel: "36-month average market value", limits: { interest: 5, debt: 33, cash: 33, receivables: 49 } },
  djim: { name: "Dow Jones Islamic", base: "avg24", baseLabel: "24-month average market value", limits: { interest: 5, debt: 33, cash: 33, receivables: 33 } },
  msci: { name: "MSCI Islamic", base: "assets", baseLabel: "total assets", limits: { interest: 5, debt: 33.33, cash: 33.33, recCash: 33.33 } },
};
const FUNDS = ["SPUS", "HLAL", "UMMA"];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const round = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 100) / 100);

// ---------- HTTP ----------
const mockFile = (url) => `${MOCK_DIR}/${url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9.]+/g, "_")}`;
let lastSec = 0;
async function getRaw(url, { sec = false } = {}) {
  if (MOCK_DIR) {
    const f = mockFile(url);
    if (!existsSync(f)) throw new Error("not found");
    return readFile(f, "utf8");
  }
  if (sec) { const wait = 150 - (Date.now() - lastSec); if (wait > 0) await sleep(wait); lastSec = Date.now(); }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
    if (res.ok) return res.text();
    if (res.status === 404) throw new Error("not found");
    if (res.status === 403 && sec) {
      const next = UA_CANDIDATES[UA_CANDIDATES.indexOf(UA) + 1];
      if (next) { console.log(`SEC refused user agent "${UA}", trying the next one.`); UA = next; attempt--; await sleep(500); continue; }
      throw new Error("HTTP 403 from the SEC. Add a repository secret SEC_USER_AGENT like \"Your Name you@example.com\".");
    }
    if (attempt === 3) throw new Error(`HTTP ${res.status}`);
    await sleep(1000 * attempt);
  }
}
const getJSON = async (url, opts) => JSON.parse(await getRaw(url, opts));
const secJSON = (url) => getJSON(url, { sec: true });

// ---------- Symbols ----------
async function loadDb() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${await readFile(`${ROOT}js/shariah-data.js`, "utf8")}\nthis.DB = SHARIAH_DB;`, ctx);
  return ctx.DB;
}
async function loadSymbols(db) {
  const list = Object.entries(db).filter(([, d]) => d.sector !== "Islamic ETF").map(([s]) => s);
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
function latestInstant(facts, tags) {
  for (const tag of tags) {
    const pts = units(facts, tag).filter(p => !p.start && FORMS.has(p.form));
    if (!pts.length) continue;
    const end = pts.reduce((m, p) => (p.end > m ? p.end : m), "");
    const best = pts.filter(p => p.end === end).sort((a, b) => b.filed.localeCompare(a.filed))[0];
    return { tag, val: best.val, end, form: best.form, filed: best.filed, accn: best.accn };
  }
  return null;
}
function instantAt(facts, tag, end) {
  const pts = units(facts, tag).filter(p => !p.start && p.end === end && FORMS.has(p.form));
  return pts.length ? pts.sort((a, b) => b.filed.localeCompare(a.filed))[0].val : null;
}
function firstAt(facts, tags, end) {
  for (const t of tags) { const v = instantAt(facts, t, end); if (v != null) return { tag: t, val: v }; }
  return null;
}
function latestAnnual(facts, tags, end) {
  for (const tag of tags) {
    const pts = units(facts, tag).filter(p => p.start && days(p.start, p.end) > 330 && days(p.start, p.end) < 380 && (end ? p.end === end : true));
    if (!pts.length) continue;
    const last = pts.reduce((m, p) => (p.end > m ? p.end : m), "");
    const best = pts.filter(p => p.end === last).sort((a, b) => b.filed.localeCompare(a.filed))[0];
    return { tag, val: best.val, end: best.end };
  }
  return null;
}

const TAGS = {
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet", "SalesRevenueGoodsNet", "RevenuesNetOfInterestExpense", "RevenuesAndOtherIncome"],
  // Interest only (preferred), then lines that also include dividends or other income (overstates; flagged)
  interestPure: ["InvestmentIncomeInterest", "InterestIncomeOther", "InterestIncomeOperating", "InterestIncomeNonoperating", "InterestIncome"],
  interestMixed: ["InvestmentIncomeInterestAndDividend", "InterestAndDividendIncomeOperating", "InterestAndOtherIncome", "InvestmentIncomeNonoperating"],
  debtTotal: ["LongTermDebt", "DebtLongtermAndShorttermCombinedAmount", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
    "DebtInstrumentCarryingAmount", "LongTermNotesPayable", "NotesPayable", "SeniorLongTermNotes", "SeniorNotes"],
  debtParts: [
    ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],
    ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"],
    ["ConvertibleDebtNoncurrent", "ConvertibleNotesPayable"],
  ],
  shortDebt: ["ShortTermBorrowings", "CommercialPaper", "ConvertibleNotesPayableCurrent"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"],
  securities: ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    "MarketableSecuritiesNoncurrent", "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent", "HeldToMaturitySecurities"],
  receivables: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent", "AccountsNotesAndLoansReceivableNetCurrent"],
  shares: ["EntityCommonStockSharesOutstanding"],
  sharesFallback: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic"],
};

function financials(facts) {
  const notes = [], missing = [];
  const anchor = latestInstant(facts, ["Assets"]) || latestInstant(facts, TAGS.cash);
  if (!anchor) return { error: "No balance sheet in SEC data" };
  const end = anchor.end;
  const assets = instantAt(facts, "Assets", end);
  if (assets == null) missing.push("total assets");

  // Interest-bearing debt: a total line if there is one, otherwise the parts
  let debt = null, debtHow = "";
  const total = firstAt(facts, TAGS.debtTotal, end);
  if (total) { debt = total.val; debtHow = total.tag; }
  else {
    const parts = TAGS.debtParts.map(alts => firstAt(facts, alts, end)).filter(Boolean);
    if (parts.length) { debt = parts.reduce((s, p) => s + p.val, 0); debtHow = parts.map(p => p.tag).join(" + "); }
  }
  const shorts = TAGS.shortDebt.map(t => ({ t, v: instantAt(facts, t, end) })).filter(x => x.v != null);
  if (shorts.length) { debt = (debt || 0) + shorts.reduce((s, x) => s + x.v, 0); debtHow += (debtHow ? " + " : "") + shorts.map(x => x.t).join(" + "); }
  if (debt == null) missing.push("debt");

  // Cash and interest-bearing securities, without double counting overlapping lines
  const cashLine = firstAt(facts, TAGS.cash, end);
  const has = (t) => instantAt(facts, t, end) != null;
  const secTags = TAGS.securities.filter(t => {
    if (t === "MarketableSecuritiesCurrent" && has("ShortTermInvestments")) return false;
    if (t === "AvailableForSaleSecuritiesDebtSecuritiesCurrent" && (has("MarketableSecuritiesCurrent") || has("ShortTermInvestments"))) return false;
    if (t === "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent" && has("MarketableSecuritiesNoncurrent")) return false;
    return has(t);
  });
  const cash = cashLine || secTags.length ? (cashLine?.val || 0) + secTags.reduce((s, t) => s + instantAt(facts, t, end), 0) : null;
  if (cash == null) missing.push("cash");

  const rec = firstAt(facts, TAGS.receivables, end);
  if (!rec) missing.push("receivables");

  const revenue = latestAnnual(facts, TAGS.revenue);
  let interest = null, interestBasis = null;
  if (revenue) {
    const pure = latestAnnual(facts, TAGS.interestPure, revenue.end) || latestAnnual(facts, TAGS.interestPure);
    const mixed = !pure && (latestAnnual(facts, TAGS.interestMixed, revenue.end) || latestAnnual(facts, TAGS.interestMixed));
    if (pure) { interest = pure; interestBasis = "interest"; }
    else if (mixed) { interest = mixed; interestBasis = "includes dividends or other income"; notes.push("Interest income is reported together with dividends or other income, so the interest share may be overstated."); }
    else missing.push("interest income");
  } else missing.push("revenue");

  const sh = latestInstant(facts, TAGS.shares) || latestAnnual(facts, TAGS.sharesFallback);
  if (!sh) missing.push("shares outstanding");
  // Share count over time, for average market values
  const shareHist = (units(facts, "EntityCommonStockSharesOutstanding").length ? units(facts, "EntityCommonStockSharesOutstanding") : units(facts, TAGS.sharesFallback[0]))
    .map(p => [p.end, p.val]).sort((a, b) => a[0].localeCompare(b[0]));

  return {
    asOf: end, form: anchor.form, filed: anchor.filed, accn: anchor.accn,
    revenue: revenue?.val ?? null, revenueYearEnd: revenue?.end ?? null,
    interestIncome: interest ? Math.max(0, interest.val) : null, interestBasis,
    debt, cash, receivables: rec?.val ?? null, assets, shares: sh?.val ?? null, shareHist,
    tags: { debt: debtHow || null, cash: [cashLine?.tag, ...secTags].filter(Boolean).join(" + ") || null, receivables: rec?.tag || null, revenue: revenue?.tag || null, interest: interest?.tag || null },
    notes, missing,
  };
}

// ---------- Market value: today and 24/36-month averages ----------
async function monthlyCloses(sym) {
  // Stooq monthly history (free, no key); Twelve Data as a backup
  try {
    const s = `${sym.toLowerCase().replace(".", "-")}.us`;
    const csv = (await getRaw(`https://stooq.com/q/d/l/?s=${s}&i=m`)).trim().split(/\r?\n/);
    const head = csv[0].split(",");
    const iD = head.findIndex(h => /date/i.test(h)), iC = head.findIndex(h => /close/i.test(h));
    const rows = csv.slice(1).map(l => l.split(",")).filter(r => parseFloat(r[iC]) > 0).map(r => [r[iD], parseFloat(r[iC])]);
    if (iD >= 0 && iC >= 0 && rows.length >= 12) return { rows, source: "Stooq" };
  } catch {}
  if (TWELVE_KEY) {
    try {
      await sleep(8000); // free plan: 8 requests a minute
      const d = await getJSON(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=1month&outputsize=40&apikey=${TWELVE_KEY}`);
      const rows = (d.values || []).map(v => [v.datetime.slice(0, 10), parseFloat(v.close)]).reverse();
      if (rows.length >= 12) return { rows, source: "Twelve Data" };
    } catch {}
  }
  return null;
}
function sharesAt(hist, date) {
  let v = hist[0]?.[1] ?? null;
  for (const [d, s] of hist) { if (d <= date) v = s; else break; }
  return v;
}
async function marketValues(sym, f) {
  const out = { marketCap: null, avg24: null, avg36: null, price: null, sources: [] };
  if (FINNHUB_KEY) {
    try {
      const p = await getJSON(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`);
      if (p?.marketCapitalization) { out.marketCap = p.marketCapitalization * 1e6; out.sources.push("current value: Finnhub"); }
    } catch {}
  }
  const hist = await monthlyCloses(sym);
  if (hist && f.shareHist.length) {
    const caps = hist.rows.map(([d, c]) => c * sharesAt(f.shareHist, d)).filter(v => v > 0);
    const avg = (n) => caps.length >= n ? caps.slice(-n).reduce((s, v) => s + v, 0) / n : null;
    out.avg24 = avg(24); out.avg36 = avg(36);
    out.price = hist.rows.at(-1)[1];
    if (!out.marketCap && f.shares) { out.marketCap = out.price * f.shares; out.sources.push(`current value: ${hist.source} close × SEC shares`); }
    out.sources.push(`averages: ${hist.source} monthly closes × SEC share counts`);
  }
  return out;
}

function screen(f, mv) {
  const bases = { marketCap: mv.marketCap, avg24: mv.avg24, avg36: mv.avg36, assets: f.assets };
  const interestPct = f.revenue && f.interestIncome != null ? (f.interestIncome / f.revenue) * 100 : null;
  const methods = {};
  for (const [key, m] of Object.entries(METHODS)) {
    const base = bases[m.base];
    const val = {
      interest: interestPct,
      debt: base && f.debt != null ? (f.debt / base) * 100 : null,
      cash: base && f.cash != null ? (f.cash / base) * 100 : null,
      receivables: base && f.receivables != null ? (f.receivables / base) * 100 : null,
      recCash: base && f.receivables != null && f.cash != null ? ((f.receivables + f.cash) / base) * 100 : null,
    };
    const ratios = {}, pass = {};
    for (const [k, lim] of Object.entries(m.limits)) { ratios[k] = round(val[k]); pass[k] = val[k] == null ? null : val[k] < lim; }
    const vals = Object.values(pass);
    methods[key] = { ratios, limits: m.limits, pass, base: m.base, baseValue: base ?? null,
      result: vals.includes(false) ? "fail" : vals.includes(null) ? "incomplete" : "pass" };
  }
  return methods;
}

// ---------- Shariah fund holdings (SEC N-PORT) ----------
const norm = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ")
  .replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|nv|n v|sa|ag|se|holdings?|group|the|class [a-z]|cl [a-z]|adr|ads|sponsored)\b/g, " ")
  .replace(/\s+/g, " ").trim();
async function fundHoldings() {
  const out = {};
  let map;
  try { map = await secJSON("https://www.sec.gov/files/company_tickers_mf.json"); }
  catch (e) { console.log(`fund list unavailable: ${e.message}`); return out; }
  const idx = Object.fromEntries(map.fields.map((f, i) => [f, i]));
  for (const fund of FUNDS) {
    try {
      const row = map.data.find(r => String(r[idx.symbol]).toUpperCase() === fund);
      if (!row) { console.log(`${fund}: not in the SEC fund list`); continue; }
      const cik = row[idx.cik], series = row[idx.seriesId];
      const sub = await secJSON(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`);
      const r = sub.filings.recent;
      const cands = r.form.map((f, i) => ({ f, accn: r.accessionNumber[i], date: r.filingDate[i] })).filter(x => x.f === "NPORT-P").slice(0, 150);
      let found = null;
      for (const c of cands) {
        const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${c.accn.replace(/-/g, "")}/primary_doc.xml`;
        let xml;
        try { xml = await getRaw(url, { sec: true }); } catch { continue; }
        if (!xml.includes(series)) continue;
        found = { xml, url, filed: c.date };
        break;
      }
      if (!found) { console.log(`${fund}: no N-PORT filing found for series ${series}`); continue; }
      const holdings = [...found.xml.matchAll(/<invstOrSec>([\s\S]*?)<\/invstOrSec>/g)].map(m => {
        const b = m[1];
        return { name: (b.match(/<name>([\s\S]*?)<\/name>/) || [])[1] || "", ticker: ((b.match(/<ticker\s+value="([^"]+)"/) || [])[1] || "").toUpperCase() };
      });
      out[fund] = { asOf: (found.xml.match(/<repPdDate>([^<]+)<\/repPdDate>/) || [])[1] || found.filed, filed: found.filed, url: found.url, count: holdings.length, holdings };
      console.log(`${fund}: ${holdings.length} holdings as of ${out[fund].asOf}`);
    } catch (e) { console.log(`${fund}: ${e.message}`); }
  }
  return out;
}
function heldBy(funds, sym, names) {
  const t = sym.replace(".", "/"), keys = names.map(norm).filter(k => k.length >= 3);
  return Object.entries(funds).filter(([, f]) => f.holdings.some(h =>
    h.ticker === sym || h.ticker === t || h.ticker === sym.replace(".", " ") ||
    keys.some(k => { const n = norm(h.name); return n === k || n.startsWith(k + " ") || k.startsWith(n + " "); })
  )).map(([fund]) => fund);
}

// ---------- Claude reads the 10-K for impermissible revenue (optional) ----------
const KEYWORDS = /alcohol|beer|wine|spirits|liquor|brew|gambl|casino|wager|betting|lotter|sportsbook|music|recorded|concert|streaming|entertainment|film|pork|swine|tobacco|cigar|nicotine|vap(e|ing)|cannabis|adult|firearm|weapon|munition|defen[cs]e|interest income|financing|lending|loans?|credit card|insurance|premium|segment|disaggregat/i;
function excerpts(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/&#\d+;|&\w+;/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
  const paras = text.split("\n").map(s => s.trim()).filter(s => s.length > 60);
  const keep = [];
  let size = 0;
  for (const p of paras) {
    if (!KEYWORDS.test(p)) continue;
    const piece = p.slice(0, 1500);
    if (size + piece.length > 120000) break; // about 30k tokens of relevant passages
    keep.push(piece); size += piece.length;
  }
  return keep.join("\n\n");
}

let claude = null, schema = null, outputFormat = null;
async function aiReview(sym, name, cik, previous) {
  if (!ANTHROPIC_KEY) return previous?.ai || null;
  const sub = await secJSON(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`);
  const r = sub.filings.recent;
  const i = r.form.findIndex(f => f === "10-K");
  if (i < 0) return previous?.ai || null;
  const accn = r.accessionNumber[i];
  if (previous?.ai?.accn === accn) return previous.ai; // already read this filing
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g, "")}/${r.primaryDocument[i]}`;
  const passages = excerpts(await getRaw(url, { sec: true }));
  if (!passages) return null;

  if (!claude) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const { z } = await import("zod");
    const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
    claude = new Anthropic();
    schema = z.object({
      core_business_impermissible: z.boolean(),
      items: z.array(z.object({
        category: z.enum(["alcohol", "pork", "gambling", "tobacco", "music_entertainment", "adult", "weapons", "conventional_insurance", "conventional_finance", "other"]),
        description: z.string(),
        pct_of_revenue: z.number().nullable(),
        basis: z.enum(["reported", "estimated", "not_quantifiable"]),
        quote: z.string(),
      })),
      summary: z.string(),
    });
    outputFormat = betaZodOutputFormat(schema);
  }

  const response = await claude.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: outputFormat },
    system: "You are a Shariah equity screening analyst applying the AAOIFI business-activity screen. You read annual-report passages and identify revenue from impermissible activities: alcohol, pork, gambling, tobacco, music and entertainment, adult content, weapons, conventional insurance and conventional (interest-based) financial services. Interest income on cash is measured separately from the company's financial statements, so do not list it. Base every item only on the passages given, quote the supporting sentence exactly, and give the share of total revenue when the passages state or let you compute it; otherwise set pct_of_revenue to null and basis to not_quantifiable. Do not list permissible activities, and return an empty items list when nothing impermissible is mentioned.",
    messages: [{ role: "user", content: `Company: ${name} (${sym}). Latest 10-K: ${url}\n\nThese are the passages of the 10-K that mention possibly relevant activities (not the whole report):\n\n${passages}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    console.log(`${sym}: 10-K review returned no result (${response.stop_reason})`);
    return previous?.ai || null;
  }
  const u = response.usage;
  console.log(`${sym}: 10-K reviewed (${u.input_tokens} in / ${u.output_tokens} out tokens)`);
  return { ...response.parsed_output, accn, url, reviewed: new Date().toISOString().slice(0, 10), model: response.model };
}

// ---------- Main ----------
async function main() {
  const db = await loadDb();
  const symbols = await loadSymbols(db);
  const tickers = await secJSON("https://www.sec.gov/files/company_tickers.json");
  const cikOf = {}, titleOf = {};
  for (const t of Object.values(tickers)) { cikOf[t.ticker.toUpperCase()] = t.cik_str; titleOf[t.ticker.toUpperCase()] = t.title; }

  let previous = {};
  if (existsSync(OUT)) { try { previous = JSON.parse(await readFile(OUT, "utf8")).stocks || {}; } catch {} }

  const funds = await fundHoldings();
  const stocks = {}, skipped = {};
  let aiErrors = 0;
  for (const sym of symbols) {
    const names = [db[sym]?.name, titleOf[sym]].filter(Boolean);
    const fundList = heldBy(funds, sym, names);
    const cik = cikOf[sym] ?? cikOf[sym.replace(".", "-")];
    if (!cik) { skipped[sym] = "Not in the SEC's company list"; if (fundList.length) stocks[sym] = { name: db[sym]?.name || sym, heldBy: fundList, noFilings: true }; continue; }
    try {
      const data = await secJSON(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`);
      if (!data.facts?.["us-gaap"]) {
        skipped[sym] = "Files under IFRS (foreign company), so its figures aren't in this format";
        if (fundList.length) stocks[sym] = { name: data.entityName, cik, heldBy: fundList, noFilings: true };
        continue;
      }
      const f = financials(data.facts);
      if (f.error) { skipped[sym] = f.error; if (fundList.length) stocks[sym] = { name: data.entityName, cik, heldBy: fundList, noFilings: true }; continue; }
      const mv = await marketValues(sym, f);
      if (!mv.marketCap) f.missing.push("market value");
      if (!mv.avg36) f.missing.push(mv.avg24 ? "36-month price history" : "price history");
      const methods = screen(f, mv);
      let ai = null;
      try { ai = await aiReview(sym, data.entityName, cik, previous[sym]); }
      catch (e) { aiErrors++; console.log(`${sym}: 10-K review failed: ${e.message}`); ai = previous[sym]?.ai || null; }

      const entry = {
        name: data.entityName, cik,
        asOf: f.asOf, revenueYearEnd: f.revenueYearEnd, form: f.form, filed: f.filed,
        filingUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${f.accn.replace(/-/g, "")}/`,
        values: { revenue: f.revenue, interestIncome: f.interestIncome, debt: f.debt, cashAndSecurities: f.cash, receivables: f.receivables,
          totalAssets: f.assets, shares: f.shares, marketCap: mv.marketCap, avgMarketCap24: mv.avg24, avgMarketCap36: mv.avg36, price: mv.price },
        interestBasis: f.interestBasis,
        methods,
        missing: f.missing,
        marketValueSources: mv.sources,
        heldBy: fundList,
        ai,
        tags: f.tags,
        notes: f.notes,
      };
      const hist = (previous[sym]?.history || []).filter(h => h.asOf !== f.asOf);
      hist.push({ asOf: f.asOf, checked: new Date().toISOString().slice(0, 10), results: Object.fromEntries(Object.entries(methods).map(([k, m]) => [k, m.result])) });
      entry.history = hist.sort((a, b) => a.asOf.localeCompare(b.asOf)).slice(-24);
      stocks[sym] = entry;
      const res = Object.entries(methods).map(([k, m]) => `${k}:${m.result}`).join(" ");
      console.log(`${sym.padEnd(6)} ${res}  funds:${fundList.join(",") || "-"}${f.missing.length ? `  missing:${f.missing.join(",")}` : ""}`);
    } catch (e) {
      skipped[sym] = `Error: ${e.message}`;
      if (previous[sym]) stocks[sym] = { ...previous[sym], stale: true };
      console.log(`${sym.padEnd(6)} skip ${e.message}`);
    }
  }

  await mkdir(`${ROOT}data`, { recursive: true });
  const out = {
    generated: new Date().toISOString(),
    method: "Financial screens from SEC XBRL filings under four published methodologies; fund holdings from SEC N-PORT filings; optional 10-K review by Claude.",
    methods: Object.fromEntries(Object.entries(METHODS).map(([k, m]) => [k, { name: m.name, baseLabel: m.baseLabel, limits: m.limits }])),
    funds: Object.fromEntries(Object.entries(funds).map(([k, f]) => [k, { asOf: f.asOf, filed: f.filed, url: f.url, count: f.count }])),
    stocks, skipped,
  };
  await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`\nWrote ${Object.keys(stocks).length} stocks, skipped ${Object.keys(skipped).length}${aiErrors ? `, ${aiErrors} 10-K reviews failed` : ""}.`);
  for (const [s, why] of Object.entries(skipped)) console.log(`  skipped ${s}: ${why}`);
  if (!Object.keys(stocks).length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });

/* Sharee'ah Stock Tracker - main app */
(() => {
  const STORE_KEY = "shariah-tracker-v1";
  const KEY_STORE = "shariah-tracker-finnhub-key";

  const TD_KEY_STORE = "shariah-tracker-twelvedata-key";

  // Chart colors come from the CSS tokens so they follow light/dark mode
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const list = (name) => css(name).split(",").map(x => x.trim()).filter(Boolean);
  const COLORS = {
    get halal() { return css("--halal"); },
    get doubtful() { return css("--doubtful"); },
    get haram() { return css("--haram"); },
    get okShades() { return list("--ok-shades"); },
    get badShades() { return list("--bad-shades"); },
    get ink() { return css("--ink-2"); },
    get muted() { return css("--muted"); },
  };
  const STATUS_LABEL = { halal: "✓ Halal", doubtful: "! Doubtful", haram: "✕ Not compliant" };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = Charts.escapeHtml;
  const money = (n, sign = false) => {
    if (n == null || isNaN(n)) return "-";
    n = Math.round(n * 100) / 100;
    const s = Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
    return n < 0 ? `-${s}` : (sign && n > 0 ? `+${s}` : s);
  };
  const pct = (n, sign = true) => (n == null || isNaN(n)) ? "-" : `${sign && n > 0 ? "+" : ""}${n.toFixed(2)}%`;
  const today = () => new Date().toISOString().slice(0, 10);
  const trend = (n) => n > 0 ? "up" : n < 0 ? "down" : "";

  // In-page messages and confirmations (browser dialogs are blocked in some embeds)
  let toastTimer;
  function toast(msg, kind = "") {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg;
    el.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
  }
  // First click arms the button, second click within 3s confirms
  function armed(btn, label) {
    if (btn.dataset.armed) return true;
    const old = btn.innerHTML;
    btn.dataset.armed = "1";
    btn.classList.add("armed");
    btn.innerHTML = label;
    setTimeout(() => { delete btn.dataset.armed; btn.classList.remove("armed"); btn.innerHTML = old; }, 3000);
    return false;
  }

  // ---------------- State ----------------
  let state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Array.isArray(s.holdings)) return { overrides: {}, profiles: {}, income: [], zakat: {}, sales: [], imported: {}, ...s };
    } catch {}
    return blankState();
  }
  function blankState() {
    return { holdings: [], income: [], overrides: {}, profiles: {}, zakat: {}, sales: [], imported: {} };
  }
  // A holding stays in state after it's fully sold so its history still counts
  const isOpen = (h) => h.shares > 1e-9;
  const openHoldings = () => state.holdings.filter(isOpen);
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
  }

  function screening(sym) {
    const p = state.profiles[sym] || {};
    let rec = screenStock(sym, p.name, p.industry);
    // A "halal" label must agree with the numbers: 5% or more impermissible revenue can't be fully halal
    const imp = impermissiblePct(rec);
    if (rec.status === "halal" && imp != null && imp >= 5) {
      rec = { ...rec, status: "doubtful", reason: `${rec.reason} Impermissible revenue is about ${imp.toFixed(1)}%, at or above the 5% limit.` };
    }
    const o = state.overrides[sym];
    if (o) return { ...rec, status: o, overridden: true };
    return rec;
  }

  // ---------------- Tabs ----------------
  $$(".tab").forEach(btn => btn.addEventListener("click", () => {
    $$(".tab").forEach(b => { b.classList.toggle("active", b === btn); b.setAttribute("aria-selected", b === btn); });
    $$(".panel").forEach(p => {
      const on = p.id === `tab-${btn.dataset.tab}`;
      p.hidden = !on; p.classList.toggle("active", on);
    });
    try { localStorage.setItem("shariah-tracker-tab", btn.dataset.tab); } catch {}
  }));
  try {
    const t = localStorage.getItem("shariah-tracker-tab");
    if (t) $(`.tab[data-tab="${t}"]`)?.click();
  } catch {}

  // ---------------- Feed status ----------------
  PriceFeed.onStatus(({ mode, text }) => {
    const el = $("#feedStatus");
    el.className = `feed-status ${mode}`;
    $(".text", el).textContent = text;
  });

  // ---------------- Portfolio ----------------
  let group = "holding";
  $$(".seg-toggle button").forEach(b => b.addEventListener("click", () => {
    group = b.dataset.group;
    $$(".seg-toggle button").forEach(x => x.classList.toggle("active", x === b));
    renderChart();
  }));

  function computeRows() {
    return openHoldings().map(h => {
      const q = PriceFeed.get(h.symbol);
      const price = q?.price;
      const value = price != null ? price * h.shares : null;
      const pl = value != null ? value - h.invested : null;
      const dayPL = q ? q.change * h.shares : null;
      return { h, q, price, value, pl, dayPL, scr: screening(h.symbol) };
    });
  }

  function renderKpis(rows) {
    const invested = rows.reduce((s, r) => s + r.h.invested, 0);
    const value = rows.reduce((s, r) => s + (r.value ?? r.h.invested), 0);
    const day = rows.reduce((s, r) => s + (r.dayPL ?? 0), 0);
    const pl = value - invested;
    const halal = rows.filter(r => r.scr.status === "halal").reduce((s, r) => s + (r.value ?? r.h.invested), 0);

    $("#kpiInvested").textContent = money(invested);
    $("#kpiValue").textContent = money(value);
    const dayEl = $("#kpiDay");
    dayEl.textContent = rows.length ? `${money(day, true)} today` : "";
    dayEl.className = `kpi-sub ${trend(day)}`;
    const plEl = $("#kpiPL");
    plEl.textContent = money(pl, true);
    plEl.className = `kpi-value ${trend(pl)}`;
    const plp = $("#kpiPLPct");
    plp.textContent = invested ? pct((pl / invested) * 100) : "";
    plp.className = `kpi-sub ${trend(pl)}`;

    const halalPct = value ? (halal / value) * 100 : null;
    const hEl = $("#kpiHalal");
    hEl.textContent = halalPct == null ? "-" : `${halalPct.toFixed(0)}%`;
    hEl.className = `kpi-value ${halalPct == null ? "" : halalPct >= 99.5 ? "up" : halalPct >= 80 ? "warn" : "down"}`;
    $("#kpiHalalSub").textContent = halalPct == null ? "of portfolio value"
      : halalPct >= 99.5 ? "fully compliant portfolio" : "of value is in compliant stocks";
    $("#zStockVal").textContent = money(value);
    return value;
  }

  function renderChart() {
    const rows = computeRows();
    const total = rows.reduce((s, r) => s + (r.value ?? r.h.invested), 0);
    let segs;
    if (group === "status") {
      segs = ["halal", "doubtful", "haram"].map(st => ({
        label: STATUS_LABEL[st], color: COLORS[st], status: st,
        value: rows.filter(r => r.scr.status === st).reduce((s, r) => s + (r.value ?? r.h.invested), 0),
      })).filter(s => s.value > 0);
    } else {
      // Group by status so greens sit together, then by size
      const order = { halal: 0, doubtful: 1, haram: 2 };
      segs = rows.map(r => ({
        label: `${r.h.symbol} - ${r.scr.name}`, short: r.h.symbol, color: COLORS[r.scr.status], status: r.scr.status,
        value: r.value ?? r.h.invested, sym: r.h.symbol,
      })).sort((a, b) => order[a.status] - order[b.status] || b.value - a.value);
    }
    segs.forEach(s => s.detail = money(s.value));
    Charts.donut($("#allocChart"), segs, {
      center: money(total), sub: rows.length ? `${rows.length} holding${rows.length > 1 ? "s" : ""}` : "No holdings",
      ariaLabel: "Portfolio allocation",
    });
    $("#allocLegend").innerHTML = segs.map(s => `
      <li ${s.sym ? `data-sym="${esc(s.sym)}" tabindex="0"` : ""}>
        <span class="swatch" style="background:${s.color}"></span>
        <span class="lg-label">${esc(s.short || s.label)}</span>
        <span class="pill sm ${s.status}">${STATUS_LABEL[s.status].split(" ")[0]}</span>
        <span class="lg-val">${total ? ((s.value / total) * 100).toFixed(1) : 0}%</span>
      </li>`).join("");
    $$("#allocLegend li[data-sym]").forEach(li => li.addEventListener("click", () => openDetails(li.dataset.sym)));
  }

  function renderHoldings() {
    const rows = computeRows();
    const total = renderKpis(rows);
    $("#holdingsEmpty").hidden = rows.length > 0;
    $("#exampleBanner").hidden = !openHoldings().some(h => h.example);
    rows.sort((a, b) => (b.value ?? b.h.invested) - (a.value ?? a.h.invested));
    $("#holdingsBody").innerHTML = rows.map(r => {
      const st = r.scr.status;
      const w = total ? ((r.value ?? r.h.invested) / total) * 100 : 0;
      const flash = r.q && Date.now() - r.q.time < 1200 ? (r.q.direction > 0 ? "flash-up" : r.q.direction < 0 ? "flash-down" : "") : "";
      return `<tr class="row-${st}" data-sym="${esc(r.h.symbol)}">
        <td><button class="link sym" data-act="details"><strong>${esc(r.h.symbol)}</strong><span>${esc(r.scr.name)}</span></button>${r.h.example ? '<span class="tag">Example</span>' : ""}</td>
        <td><span class="pill ${st}">${STATUS_LABEL[st]}</span></td>
        <td class="num ${flash}">${r.price != null ? money(r.price) : '<span class="muted">loading…</span>'}</td>
        <td class="num ${trend(r.q?.change)}">${r.q ? pct(r.q.changePct) : "-"}</td>
        <td class="num">${r.h.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
        <td class="num">${money(r.h.invested)}</td>
        <td class="num">${money(r.value)}</td>
        <td class="num ${trend(r.pl)}">${money(r.pl, true)}<span class="sub">${r.pl != null ? pct((r.pl / r.h.invested) * 100) : ""}</span></td>
        <td class="num">${w.toFixed(1)}%</td>
        <td class="actions"><button class="btn sm sell-btn" data-act="sell">Sell</button><button class="icon-btn" data-act="remove" title="Remove ${esc(r.h.symbol)}" aria-label="Remove ${esc(r.h.symbol)}">🗑</button></td>
      </tr>`;
    }).join("");
  }

  $("#holdingsBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const sym = btn.closest("tr").dataset.sym;
    if (btn.dataset.act === "details") openDetails(sym);
    if (btn.dataset.act === "sell") openSell(sym);
    if (btn.dataset.act === "remove" && armed(btn, "Remove?")) {
      state.holdings = state.holdings.filter(h => h.symbol !== sym);
      state.sales = state.sales.filter(x => x.symbol !== sym);
      save(); syncFeed(); renderAll();
      toast(`Removed ${sym}`);
    }
  });

  // Re-render on price ticks, throttled to one frame
  let pending = false;
  let lastChart = 0;
  let lastPerf = 0;
  PriceFeed.onQuote((sym, q) => {
    if (PriceFeed.isLive()) History.record(sym, q.price);
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      renderHoldings();
      if (Date.now() - lastChart > 3000) { lastChart = Date.now(); renderChart(); }
      if (Date.now() - lastPerf > 15000) { lastPerf = Date.now(); renderPerf(); renderPL(); }
      renderZakat();
    });
  });

  // ---------------- Add form ----------------
  $("#tickerList").innerHTML = Object.entries(SHARIAH_DB)
    .map(([s, d]) => `<option value="${s}">${esc(d.name)}</option>`).join("");
  $("#fDate").value = today();

  let previewTimer;
  $("#fSymbol").addEventListener("input", () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 350);
  });

  async function updatePreview() {
    const sym = $("#fSymbol").value.trim().toUpperCase();
    const box = $("#fPreview"), warn = $("#fWarn");
    if (!sym) { box.hidden = true; warn.hidden = true; return; }
    await ensureProfile(sym);
    const scr = screening(sym);
    const q = await PriceFeed.quote(sym).catch(() => null);
    box.hidden = false;
    box.className = `preview ${scr.status}`;
    box.innerHTML = `<span class="pill ${scr.status}">${STATUS_LABEL[scr.status]}</span>
      <div><strong>${esc(scr.name)}</strong> · ${esc(scr.sector)}${q?.price ? ` · <span class="num">${money(q.price)}</span>` : ""}
      <p>${esc(scr.reason)}</p></div>`;
    if (q?.price && !$("#fPrice").value) $("#fPrice").placeholder = `${q.price} (current)`;
    warn.hidden = scr.status === "halal";
    warn.textContent = scr.status === "haram"
      ? "⚠ This stock is not Shariah compliant. You can still track it, but it will be marked red."
      : "⚠ Scholars and screeners disagree on this stock. Review before investing.";
  }

  async function ensureProfile(sym) {
    if (SHARIAH_DB[sym] || state.profiles[sym]) return;
    const p = await PriceFeed.profile(sym);
    if (p) { state.profiles[sym] = p; save(); }
  }

  $("#addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const sym = $("#fSymbol").value.trim().toUpperCase();
    const amount = parseFloat($("#fAmount").value);
    let price = parseFloat($("#fPrice").value);
    if (!sym || !(amount > 0)) return;
    await ensureProfile(sym);
    if (!(price > 0)) {
      const q = await PriceFeed.quote(sym).catch(() => null);
      price = q?.price;
    }
    if (!(price > 0)) { toast(`Couldn't find a price for ${sym}. Check the ticker or enter the buy price.`, "error"); return; }

    const scr = screening(sym);
    const shares = amount / price;
    const lot = { date: $("#fDate").value || today(), amount, price };
    const existing = state.holdings.find(h => h.symbol === sym);
    if (existing && !isOpen(existing)) existing.shares = 0;
    if (existing) {
      existing.shares += shares; existing.invested += amount; existing.lots.push(lot); delete existing.example;
    } else {
      state.holdings.push({ symbol: sym, name: scr.name, shares, invested: amount, lots: [lot] });
    }
    save(); syncFeed(); renderAll();
    toast(`Added ${money(amount)} of ${sym}`);
    e.target.reset();
    $("#fDate").value = today(); $("#fPrice").placeholder = "current price";
    $("#fPreview").hidden = true; $("#fWarn").hidden = true;
  });

  function syncFeed() {
    PriceFeed.track(openHoldings().map(h => h.symbol));
  }

  // ---------------- Example portfolio ----------------
  const EXAMPLES = [
    ["AAPL", 2500, 300, 0.82], ["NVDA", 3000, 240, 0.70], ["SPUS", 2000, 200, 0.90],
    ["MSFT", 1500, 150, 0.95], ["AMZN", 1000, 120, 0.97], ["JPM", 800, 90, 1.04], ["TSLA", 1200, 60, 1.15],
    ["META", 1000, 250, 0.74],
  ];
  // Example sales: [symbol, fraction sold, days ago, sale price as a share of the reference price]
  const EXAMPLE_SALES = [["META", 1, 20, 0.97], ["AAPL", 0.3, 45, 0.96]];
  function loadExamples() {
    state.holdings = EXAMPLES.map(([sym, amount, daysAgo, f]) => {
      const price = Math.round(SHARIAH_DB[sym].price * f * 100) / 100;
      const date = new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
      return { symbol: sym, name: SHARIAH_DB[sym].name, shares: amount / price, invested: amount, example: true, lots: [{ date, amount, price }] };
    });
    state.sales = state.sales.filter(x => !x.example);
    EXAMPLE_SALES.forEach(([sym, frac, daysAgo, f]) => {
      const h = state.holdings.find(x => x.symbol === sym);
      applySale(sym, h.shares * frac, Math.round(SHARIAH_DB[sym].price * f * 100) / 100, isoDaysAgo(daysAgo));
    });
    save(); syncFeed(); renderAll();
  }
  $("#loadExamples").addEventListener("click", loadExamples);
  $("#clearExamples").addEventListener("click", () => {
    const ex = new Set(state.holdings.filter(h => h.example).map(h => h.symbol));
    state.holdings = state.holdings.filter(h => !h.example);
    state.sales = state.sales.filter(x => !ex.has(x.symbol) || !x.example);
    save(); syncFeed(); renderAll();
    toast("Examples cleared. Add your first investment above.");
    $("#fSymbol").focus();
  });

  // ---------------- Details modal ----------------
  async function openDetails(sym) {
    sym = sym.toUpperCase();
    await ensureProfile(sym);
    const scr = screening(sym);
    const q = PriceFeed.get(sym) || await PriceFeed.quote(sym).catch(() => null);
    const held = openHoldings().find(h => h.symbol === sym);
    const imp = impermissiblePct(scr);
    const st = scr.status;

    let okI = 0, badI = 0;
    const segs = (scr.revenue || []).map(r => ({
      label: r.label, value: r.pct, ok: r.ok, detail: r.ok ? "Permissible" : "Impermissible",
      color: r.ok ? COLORS.okShades[okI++ % 4] : COLORS.badShades[badI++ % 4],
    }));

    $("#modalBody").innerHTML = `
      <div class="m-head">
        <div>
          <h2 id="mTitle">${esc(scr.name)} <span class="muted">${esc(sym)}</span></h2>
          <p class="muted">${esc(scr.sector)}${scr.source === "auto" ? " · auto-screened" : ""}${scr.overridden ? " · status set by you" : ""}</p>
        </div>
        <span class="pill lg ${st}">${STATUS_LABEL[st]}</span>
      </div>
      <div class="m-top">
        <div class="m-price-box">
          <span class="kpi-label">Price per share</span>
          <span class="big">${q?.price ? money(q.price) : "-"}</span>
          <span class="${trend(q?.change)}">${q ? `${money(q.change, true)} (${pct(q.changePct)}) today` : ""}</span>
          ${PriceFeed.isLive() ? "" : '<span class="hint">Demo price</span>'}
        </div>
        <div class="m-ratio">
          <span class="kpi-label">Halal / haram ratio · share of revenue</span>
          ${imp != null ? `
            <div class="ratio-bar" role="img" aria-label="Halal ${(100 - imp).toFixed(1)} percent, haram ${imp.toFixed(1)} percent">
              <span class="ok" style="width:${100 - imp}%"></span><span class="bad" style="width:${imp}%"></span>
            </div>
            <div class="ratio-legend"><span class="up">Halal ${(100 - imp).toFixed(1)}%</span><span class="down">Haram ${imp.toFixed(1)}%</span></div>
            <span class="hint">${imp < 5 ? "Under" : "Over"} the 5% limit · estimate, see breakdown below</span>`
          : `<p class="muted">No revenue breakdown for this stock yet, so the ratio can't be shown.</p>`}
        </div>
      </div>
      <div class="m-chart">
        <div class="card-head">
          <span class="card-sub" id="mChg"></span>
          <div class="seg-toggle" id="mRangeSel" role="group" aria-label="Price range">
            <button class="active" data-r="1d">1D</button><button data-r="7">1W</button><button data-r="30">1M</button>
            <button data-r="91">3M</button><button data-r="365">1Y</button><button data-r="all">All</button>
          </div>
        </div>
        <div id="mPriceChart" class="line-wrap sm"></div>
      </div>
      <p>${esc(scr.reason)}</p>
      <div class="m-grid">
        <div>
          <h3>What the company earns from</h3>
          ${segs.length ? `
            <div class="donut-wrap compact">
              <div id="revChart" class="chart sm"></div>
              <ul class="legend">${segs.map(s => `
                <li><span class="swatch" style="background:${s.color}"></span>
                <span class="lg-label">${esc(s.label)}</span>
                <span class="pill sm ${s.ok ? "halal" : "haram"}">${s.ok ? "✓" : "✕"}</span>
                <span class="lg-val">${s.value}%</span></li>`).join("")}
              </ul>
            </div>
            <p class="hint">Approximate revenue breakdown (estimate).</p>`
          : `<p class="muted">No revenue breakdown available for this ticker. Check it on a dedicated screener.</p>`}
        </div>
        <div>
          <h3>Screening</h3>
          ${imp != null ? `
            <div class="meter" role="img" aria-label="Impermissible revenue ${imp.toFixed(1)}% against a 5% limit">
              <div class="meter-fill ${imp < 5 ? "halal" : "haram"}" style="width:${Math.min(100, imp * 10)}%"></div>
              <div class="meter-limit" style="left:50%"><span>5% limit</span></div>
            </div>
            <p><strong>${imp.toFixed(1)}%</strong> impermissible revenue ${imp < 5 ? "- under the 5% limit" : "- over the 5% limit"}</p>
            ${imp > 0 && imp < 5 && st !== "haram" ? `<p class="purify">Purification: give <strong>${imp.toFixed(1)}%</strong> of any dividends from ${esc(sym)} to charity.</p>` : ""}` : ""}
          <ul class="thresholds">${SHARIAH_THRESHOLDS.map(t => `<li><span>${esc(t.label)}</span><span class="muted">${esc(t.limit)}</span></li>`).join("")}</ul>
          ${held ? `<p>You hold <strong>${held.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</strong> shares · invested ${money(held.invested)}${q?.price ? ` · now ${money(held.shares * q.price)}` : ""}</p>` : ""}
          <label class="override">Set status yourself
            <select id="mOverride">
              <option value="">Use default</option>
              <option value="halal" ${state.overrides[sym] === "halal" ? "selected" : ""}>✓ Halal</option>
              <option value="doubtful" ${state.overrides[sym] === "doubtful" ? "selected" : ""}>! Doubtful</option>
              <option value="haram" ${state.overrides[sym] === "haram" ? "selected" : ""}>✕ Not compliant</option>
            </select>
          </label>
          ${held ? "" : `<button class="btn primary" id="mAdd">Add ${esc(sym)} to portfolio</button>`}
        </div>
      </div>`;

    const myModal = ++modalToken;
    let mR = "1d";
    const drawPrice = async () => {
      const demo = !PriceFeed.isLive();
      const cur = PriceFeed.get(sym) || q;
      let pts = [], baseline = null, src = "";
      if (mR === "1d") {
        const r = await History.intraday(sym, cur?.prevClose, cur?.price, demo);
        pts = r.points; baseline = cur?.prevClose ?? null; src = r.source;
      } else {
        const from = isoDaysAgo(mR === "all" ? 1100 : +mR);
        const r = await History.stockSeries(sym, from, [], cur?.price, demo);
        pts = r.points.filter(p => p[0] >= from); src = r.source;
      }
      if (myModal !== modalToken || $("#modal").hidden) return;
      const ref = baseline ?? pts[0]?.[1], last = pts.at(-1)?.[1];
      const change = last != null && ref ? last - ref : 0;
      Charts.line($("#mPriceChart"), [{ label: sym, color: change >= 0 ? COLORS.halal : COLORS.haram, points: pts, area: true }], {
        height: 220, endLabels: false, baseline, format: v => money(v), axisFormat: v => money(v),
        ariaLabel: `${sym} price`, empty: src === "recorded" ? "Add a free Twelve Data key in Settings to see price history." : "No price data yet.",
      });
      $("#mChg").innerHTML = pts.length > 1 ? `<span class="${trend(change)}">${money(change, true)} (${pct(ref ? (change / ref) * 100 : 0)})</span> ${RANGE_NAME[mR]}` : "";
    };
    $$("#mRangeSel button").forEach(b => b.addEventListener("click", () => {
      mR = b.dataset.r;
      $$("#mRangeSel button").forEach(x => x.classList.toggle("active", x === b));
      drawPrice();
    }));

    if (segs.length) Charts.donut($("#revChart"), segs, {
      size: 200, center: imp != null ? `${(100 - imp).toFixed(1)}%` : "", sub: "permissible", ariaLabel: `${sym} revenue breakdown`,
    });
    $("#mOverride").addEventListener("change", (e) => {
      if (e.target.value) state.overrides[sym] = e.target.value; else delete state.overrides[sym];
      save(); renderAll(); openDetails(sym);
    });
    $("#mAdd")?.addEventListener("click", () => {
      closeModal();
      $('.tab[data-tab="portfolio"]').click();
      $("#fSymbol").value = sym; updatePreview(); $("#fAmount").focus();
    });
    $("#modal").hidden = false;
    $("#modalClose").focus();
    drawPrice();
  }
  let modalToken = 0;
  const RANGE_NAME = { "1d": "today", 7: "past week", 30: "past month", 91: "past 3 months", 182: "past 6 months", 365: "past year", all: "all time" };
  function closeModal() { $("#modal").hidden = true; }
  $("#modalClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // ---------------- Screener ----------------
  let screenFilter = "all";
  function renderScreener() {
    const items = Object.keys(SHARIAH_DB).map(screening)
      .filter(s => screenFilter === "all" || s.status === screenFilter);
    $("#screenGrid").innerHTML = items.map(s => {
      const imp = impermissiblePct(s);
      return `<button class="screen-card ${s.status}" data-sym="${esc(s.symbol)}">
        <span class="sc-top"><strong>${esc(s.symbol)}</strong><span class="pill sm ${s.status}">${STATUS_LABEL[s.status]}</span></span>
        <span class="sc-name">${esc(s.name)}</span>
        ${(() => { const q = PriceFeed.get(s.symbol); return q ? `<span class="sc-price"><strong>${money(q.price)}</strong> <span class="${trend(q.change)}">${pct(q.changePct)} today</span></span>` : '<span class="sc-price muted">Price loading…</span>'; })()}
        <span class="muted">${esc(s.sector)}${imp != null ? ` · ${imp.toFixed(1)}% impermissible` : ""}</span>
      </button>`;
    }).join("");
  }
  // Fetch a price for every stock in the screener once per visit (spaced out to respect Finnhub's free limit)
  let screenerFetching = false;
  async function loadScreenerPrices() {
    if (screenerFetching) return;
    screenerFetching = true;
    const missing = Object.keys(SHARIAH_DB).filter(sym => !PriceFeed.get(sym));
    for (const sym of missing) {
      await PriceFeed.quote(sym).catch(() => null);
      if (PriceFeed.isLive()) { renderScreener(); await new Promise(r => setTimeout(r, 1100)); }
    }
    renderScreener();
    screenerFetching = false;
  }
  $('.tab[data-tab="screener"]').addEventListener("click", loadScreenerPrices);

  $("#screenGrid").addEventListener("click", (e) => {
    const c = e.target.closest(".screen-card");
    if (c) openDetails(c.dataset.sym);
  });
  $$("#screenFilters button").forEach(b => b.addEventListener("click", () => {
    screenFilter = b.dataset.f;
    $$("#screenFilters button").forEach(x => x.classList.toggle("active", x === b));
    renderScreener();
  }));
  $("#screenForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const sym = $("#sSymbol").value.trim();
    if (sym) openDetails(sym);
  });

  // ---------------- Income ----------------
  $("#iDate").value = today();
  $("#iCat").addEventListener("change", updateIncSym);
  function updateIncSym() {
    const isDiv = $("#iCat").value === "Dividend";
    $("#iSymWrap").hidden = !isDiv;
    $("#iSym").innerHTML = `<option value="">- not linked -</option>` +
      state.holdings.map(h => `<option value="${esc(h.symbol)}">${esc(h.symbol)} - ${esc(h.name)}</option>`).join("");
  }

  function purifyAmount(entry) {
    if (entry.category !== "Dividend" || !entry.symbol) return 0;
    const scr = screening(entry.symbol);
    if (scr.status === "haram") return entry.amount; // all income from a non-compliant stock
    const imp = impermissiblePct(scr);
    return imp ? entry.amount * imp / 100 : 0;
  }

  $("#incForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat($("#iAmount").value);
    if (!(amount > 0)) return;
    state.income.push({
      id: Date.now(), source: $("#iSource").value.trim(), category: $("#iCat").value,
      symbol: $("#iCat").value === "Dividend" ? $("#iSym").value : "", amount, date: $("#iDate").value || today(),
    });
    save(); renderIncome();
    e.target.reset(); $("#iDate").value = today(); updateIncSym();
  });

  $("#incBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-del]");
    if (!btn) return;
    state.income = state.income.filter(i => String(i.id) !== btn.dataset.del);
    save(); renderIncome();
  });

  function renderIncome() {
    const list = [...state.income].sort((a, b) => b.date.localeCompare(a.date));
    const month = today().slice(0, 7);
    const sum = (arr) => arr.reduce((s, i) => s + i.amount, 0);
    $("#incTotal").textContent = money(sum(list));
    $("#incMonth").textContent = money(sum(list.filter(i => i.date.startsWith(month))));
    $("#incDiv").textContent = money(sum(list.filter(i => i.category === "Dividend")));
    $("#incPurify").textContent = money(list.reduce((s, i) => s + purifyAmount(i), 0));
    $("#incEmpty").hidden = list.length > 0;
    $("#incBody").innerHTML = list.map(i => {
      const p = purifyAmount(i);
      return `<tr>
        <td>${esc(i.date)}</td>
        <td>${esc(i.source)}${i.symbol ? ` <span class="pill sm ${screening(i.symbol).status}">${esc(i.symbol)}</span>` : ""}</td>
        <td>${esc(i.category)}</td>
        <td class="num">${money(i.amount)}</td>
        <td class="num ${p ? "down" : "muted"}">${p ? money(p) : "-"}</td>
        <td class="actions"><button class="icon-btn" data-del="${i.id}" aria-label="Delete entry">🗑</button></td>
      </tr>`;
    }).join("");
  }

  // ---------------- Zakat ----------------
  const zFields = ["zCash", "zGold", "zDebt", "zNisab"];
  zFields.forEach(id => { if (state.zakat[id] != null) $(`#${id}`).value = state.zakat[id]; });
  if (state.zakat.zStocks != null) $("#zStocks").checked = state.zakat.zStocks;
  $("#zakatForm").addEventListener("input", () => {
    zFields.forEach(id => state.zakat[id] = parseFloat($(`#${id}`).value) || 0);
    state.zakat.zStocks = $("#zStocks").checked;
    save(); renderZakat();
  });

  function renderZakat() {
    const v = (id) => parseFloat($(`#${id}`).value) || 0;
    const stocks = $("#zStocks").checked ? computeRows().reduce((s, r) => s + (r.value ?? r.h.invested), 0) : 0;
    const wealth = Math.max(0, v("zCash") + v("zGold") + stocks - v("zDebt"));
    const nisab = v("zNisab");
    const due = wealth >= nisab && wealth > 0 ? wealth * 0.025 : 0;
    $("#zGoldN").textContent = perGram("gold") ? money(perGram("gold") * 85) : "-";
    $("#zSilverN").textContent = perGram("silver") ? money(perGram("silver") * 595) : "-";
    $("#zWealth").textContent = money(wealth);
    $("#zDue").textContent = money(due);
    $("#zNote").textContent = wealth < nisab
      ? `Below nisab (${money(nisab)}) - no zakat due. Set nisab to today's value of 85g of gold.`
      : "Zakat applies once wealth above nisab has been held for one lunar year. Set nisab to today's value of 85g of gold.";
  }

  // ---------------- Growth & loss ----------------
  const DAY = 864e5;
  const isoDaysAgo = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
  let perfRange = "all", perfPick = "all", perfToken = 0;

  $$("#perfRange button").forEach(b => b.addEventListener("click", () => {
    perfRange = b.dataset.r;
    $$("#perfRange button").forEach(x => x.classList.toggle("active", x === b));
    renderPerf();
  }));
  $("#perfPick").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    perfPick = b.dataset.p;
    renderPerf();
  });

  async function renderPerf() {
    const token = ++perfToken;
    const holdings = state.holdings;
    if (perfPick !== "all" && !holdings.some(h => h.symbol === perfPick)) perfPick = "all";
    $("#perfPick").innerHTML = holdings.length ? [["all", "Whole portfolio"], ...holdings.map(h => [h.symbol, h.symbol])]
      .map(([p, l]) => `<button class="chip ${p === perfPick ? "active" : ""}" data-p="${esc(p)}">${esc(l)}</button>`).join("") : "";

    const pick = perfPick === "all" ? holdings : holdings.filter(h => h.symbol === perfPick);
    if (!pick.length) {
      Charts.line($("#perfChart"), [], { empty: "Add investments to see how they grow over time." });
      $("#perfSummary").textContent = ""; $("#perfSource").textContent = ""; $("#perfBars").innerHTML = "";
      return;
    }
    if (perfRange === "1d") {
      const day = await intradayPortfolio(pick.filter(isOpen));
      if (token !== perfToken) return;
      const last = day.pts.at(-1)?.[1] ?? day.prevValue, change = last - day.prevValue;
      const label = perfPick === "all" ? "Portfolio value" : `${perfPick} value`;
      Charts.line($("#perfChart"), [
        { label, short: "Value", color: change >= 0 ? COLORS.halal : COLORS.haram, points: day.pts, area: true },
      ], { format: v => money(v), axisFormat: v => compact(v), baseline: day.prevValue, ariaLabel: `${label} today`,
        empty: "No prices recorded today yet. Add a Twelve Data key in Settings for a full 1-day chart." });
      $("#perfSummary").innerHTML = day.pts.length ? `<span class="${trend(change)}">${money(change, true)} (${pct(day.prevValue ? (change / day.prevValue) * 100 : 0)})</span> today` : "";
      $("#perfSource").textContent = day.sources.has("twelve") ? "5-minute prices from Twelve Data. Dashed line = yesterday's close."
        : day.sources.has("demo") ? "Simulated demo prices. Dashed line = yesterday's close."
        : "Built from prices recorded since you opened the app today. Dashed line = yesterday's close.";
      renderReturnBars();
      return;
    }
    const hist = await portfolioHistory(pick);
    if (token !== perfToken) return;
    const results = hist.results;
    const start = perfRange === "all" ? hist.days[0]?.d : isoDaysAgo(+perfRange);
    const days = hist.days.filter(x => x.owned && x.d >= start);
    const valuePts = days.map(x => [x.d, x.value]), investedPts = days.map(x => [x.d, x.cost]);

    const endV = valuePts.at(-1)?.[1] ?? 0, endI = investedPts.at(-1)?.[1] ?? 0;
    const startGain = valuePts.length ? valuePts[0][1] - investedPts[0][1] : 0;
    const rangeGain = (endV - endI) - (perfRange === "all" ? 0 : startGain);
    const up = rangeGain >= 0;
    const label = perfPick === "all" ? "Portfolio value" : `${perfPick} value`;
    Charts.line($("#perfChart"), [
      { label, short: "Value", color: up ? COLORS.halal : COLORS.haram, points: valuePts, area: true },
      { label: "Amount invested", short: "Invested", color: COLORS.muted, points: investedPts, dashed: true },
    ], { format: v => money(v), axisFormat: v => compact(v), ariaLabel: `${label} over time`, empty: "No price history in this range yet." });

    const rangeName = perfRange === "all" ? "since you invested" : RANGE_NAME[perfRange];
    const base = perfRange === "all" ? endI : (valuePts[0]?.[1] || endI);
    $("#perfSummary").innerHTML = valuePts.length
      ? `<span class="${up ? "up" : "down"}">${money(rangeGain, true)} (${pct(base ? (rangeGain / base) * 100 : 0)})</span> ${rangeName}`
      : "";

    const src = new Set(results.map(r => r.source));
    $("#perfSource").textContent = src.has("twelve") ? "Daily closing prices from Twelve Data."
      : src.has("demo") ? "Simulated demo history. Add API keys in Settings to see your real performance."
      : "Built from prices recorded while the app is open. Add a free Twelve Data key in Settings for full daily history.";

    renderReturnBars();
  }

  // Return by stock: diverging bars around 0%
  function renderReturnBars() {
    const rets = computeRows().map(r => ({ sym: r.h.symbol, st: r.scr.status, v: r.pl != null ? (r.pl / r.h.invested) * 100 : 0, pl: r.pl }))
      .sort((a, b) => b.v - a.v);
    const maxAbs = Math.max(1, ...rets.map(r => Math.abs(r.v)));
    $("#perfBars").innerHTML = rets.map(r => {
      const w = (Math.abs(r.v) / maxAbs) * 50;
      return `<div class="bar-row" title="${esc(r.sym)}: ${pct(r.v)} (${money(r.pl, true)})">
        <span class="bar-label"><span class="dot ${r.st}"></span>${esc(r.sym)}</span>
        <span class="bar-track"><span class="bar-zero"></span><span class="bar ${r.v >= 0 ? "pos" : "neg"}" style="${r.v >= 0 ? "left:50%" : `left:${50 - w}%`};width:${w}%"></span></span>
        <span class="bar-val ${trend(r.v)}">${pct(r.v)}</span>
      </div>`;
    }).join("");
  }
  const compact = (v) => (v < 0 ? "-$" : "$") + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(v));

  /*
   * Day-by-day value and remaining cost basis for a set of holdings,
   * accounting for every buy (lot) and sale up to that day.
   */
  async function portfolioHistory(holdings) {
    const demo = !PriceFeed.isLive();
    const results = await Promise.all(holdings.map(h => {
      const sales = state.sales.filter(x => x.symbol === h.symbol);
      const anchors = [...h.lots, ...sales.map(x => ({ date: x.date, price: x.price }))];
      const first = anchors.map(l => l.date).sort()[0];
      const current = isOpen(h) ? PriceFeed.get(h.symbol)?.price : null;
      return History.stockSeries(h.symbol, first, anchors, current, demo).then(r => ({ h, sales, ...r }));
    }));
    const dates = [...new Set([
      ...results.flatMap(r => r.points.map(p => p[0])),
      ...results.flatMap(r => r.sales.map(x => x.date)),
    ])].sort();
    const cursor = results.map(() => ({ i: 0, last: null }));
    const days = dates.map(d => {
      let value = 0, cost = 0, owned = false;
      results.forEach((r, k) => {
        const c = cursor[k];
        while (c.i < r.points.length && r.points[c.i][0] <= d) c.last = r.points[c.i++][1];
        let shares = 0, basis = 0;
        r.h.lots.forEach(l => { if (l.date <= d) { shares += l.amount / l.price; basis += l.amount; } });
        r.sales.forEach(x => { if (x.date <= d) { shares -= x.shares; basis -= x.cost ?? 0; } });
        if (shares > 1e-9) { cost += basis; owned = true; if (c.last != null) value += shares * c.last; }
      });
      return { d, value, cost, owned };
    });
    return { results, days };
  }

  /* Today's value path for a set of open holdings, plus yesterday's closing value. */
  async function intradayPortfolio(holdings) {
    const demo = !PriceFeed.isLive();
    const parts = await Promise.all(holdings.map(async h => {
      const q = PriceFeed.get(h.symbol);
      const r = await History.intraday(h.symbol, q?.prevClose, q?.price, demo);
      return { h, q, ...r };
    }));
    const stamps = [...new Set(parts.flatMap(p => p.points.map(x => x[0])))].sort();
    const cur = parts.map(() => ({ i: 0, last: null }));
    const pts = stamps.map(ts => {
      let v = 0;
      parts.forEach((p, k) => {
        const c = cur[k];
        while (c.i < p.points.length && p.points[c.i][0] <= ts) c.last = p.points[c.i++][1];
        v += p.h.shares * (c.last ?? p.q?.prevClose ?? p.points[0]?.[1] ?? 0);
      });
      return [ts, v];
    });
    const prevValue = parts.reduce((s, p) => s + p.h.shares * (p.q?.prevClose ?? p.points[0]?.[1] ?? 0), 0);
    const cost = holdings.reduce((s, h) => s + h.invested, 0);
    return { pts, prevValue, cost, sources: new Set(parts.map(p => p.source)) };
  }

  // ---------------- Selling ----------------
  function applySale(sym, shares, price, date, extra = {}) {
    const h = state.holdings.find(x => x.symbol === sym);
    if (!h || !(shares > 0) || !(price > 0)) return null;
    shares = Math.min(shares, h.shares);
    const cost = (h.invested / h.shares) * shares; // average cost method
    h.shares -= shares; h.invested -= cost;
    if (h.shares < 1e-9) { h.shares = 0; h.invested = 0; }
    const sale = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, symbol: sym, name: h.name, date, shares, price,
      proceeds: shares * price, cost, gain: shares * price - cost, ...(h.example ? { example: true } : {}), ...extra };
    state.sales.push(sale);
    return sale;
  }

  function openSell(sym) {
    const h = openHoldings().find(x => x.symbol === sym);
    if (!h) return;
    const q = PriceFeed.get(sym);
    const avg = h.invested / h.shares;
    $("#modalBody").innerHTML = `
      <div class="m-head"><div><h2 id="mTitle">Sell ${esc(sym)}</h2><p class="muted">${esc(h.name)} · you hold ${fmtShares(h.shares)} shares · average cost ${money(avg)}</p></div></div>
      <form id="sellForm" class="form" autocomplete="off">
        <div class="row">
          <label>Shares to sell
            <input id="sShares" type="number" min="0.000001" step="any" max="${h.shares}" required>
          </label>
          <label>Sale price per share ($)
            <input id="sPrice" type="number" min="0.0001" step="any" value="${q?.price ?? ""}" required>
          </label>
          <label>Date
            <input id="sDate" type="date" value="${today()}" required>
          </label>
        </div>
        <div class="btn-row"><button type="button" class="btn sm" id="sAll">Sell all ${fmtShares(h.shares)}</button><button type="button" class="btn sm" id="sHalf">Sell half</button></div>
        <div class="sell-preview" id="sPreview"></div>
        <p class="hint">This records a sale you made at your broker. It does not place an order.</p>
        <button type="submit" class="btn primary">Record sale</button>
      </form>`;
    const upd = () => {
      const n = Math.min(parseFloat($("#sShares").value) || 0, h.shares), p = parseFloat($("#sPrice").value) || 0;
      const gain = n * p - n * avg;
      $("#sPreview").innerHTML = n && p ? `<div><span class="kpi-label">Proceeds</span><strong>${money(n * p)}</strong></div>
        <div><span class="kpi-label">Cost</span><strong>${money(n * avg)}</strong></div>
        <div><span class="kpi-label">Profit / loss</span><strong class="${trend(gain)}">${money(gain, true)}</strong></div>` : "";
    };
    $("#sAll").addEventListener("click", () => { $("#sShares").value = h.shares; upd(); });
    $("#sHalf").addEventListener("click", () => { $("#sShares").value = +(h.shares / 2).toFixed(6); upd(); });
    $("#sellForm").addEventListener("input", upd);
    $("#sellForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const sale = applySale(sym, parseFloat($("#sShares").value), parseFloat($("#sPrice").value), $("#sDate").value || today());
      if (!sale) return;
      save(); syncFeed(); renderAll(); closeModal();
      toast(`Sold ${fmtShares(sale.shares)} ${sym} · ${money(sale.gain, true)}`);
    });
    $("#modal").hidden = false;
    $("#sShares").focus();
  }
  const fmtShares = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

  // ---------------- Profit & loss over time ----------------
  let plRange = "all", plToken = 0;
  $$("#plRange button").forEach(b => b.addEventListener("click", () => {
    plRange = b.dataset.r;
    $$("#plRange button").forEach(x => x.classList.toggle("active", x === b));
    renderPL();
  }));
  $("#salesBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-undo]");
    if (!btn || !armed(btn, "Undo?")) return;
    const sale = state.sales.find(x => x.id === btn.dataset.undo);
    const h = sale && state.holdings.find(x => x.symbol === sale.symbol);
    if (h && sale.cost != null) { h.shares += sale.shares; h.invested += sale.cost; }
    state.sales = state.sales.filter(x => x !== sale);
    save(); syncFeed(); renderAll();
    toast("Sale removed");
  });

  async function renderPL() {
    const token = ++plToken;
    const sales = [...state.sales].sort((a, b) => b.date.localeCompare(a.date));
    const realizedAll = sales.reduce((s, x) => s + (x.gain ?? 0), 0);
    const open = computeRows().reduce((s, r) => s + (r.pl ?? 0), 0);
    const sold = sales.reduce((s, x) => s + x.proceeds, 0);
    const setVal = (id, v, sign = true) => { const el = $(id); el.textContent = money(v, sign); el.className = `mini-val ${sign ? trend(v) : ""}`; };
    setVal("#plTotal", realizedAll + open); setVal("#plRealized", realizedAll); setVal("#plOpen", open); setVal("#plSold", sold, false);
    $("#plSoldSub").textContent = sales.length ? `${sales.length} sale${sales.length > 1 ? "s" : ""}` : "";

    $("#salesEmpty").hidden = sales.length > 0;
    $("#salesBody").innerHTML = sales.map(x => `<tr>
      <td class="nowrap">${esc(x.date)}</td>
      <td><strong>${esc(x.symbol)}</strong>${x.example ? ' <span class="tag">Example</span>' : ""}</td>
      <td class="num">${fmtShares(x.shares)}</td>
      <td class="num">${money(x.price)}</td>
      <td class="num">${money(x.proceeds)}</td>
      <td class="num">${x.cost != null ? money(x.cost) : '<span class="muted" title="No matching buy found">unknown</span>'}</td>
      <td class="num ${trend(x.gain)}">${x.gain != null ? money(x.gain, true) : "-"}</td>
      <td class="actions"><button class="icon-btn" data-undo="${esc(x.id)}" aria-label="Remove this sale">🗑</button></td>
    </tr>`).join("");

    if (!state.holdings.length) {
      Charts.line($("#plChart"), [], { empty: "Add investments to track your profit and loss over time." });
      $("#plSummary").textContent = "";
      return;
    }
    if (plRange === "1d") {
      const day = await intradayPortfolio(openHoldings());
      if (token !== plToken) return;
      const base = realizedAll + day.prevValue - day.cost;
      const pts = day.pts.map(([ts, v]) => [ts, realizedAll + v - day.cost]);
      const change = (pts.at(-1)?.[1] ?? base) - base;
      Charts.line($("#plChart"), [
        { label: "Total profit / loss", short: "Total", color: change >= 0 ? COLORS.halal : COLORS.haram, points: pts, area: true },
      ], { format: v => money(v, true), axisFormat: v => compact(v), baseline: base, ariaLabel: "Profit and loss today",
        empty: "No prices recorded today yet. Add a Twelve Data key in Settings for a full 1-day chart." });
      $("#plSummary").innerHTML = pts.length ? `<span class="${trend(change)}">${money(change, true)}</span> today` : "";
      return;
    }
    const hist = await portfolioHistory(state.holdings);
    if (token !== plToken) return;
    const asc = [...state.sales].sort((a, b) => a.date.localeCompare(b.date));
    let i = 0, realized = 0;
    const start = plRange === "all" ? hist.days[0]?.d : isoDaysAgo(+plRange);
    const totalPts = [], realPts = [];
    for (const day of hist.days) {
      while (i < asc.length && asc[i].date <= day.d) realized += asc[i++].gain ?? 0;
      if (day.d < start) continue;
      totalPts.push([day.d, (day.owned ? day.value - day.cost : 0) + realized]);
      realPts.push([day.d, realized]);
    }
    // Make the line end on the live figure
    if (totalPts.length && totalPts.at(-1)[0] === today()) totalPts.at(-1)[1] = realizedAll + open;
    const first = totalPts[0]?.[1] ?? 0, last = totalPts.at(-1)?.[1] ?? 0;
    const change = plRange === "all" ? last : last - first;
    const up = change >= 0; // red whenever profit/loss fell over the chosen range
    Charts.line($("#plChart"), [
      { label: "Total profit / loss", short: "Total", color: up ? COLORS.halal : COLORS.haram, points: totalPts, area: true },
      { label: "Realized from sales", short: "Realized", color: COLORS.ink, points: realPts },
    ], { format: v => money(v, true), axisFormat: v => compact(v), zero: true, ariaLabel: "Profit and loss over time", empty: "No history in this range yet." });
    const rangeName = plRange === "all" ? "all time" : `in the ${RANGE_NAME[plRange]}`;
    $("#plSummary").innerHTML = totalPts.length ? `<span class="${trend(change)}">${money(change, true)}</span> ${rangeName}` : "";
  }

  // ---------------- Import trades (CSV) ----------------
  function parseCSV(text) {
    const rows = []; let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some(x => x.trim())) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some(x => x.trim())) rows.push(row);
    return rows;
  }
  const num = (v) => {
    if (v == null) return NaN;
    const t = String(v).trim(); if (!t) return NaN;
    const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
    const n = parseFloat(t.replace(/[^0-9.]/g, ""));
    return neg ? -n : n;
  };
  const isoDate = (v) => {
    const t = String(v || "").trim();
    let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : null;
  };

  /* Turns a broker CSV into a list of buy / sell / dividend transactions. */
  function readTrades(text) {
    const rows = parseCSV(text);
    const hi = rows.findIndex(r => r.some(c => /instrument|symbol|ticker/i.test(c)) && r.some(c => /date/i.test(c)));
    if (hi < 0) throw new Error("Couldn't find the column headers. Expected columns like Activity Date, Instrument, Trans Code, Quantity, Price, Amount.");
    const head = rows[hi].map(h => h.trim().toLowerCase());
    const col = (...names) => head.findIndex(h => names.some(n => h === n)) ;
    const iDate = col("activity date", "date", "trade date"), iSym = col("instrument", "symbol", "ticker");
    const iCode = col("trans code", "type", "action", "transaction"), iQty = col("quantity", "shares", "qty");
    const iPrice = col("price"), iAmt = col("amount", "total");
    if ([iDate, iSym, iCode].some(i => i < 0)) throw new Error("Missing a date, symbol or transaction type column.");
    const out = [], skipped = {};
    for (const r of rows.slice(hi + 1)) {
      const code = (r[iCode] || "").trim(), sym = (r[iSym] || "").trim().toUpperCase(), date = isoDate(r[iDate]);
      const type = /^(buy|bto|bought)$/i.test(code) ? "buy" : /^(sell|stc|sold)$/i.test(code) ? "sell"
        : /^(cdiv|div|dividend|qualified dividend)$/i.test(code) ? "dividend" : null;
      if (!type || !sym || !date) { if (code) skipped[code] = (skipped[code] || 0) + 1; continue; }
      const qty = Math.abs(num(r[iQty])), amount = Math.abs(num(r[iAmt]));
      let price = Math.abs(num(r[iPrice]));
      if (!(price > 0) && qty > 0 && amount > 0) price = amount / qty;
      if (type !== "dividend" && !(qty > 0 && price > 0)) { skipped[code] = (skipped[code] || 0) + 1; continue; }
      out.push({ type, sym, date, qty, price, amount: type === "dividend" ? amount : qty * price,
        fp: [date, sym, code, r[iQty], r[iPrice], r[iAmt]].join("|") });
    }
    return { trades: out, skipped };
  }

  function importTrades(trades) {
    if (state.holdings.some(h => h.example)) {
      state.holdings = state.holdings.filter(h => !h.example);
      state.sales = state.sales.filter(x => !x.example);
    }
    const order = { buy: 0, sell: 1, dividend: 2 };
    const fresh = trades.filter(t => !state.imported[t.fp]).sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type]);
    let buys = 0, sells = 0, divs = 0, unmatched = 0;
    for (const t of fresh) {
      state.imported[t.fp] = 1;
      if (t.type === "buy") {
        const lot = { date: t.date, amount: t.amount, price: t.price };
        let h = state.holdings.find(x => x.symbol === t.sym);
        if (!h) { h = { symbol: t.sym, name: SHARIAH_DB[t.sym]?.name || state.profiles[t.sym]?.name || t.sym, shares: 0, invested: 0, lots: [] }; state.holdings.push(h); }
        h.shares += t.qty; h.invested += t.amount; h.lots.push(lot);
        buys++;
      } else if (t.type === "sell") {
        const h = state.holdings.find(x => x.symbol === t.sym);
        const have = h ? h.shares : 0;
        const matched = Math.min(have, t.qty);
        if (matched > 1e-9) applySale(t.sym, matched, t.price, t.date, { imported: true });
        const left = t.qty - matched;
        if (left > 1e-6) {
          // Bought before this report's date range, so the cost isn't known
          state.sales.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, symbol: t.sym, name: t.sym, date: t.date,
            shares: left, price: t.price, proceeds: left * t.price, cost: null, gain: null, imported: true });
          unmatched++;
        }
        sells++;
      } else {
        state.income.push({ id: Date.now() + Math.random(), source: `${t.sym} dividend`, category: "Dividend", symbol: t.sym, amount: t.amount, date: t.date });
        divs++;
      }
    }
    save(); syncFeed(); renderAll();
    return { buys, sells, divs, unmatched, dupes: trades.length - fresh.length };
  }

  function openImport() {
    $("#modalBody").innerHTML = `
      <div class="m-head"><div><h2 id="mTitle">Import trades</h2><p class="muted">Safe: you download a file from your broker and choose it here. No login, nothing leaves your browser.</p></div></div>
      <ol class="steps">
        <li>In Robinhood, go to <strong>Account → Reports and statements → Reports</strong> (menu names can change).</li>
        <li>Create an <strong>account activity</strong> report for the dates you want (start from your first trade for accurate profit numbers), then download the CSV.</li>
        <li>Choose the file below. Buys, sells and dividends are imported; transfers and fees are skipped.</li>
      </ol>
      <label class="btn primary file-btn">Choose CSV file<input type="file" id="importCsv" accept=".csv,text/csv" hidden></label>
      <div id="importResult"></div>
      <p class="hint">Other brokers work too if the file has columns for date, symbol, type (Buy/Sell/Dividend), quantity and price. Importing the same file twice won't duplicate trades.</p>`;
    $("#importCsv").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const { trades, skipped } = readTrades(await file.text());
        const c = (t) => trades.filter(x => x.type === t).length;
        const skip = Object.entries(skipped).map(([k, v]) => `${v} ${esc(k)}`).join(", ");
        $("#importResult").innerHTML = trades.length ? `
          <div class="import-sum">
            <div><span class="kpi-label">Buys</span><strong>${c("buy")}</strong></div>
            <div><span class="kpi-label">Sells</span><strong>${c("sell")}</strong></div>
            <div><span class="kpi-label">Dividends</span><strong>${c("dividend")}</strong></div>
          </div>
          ${skip ? `<p class="hint">Skipped: ${skip}</p>` : ""}
          ${state.holdings.some(h => h.example) ? '<p class="hint">The example portfolio will be removed.</p>' : ""}
          <button class="btn primary" id="doImport">Import ${trades.length} transactions</button>`
          : `<p class="warn">No buys, sells or dividends found in this file.</p>`;
        $("#doImport")?.addEventListener("click", () => {
          const r = importTrades(trades);
          closeModal();
          toast(`Imported ${r.buys} buys, ${r.sells} sells, ${r.divs} dividends${r.dupes ? ` (${r.dupes} already imported)` : ""}`);
          if (r.unmatched) setTimeout(() => toast(`${r.unmatched} sale${r.unmatched > 1 ? "s" : ""} had no matching buy in this file, so profit couldn't be calculated. Import an earlier date range to fix it.`), 3800);
        });
      } catch (err) {
        $("#importResult").innerHTML = `<p class="warn">${esc(err.message)}</p>`;
      }
    });
    $("#modal").hidden = false;
  }
  $("#openImport").addEventListener("click", openImport);
  $("#openImport2").addEventListener("click", openImport);

  // ---------------- Appearance ----------------
  function setSkin(skin) {
    document.documentElement.dataset.skin = skin;
    try { localStorage.setItem("shariah-tracker-skin", skin); } catch {}
    $$("#skinPick button").forEach(b => b.classList.toggle("active", b.dataset.skin === skin));
  }
  $$("#skinPick button").forEach(b => b.addEventListener("click", () => setSkin(b.dataset.skin)));
  setSkin(document.documentElement.dataset.skin || "onyx");

  // ---------------- Gold & silver ----------------
  const PURITY = {
    gold: [
      { k: "24k", f: 1, mark: "999" }, { k: "22k", f: 0.916, mark: "916" }, { k: "21k", f: 0.875, mark: "875" },
      { k: "18k", f: 0.75, mark: "750" }, { k: "14k", f: 0.585, mark: "585" }, { k: "10k", f: 0.417, mark: "417" },
    ],
    silver: [
      { k: "Fine", f: 1, mark: "999" }, { k: "Britannia", f: 0.958, mark: "958" }, { k: "Sterling", f: 0.925, mark: "925" },
      { k: "Coin", f: 0.9, mark: "900" }, { k: "800", f: 0.8, mark: "800" },
    ],
  };
  const UNITS = { g: { f: 1, name: "gram" }, tola: { f: 11.6638, name: "tola" }, oz: { f: History.OZ, name: "troy ounce" } };
  let metal = "gold", unit = "g", mRange = "365", metalData = null;
  let shown = { gold: ["24k", "22k", "21k", "18k"], silver: ["Fine", "Sterling"] };
  try { const saved = JSON.parse(localStorage.getItem("shariah-tracker-metal-ui")); if (saved) ({ metal = metal, unit = unit, mRange = mRange, shown = shown } = saved); } catch {}
  const saveMetalUi = () => { try { localStorage.setItem("shariah-tracker-metal-ui", JSON.stringify({ metal, unit, mRange, shown })); } catch {} };
  const syncToggle = (id, attr, val) => $$(`#${id} button`).forEach(b => b.classList.toggle("active", b.dataset[attr] === val));

  [["mMetal", "m", v => metal = v], ["mUnit", "u", v => unit = v], ["mRange", "r", v => mRange = v]].forEach(([id, attr, set]) => {
    $$(`#${id} button`).forEach(b => b.addEventListener("click", () => {
      set(b.dataset[attr]); syncToggle(id, attr, b.dataset[attr]); saveMetalUi(); renderMetals();
    }));
  });
  $("#mKarats").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const k = b.dataset.k, cur = shown[metal];
    shown[metal] = cur.includes(k) ? (cur.length > 1 ? cur.filter(x => x !== k) : cur) : PURITY[metal].map(p => p.k).filter(x => x === k || cur.includes(x));
    saveMetalUi(); renderMetals();
  });
  $("#mTable").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-k]");
    if (tr) $(`#mKarats button[data-k="${tr.dataset.k}"]`)?.click();
  });

  History.onMetals((m) => { metalData = m; renderMetals(); renderZakat(); });

  const perGram = (m) => metalData?.[m]?.at(-1)?.[1] ?? null;
  function change(pts, daysBack) {
    if (!pts || pts.length < 2) return null;
    const last = pts.at(-1);
    let ref;
    if (daysBack === 1) ref = pts.at(-2);
    else { const cut = isoDaysAgo(daysBack); ref = pts.find(p => p[0] >= cut) || pts[0]; }
    return ((last[1] - ref[1]) / ref[1]) * 100;
  }

  function renderMetals() {
    syncToggle("mMetal", "m", metal); syncToggle("mUnit", "u", unit); syncToggle("mRange", "r", mRange);
    if (!metalData) return;
    const u = UNITS[unit];
    const ramp = list(metal === "gold" ? "--ramp-gold" : "--ramp-silver");
    const g = metalData.gold, sv = metalData.silver;

    $("#mGold").textContent = money(perGram("gold") * u.f);
    $("#mSilver").textContent = money(perGram("silver") * u.f);
    [["#mGoldChg", g], ["#mSilverChg", sv]].forEach(([id, pts]) => {
      const c = change(pts, 1);
      $(id).innerHTML = `per ${u.name} · <span class="${trend(c)}">${pct(c)}</span> today`;
    });
    $("#mRatio").textContent = perGram("silver") ? (perGram("gold") / perGram("silver")).toFixed(1) : "-";

    const purities = PURITY[metal];
    $("#mKarats").innerHTML = purities.map((p, i) => {
      const on = shown[metal].includes(p.k);
      return `<button class="chip ${on ? "active" : ""}" data-k="${esc(p.k)}" aria-pressed="${on}"><i style="background:${ramp[i % ramp.length]}"></i>${esc(p.k)}${metal === "silver" && p.k !== p.mark ? ` ${p.mark}` : ""}</button>`;
    }).join("");

    const pts = metalData[metal];
    const cut = isoDaysAgo(+mRange);
    const inRange = pts.filter(p => p[0] >= cut);
    Charts.line($("#mChart"), purities.map((p, i) => ({ p, i })).filter(({ p }) => shown[metal].includes(p.k)).map(({ p, i }) => ({
      label: `${p.k}${metal === "silver" && p.k !== p.mark ? " " + p.mark : ""}`, color: ramp[i % ramp.length],
      points: inRange.map(([d, v]) => [d, v * p.f * u.f]),
    })), { format: v => money(v), axisFormat: v => money(v).replace(/\.00$/, ""), ariaLabel: `${metal} price per ${u.name}` });

    $("#mTableTitle").textContent = metal === "gold" ? "Gold price by karat" : "Silver price by purity";
    $("#mUnitHead").textContent = `Per ${u.name}`;
    const d1 = change(pts, 1), y1 = change(pts, 365);
    $("#mTable").innerHTML = purities.map((p, i) => `<tr data-k="${esc(p.k)}" class="clickable ${shown[metal].includes(p.k) ? "on" : ""}">
      <td class="nowrap"><span class="swatch" style="background:${ramp[i % ramp.length]}"></span> <strong>${esc(p.k)}</strong></td>
      <td class="muted nowrap">${p.mark} · ${(p.f * 100).toFixed(1)}%</td>
      <td class="num"><strong>${money(perGram(metal) * p.f * u.f)}</strong></td>
      <td class="num ${trend(d1)}">${pct(d1)}</td>
      <td class="num ${trend(y1)}">${pct(y1)}</td>
    </tr>`).join("");

    const goldN = perGram("gold") * 85, silverN = perGram("silver") * 595;
    $("#nGold").textContent = money(goldN);
    $("#nSilver").textContent = money(silverN);
    $("#mSource").textContent = metalData.source === "twelve"
      ? `Live spot prices from Twelve Data · updated ${new Date(metalData.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : `Simulated demo prices${metalData.error ? ` (${metalData.error})` : ""}. Add a free Twelve Data key in Settings for live gold and silver prices.`;
  }

  function useNisab(kind) {
    const v = kind === "gold" ? perGram("gold") * 85 : perGram("silver") * 595;
    if (!v) return;
    $("#zNisab").value = v.toFixed(2);
    $("#zakatForm").dispatchEvent(new Event("input"));
    toast(`Nisab set to ${money(v)} (${kind})`);
  }
  $("#useGoldNisab").addEventListener("click", () => useNisab("gold"));
  $("#useSilverNisab").addEventListener("click", () => useNisab("silver"));
  $("#zUseGold").addEventListener("click", () => useNisab("gold"));
  $("#zUseSilver").addEventListener("click", () => useNisab("silver"));

  // ---------------- Settings ----------------
  let savedKey = "";
  try { savedKey = localStorage.getItem(KEY_STORE) || ""; } catch {}
  $("#apiKey").value = savedKey;
  function keyStatus(id, kind, text) { const el = $(id); el.className = `key-status ${kind}`; el.textContent = text; }
  async function checkFinnhub(k, announce) {
    if (!k) return keyStatus("#fhStatus", "", "Not connected. Showing demo stock prices.");
    keyStatus("#fhStatus", "busy", "Checking your key…");
    try {
      const r = await PriceFeed.testKey(k);
      keyStatus("#fhStatus", "ok", `✓ Completed. Connected to Finnhub: live stock prices are on (AAPL ${money(r.price)}).`);
      if (announce) toast("✓ Completed: Finnhub key added, live stock prices are on");
    } catch (e) {
      keyStatus("#fhStatus", "err", `✕ ${e.message}`);
      if (announce) toast(e.message, "error");
    }
  }
  async function checkTwelve(k, announce) {
    if (!k) return keyStatus("#tdStatus", "", "Not connected. Charts and gold/silver use demo data.");
    keyStatus("#tdStatus", "busy", "Checking your key…");
    try {
      const r = await History.testKey(k);
      const gold = r.gold ? `gold ${money(r.gold)}/oz` : `gold & silver: ${r.goldError} (demo prices stay on for metals)`;
      keyStatus("#tdStatus", r.gold ? "ok" : "warn", `✓ Completed. Connected to Twelve Data: price history on (AAPL ${money(r.stock)}), ${gold}.`);
      if (announce) toast("✓ Completed: Twelve Data key added");
    } catch (e) {
      keyStatus("#tdStatus", "err", `✕ ${e.message}`);
      if (announce) toast(e.message, "error");
    }
  }
  $("#keyForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const k = $("#apiKey").value.trim();
    try { localStorage.setItem(KEY_STORE, k); } catch {}
    PriceFeed.setKey(k); syncFeed(); renderAll();
    checkFinnhub(k, true);
  });
  $("#clearKey").addEventListener("click", () => {
    $("#apiKey").value = "";
    try { localStorage.removeItem(KEY_STORE); } catch {}
    PriceFeed.setKey(""); syncFeed(); renderAll();
    checkFinnhub("", false);
  });
  let tdKey = "";
  try { tdKey = localStorage.getItem(TD_KEY_STORE) || ""; } catch {}
  $("#tdKey").value = tdKey;
  $("#tdForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const k = $("#tdKey").value.trim();
    try { localStorage.setItem(TD_KEY_STORE, k); } catch {}
    History.clearCache(); History.setKey(k); renderPerf(); renderPL();
    checkTwelve(k, true);
  });
  $("#clearTd").addEventListener("click", () => {
    $("#tdKey").value = "";
    try { localStorage.removeItem(TD_KEY_STORE); } catch {}
    History.setKey(""); renderPerf(); renderPL();
    checkTwelve("", false);
    toast("Twelve Data key removed");
  });

  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shariah-portfolio-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.holdings)) throw new Error("Not a backup file");
      state = { ...blankState(), ...data };
      save(); syncFeed(); renderAll();
      toast("Backup imported");
    } catch (err) { toast(`Import failed: ${err.message}`, "error"); }
    e.target.value = "";
  });
  $("#resetBtn").addEventListener("click", () => {
    if (!armed($("#resetBtn"), "Click again to delete everything")) return;
    state = blankState();
    save(); syncFeed(); renderAll();
    toast("All data deleted");
  });

  // ---------------- Boot ----------------
  function renderAll() {
    renderHoldings(); renderChart(); renderIncome(); renderZakat(); renderScreener(); updateIncSym(); renderPerf(); renderPL();
  }

  // Redraw charts when the theme or the width changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { renderChart(); renderPerf(); renderPL(); renderMetals(); });
  new MutationObserver(() => { renderChart(); renderPerf(); renderPL(); renderMetals(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-skin"] });
  let resizeTimer, lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { renderPerf(); renderPL(); renderMetals(); }, 200);
  });
  // Charts measure their container, so redraw when a hidden tab is first shown
  $$(".tab").forEach(b => b.addEventListener("click", () => setTimeout(() => { renderPerf(); renderPL(); renderMetals(); }, 0)));

  // First visit in demo mode opens with a clearly marked example portfolio
  let firstVisit = false;
  try { firstVisit = localStorage.getItem(STORE_KEY) == null; } catch {}
  PriceFeed.setKey(savedKey);
  History.setKey(tdKey);
  if (firstVisit && !savedKey) loadExamples();
  syncFeed();
  renderAll();
  checkFinnhub(savedKey, false);
  checkTwelve(tdKey, false);
})();

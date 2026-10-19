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
      if (s && Array.isArray(s.holdings)) return { overrides: {}, profiles: {}, income: [], zakat: {}, ...s };
    } catch {}
    return { holdings: [], income: [], overrides: {}, profiles: {}, zakat: {} };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
  }

  function screening(sym) {
    const p = state.profiles[sym] || {};
    const rec = screenStock(sym, p.name, p.industry);
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
    return state.holdings.map(h => {
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
    $("#exampleBanner").hidden = !state.holdings.some(h => h.example);
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
        <td class="actions"><button class="icon-btn" data-act="remove" title="Remove ${esc(r.h.symbol)}" aria-label="Remove ${esc(r.h.symbol)}">🗑</button></td>
      </tr>`;
    }).join("");
  }

  $("#holdingsBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const sym = btn.closest("tr").dataset.sym;
    if (btn.dataset.act === "details") openDetails(sym);
    if (btn.dataset.act === "remove" && armed(btn, "Remove?")) {
      state.holdings = state.holdings.filter(h => h.symbol !== sym);
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
      if (Date.now() - lastPerf > 15000) { lastPerf = Date.now(); renderPerf(); }
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
    PriceFeed.track(state.holdings.map(h => h.symbol));
  }

  // ---------------- Example portfolio ----------------
  const EXAMPLES = [
    ["AAPL", 2500, 300, 0.82], ["NVDA", 3000, 240, 0.70], ["SPUS", 2000, 200, 0.90],
    ["MSFT", 1500, 150, 0.95], ["AMZN", 1000, 120, 0.97], ["JPM", 800, 90, 1.04], ["TSLA", 1200, 60, 1.15],
  ];
  function loadExamples() {
    state.holdings = EXAMPLES.map(([sym, amount, daysAgo, f]) => {
      const price = Math.round(SHARIAH_DB[sym].price * f * 100) / 100;
      const date = new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
      return { symbol: sym, name: SHARIAH_DB[sym].name, shares: amount / price, invested: amount, example: true, lots: [{ date, amount, price }] };
    });
    save(); syncFeed(); renderAll();
  }
  $("#loadExamples").addEventListener("click", loadExamples);
  $("#clearExamples").addEventListener("click", () => {
    state.holdings = state.holdings.filter(h => !h.example);
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
    const held = state.holdings.find(h => h.symbol === sym);
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
      ${q?.price ? `<p class="m-price"><span class="big">${money(q.price)}</span> <span class="${trend(q.change)}">${money(q.change, true)} (${pct(q.changePct)}) today</span></p>` : ""}
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
  }
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
        <span class="muted">${esc(s.sector)}${imp != null ? ` · ${imp.toFixed(1)}% impermissible` : ""}</span>
      </button>`;
    }).join("");
  }
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
    const demo = !PriceFeed.isLive();
    const results = await Promise.all(pick.map(h => {
      const first = h.lots.map(l => l.date).sort()[0];
      return History.stockSeries(h.symbol, first, h.lots, PriceFeed.get(h.symbol)?.price, demo).then(r => ({ h, ...r }));
    }));
    if (token !== perfToken) return;

    const dates = [...new Set(results.flatMap(r => r.points.map(p => p[0])))].sort();
    const start = perfRange === "all" ? dates[0] : isoDaysAgo(+perfRange);
    const valuePts = [], investedPts = [];
    const cursor = results.map(() => ({ i: 0, last: null }));
    for (const d of dates) {
      let value = 0, invested = 0, owned = false;
      results.forEach((r, k) => {
        const c = cursor[k];
        while (c.i < r.points.length && r.points[c.i][0] <= d) c.last = r.points[c.i++][1];
        let shares = 0;
        r.h.lots.forEach(l => { if (l.date <= d) { shares += l.amount / l.price; invested += l.amount; } });
        if (shares && c.last != null) { value += shares * c.last; owned = true; }
      });
      if (owned && d >= start) { valuePts.push([d, value]); investedPts.push([d, invested]); }
    }

    const endV = valuePts.at(-1)?.[1] ?? 0, endI = investedPts.at(-1)?.[1] ?? 0;
    const startGain = valuePts.length ? valuePts[0][1] - investedPts[0][1] : 0;
    const rangeGain = (endV - endI) - (perfRange === "all" ? 0 : startGain);
    const up = rangeGain >= 0;
    const label = perfPick === "all" ? "Portfolio value" : `${perfPick} value`;
    Charts.line($("#perfChart"), [
      { label, short: "Value", color: up ? COLORS.halal : COLORS.haram, points: valuePts, area: true },
      { label: "Amount invested", short: "Invested", color: COLORS.muted, points: investedPts, dashed: true },
    ], { format: v => money(v), axisFormat: v => compact(v), ariaLabel: `${label} over time`, empty: "No price history in this range yet." });

    const rangeName = { 30: "past month", 91: "past 3 months", 182: "past 6 months", 365: "past year", all: "since you invested" }[perfRange];
    const base = perfRange === "all" ? endI : (valuePts[0]?.[1] || endI);
    $("#perfSummary").innerHTML = valuePts.length
      ? `<span class="${up ? "up" : "down"}">${money(rangeGain, true)} (${pct(base ? (rangeGain / base) * 100 : 0)})</span> ${rangeName}`
      : "";

    const src = new Set(results.map(r => r.source));
    $("#perfSource").textContent = src.has("twelve") ? "Daily closing prices from Twelve Data."
      : src.has("demo") ? "Simulated demo history. Add API keys in Settings to see your real performance."
      : "Built from prices recorded while the app is open. Add a free Twelve Data key in Settings for full daily history.";

    // Return by stock: diverging bars around 0%
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
  const compact = (v) => "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

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
  $("#keyForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const k = $("#apiKey").value.trim();
    try { localStorage.setItem(KEY_STORE, k); } catch {}
    PriceFeed.setKey(k); syncFeed(); renderAll();
  });
  $("#clearKey").addEventListener("click", () => {
    $("#apiKey").value = "";
    try { localStorage.removeItem(KEY_STORE); } catch {}
    PriceFeed.setKey(""); syncFeed(); renderAll();
  });
  let tdKey = "";
  try { tdKey = localStorage.getItem(TD_KEY_STORE) || ""; } catch {}
  $("#tdKey").value = tdKey;
  $("#tdForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const k = $("#tdKey").value.trim();
    try { localStorage.setItem(TD_KEY_STORE, k); } catch {}
    History.clearCache(); History.setKey(k); renderPerf();
    toast(k ? "Twelve Data connected" : "Twelve Data key removed");
  });
  $("#clearTd").addEventListener("click", () => {
    $("#tdKey").value = "";
    try { localStorage.removeItem(TD_KEY_STORE); } catch {}
    History.setKey(""); renderPerf();
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
      state = { overrides: {}, profiles: {}, income: [], zakat: {}, ...data };
      save(); syncFeed(); renderAll();
      toast("Backup imported");
    } catch (err) { toast(`Import failed: ${err.message}`, "error"); }
    e.target.value = "";
  });
  $("#resetBtn").addEventListener("click", () => {
    if (!armed($("#resetBtn"), "Click again to delete everything")) return;
    state = { holdings: [], income: [], overrides: {}, profiles: {}, zakat: {} };
    save(); syncFeed(); renderAll();
    toast("All data deleted");
  });

  // ---------------- Boot ----------------
  function renderAll() {
    renderHoldings(); renderChart(); renderIncome(); renderZakat(); renderScreener(); updateIncSym(); renderPerf();
  }

  // Redraw charts when the theme or the width changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { renderChart(); renderPerf(); renderMetals(); });
  new MutationObserver(() => { renderChart(); renderPerf(); renderMetals(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  let resizeTimer, lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { renderPerf(); renderMetals(); }, 200);
  });
  // Charts measure their container, so redraw when a hidden tab is first shown
  $$(".tab").forEach(b => b.addEventListener("click", () => setTimeout(() => { renderPerf(); renderMetals(); }, 0)));

  // First visit in demo mode opens with a clearly marked example portfolio
  let firstVisit = false;
  try { firstVisit = localStorage.getItem(STORE_KEY) == null; } catch {}
  PriceFeed.setKey(savedKey);
  History.setKey(tdKey);
  if (firstVisit && !savedKey) loadExamples();
  syncFeed();
  renderAll();
})();

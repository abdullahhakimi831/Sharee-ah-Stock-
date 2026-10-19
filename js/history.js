/*
 * Price history + precious metals.
 *
 * With a free Twelve Data key (https://twelvedata.com/register) this pulls
 * real daily closes for your stocks and live gold / silver spot prices.
 * Without one, it falls back to:
 *   - demo mode (no Finnhub key): simulated history, clearly labelled
 *   - live Finnhub only: daily prices recorded while the app is open
 */
const History = (() => {
  const API = "https://api.twelvedata.com";
  const CACHE_KEY = "shariah-tracker-history-v1";
  const SNAP_KEY = "shariah-tracker-snapshots-v1";
  const OZ = 31.1034768; // grams per troy ounce
  const METAL_REFRESH_MS = 10 * 60_000;

  let apiKey = "";
  let cache = read(CACHE_KEY) || {};     // sym -> { fetched: "YYYY-MM-DD", points: [[date, close]] }
  let snaps = read(SNAP_KEY) || {};      // sym -> { date: close }
  let metals = null;                     // { gold, silver, source, time }
  let metalListeners = [];
  let metalTimer = null;
  const inflight = {};

  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  const day = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
  const today = () => day(new Date());

  // ---------- Twelve Data, throttled to the free tier (8 credits / minute) ----------
  const queue = [];
  const sent = [];
  let pumping = false;
  function td(path, params) {
    return new Promise((resolve, reject) => {
      queue.push({ path, params, resolve, reject, cost: String(params.symbol).split(",").length });
      pump();
    });
  }
  async function pump() {
    if (pumping) return;
    pumping = true;
    while (queue.length) {
      const now = Date.now();
      while (sent.length && now - sent[0].t > 61_000) sent.shift();
      const used = sent.reduce((s, x) => s + x.cost, 0);
      const job = queue[0];
      if (used + job.cost > 7) { await new Promise(r => setTimeout(r, 4000)); continue; }
      queue.shift();
      sent.push({ t: now, cost: job.cost });
      try {
        const qs = new URLSearchParams({ ...job.params, apikey: apiKey });
        let res;
        try { res = await fetch(`${API}${job.path}?${qs}`); }
        catch { throw new Error("Can't reach Twelve Data from this page - open the hosted site instead"); }
        const data = await res.json();
        if (data.status === "error") throw new Error(data.message || "Twelve Data error");
        job.resolve(data);
      } catch (e) { job.reject(e); }
    }
    pumping = false;
  }

  // ---------- Stock history ----------
  async function fetchStock(sym) {
    const c = cache[sym];
    if (c && c.fetched === today()) return c.points;
    if (inflight[sym]) return inflight[sym];
    inflight[sym] = td("/time_series", { symbol: sym, interval: "1day", outputsize: 800 })
      .then(data => {
        const points = (data.values || []).map(v => [v.datetime.slice(0, 10), parseFloat(v.close)]).reverse();
        cache[sym] = { fetched: today(), points };
        write(CACHE_KEY, cache);
        return points;
      })
      .finally(() => { delete inflight[sym]; });
    return inflight[sym];
  }

  /* Record today's price so history builds up even without Twelve Data. */
  function record(sym, price) {
    if (!price) return;
    const d = today();
    snaps[sym] = snaps[sym] || {};
    if (snaps[sym][d] === price) return;
    snaps[sym][d] = price;
    clearTimeout(record.t);
    record.t = setTimeout(() => write(SNAP_KEY, snaps), 5000);
  }

  // Seeded RNG so the demo history is stable between renders
  function rng(seed) {
    let s = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 2166136261) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); }

  function weekdays(from, to) {
    const out = [];
    const d = new Date(from + "T12:00:00Z");
    const end = new Date(to + "T12:00:00Z");
    while (d <= end) {
      const w = d.getUTCDay();
      if (w !== 0 && w !== 6) out.push(day(d));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }

  /* Simulated daily closes that pass through each anchor [date, price]. */
  function simulate(seed, from, anchors, vol = 0.016) {
    const dates = weekdays(from, today());
    if (!dates.length) return [];
    const r = rng(seed);
    const noise = [0];
    for (let i = 1; i < dates.length; i++) noise.push(noise[i - 1] + gauss(r) * vol);
    const idx = anchors.map(([d, p]) => {
      let i = dates.findIndex(x => x >= d);
      if (i < 0) i = dates.length - 1;
      return [i, Math.log(p)];
    }).sort((a, b) => a[0] - b[0]);
    const logp = new Array(dates.length);
    // Before the first anchor: free walk ending at it
    for (let i = 0; i <= idx[0][0]; i++) logp[i] = idx[0][1] + noise[i] - noise[idx[0][0]];
    // Between anchors: Brownian bridge
    for (let k = 0; k < idx.length - 1; k++) {
      const [i0, l0] = idx[k], [i1, l1] = idx[k + 1];
      for (let i = i0; i <= i1; i++) {
        const f = i1 === i0 ? 1 : (i - i0) / (i1 - i0);
        logp[i] = l0 + (l1 - l0) * f + (noise[i] - noise[i0]) - (noise[i1] - noise[i0]) * f;
      }
    }
    // After the last anchor: free walk from it
    const [il, ll] = idx[idx.length - 1];
    for (let i = il; i < dates.length; i++) logp[i] = ll + noise[i] - noise[il];
    return dates.map((d, i) => [d, Math.round(Math.exp(logp[i]) * 100) / 100]);
  }

  /*
   * Daily closes for a symbol from `from` to today.
   * mode: "twelve" | "demo" | "recorded"
   */
  async function stockSeries(sym, from, lots, currentPrice, demo) {
    if (apiKey) {
      try {
        const pts = await fetchStock(sym);
        if (pts.length) {
          const out = pts.filter(([d]) => d >= from);
          if (currentPrice && out.length && out[out.length - 1][0] !== today()) out.push([today(), currentPrice]);
          return { points: out, source: "twelve" };
        }
      } catch (e) { /* fall through */ }
    }
    const anchors = lots.map(l => [l.date, l.price]);
    if (currentPrice) anchors.push([today(), currentPrice]);
    if (demo) return { points: simulate(sym, from, anchors), source: "demo" };
    const rec = Object.entries(snaps[sym] || {});
    const all = [...anchors, ...rec].sort((a, b) => a[0].localeCompare(b[0]));
    return { points: all.filter(([d]) => d >= from), source: "recorded" };
  }

  // ---------- Metals ----------
  const DEMO_SPOT = { gold: 4150, silver: 49 }; // USD per troy ounce, demo only

  async function loadMetals() {
    if (apiKey) {
      try {
        const [gold, silver] = await Promise.all(["XAU/USD", "XAG/USD"].map(s =>
          td("/time_series", { symbol: s, interval: "1day", outputsize: 400 })));
        const toPts = (d) => (d.values || []).map(v => [v.datetime.slice(0, 10), parseFloat(v.close) / OZ]).reverse();
        const live = await td("/price", { symbol: "XAU/USD,XAG/USD" });
        const g = toPts(gold), s = toPts(silver);
        const gp = parseFloat(live["XAU/USD"]?.price) / OZ, sp = parseFloat(live["XAG/USD"]?.price) / OZ;
        if (gp) setLast(g, gp);
        if (sp) setLast(s, sp);
        metals = { gold: g, silver: s, source: "twelve", time: Date.now() };
        return emitMetals();
      } catch (e) {
        metals = { ...demoMetals(), error: e.message };
        return emitMetals();
      }
    }
    metals = demoMetals();
    emitMetals();
  }
  function setLast(pts, v) {
    if (pts.length && pts[pts.length - 1][0] === today()) pts[pts.length - 1][1] = v;
    else pts.push([today(), v]);
  }
  function demoMetals() {
    const from = day(new Date(Date.now() - 400 * 864e5));
    const g = simulate("gold-demo", from, [[today(), DEMO_SPOT.gold]], 0.009).map(([d, v]) => [d, v / OZ]);
    const s = simulate("silver-demo", from, [[today(), DEMO_SPOT.silver]], 0.016).map(([d, v]) => [d, v / OZ]);
    return { gold: g, silver: s, source: "demo", time: Date.now() };
  }
  function emitMetals() { metalListeners.forEach(fn => fn(metals)); }

  return {
    OZ,
    setKey(k) {
      apiKey = (k || "").trim();
      clearInterval(metalTimer);
      loadMetals();
      if (apiKey) metalTimer = setInterval(loadMetals, METAL_REFRESH_MS);
    },
    hasKey: () => !!apiKey,
    stockSeries,
    record,
    onMetals(fn) { metalListeners.push(fn); if (metals) fn(metals); },
    refreshMetals: loadMetals,
    clearCache() { cache = {}; write(CACHE_KEY, cache); },
  };
})();

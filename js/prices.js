/*
 * Live price feed.
 *
 * With a free Finnhub API key (https://finnhub.io/register) this pulls real
 * quotes over REST and streams live trades over a WebSocket. Without a key it
 * runs a clearly-labelled demo simulation so the dashboard still works.
 *
 * Subscribers receive (symbol, { price, prevClose, change, changePct, time }).
 */
const PriceFeed = (() => {
  const API = "https://finnhub.io/api/v1";
  const POLL_MS = 60_000;      // REST refresh (free tier: 60 calls/min)
  const DEMO_TICK_MS = 2_500;

  let apiKey = "";
  let symbols = new Set();
  let quotes = {};             // symbol -> latest quote
  let listeners = [];
  let statusListeners = [];
  let socket = null;
  let pollTimer = null;
  let demoTimer = null;
  let status = { mode: "demo", text: "Demo prices" };

  const emit = (sym) => listeners.forEach(fn => fn(sym, quotes[sym]));
  const setStatus = (mode, text) => {
    status = { mode, text };
    statusListeners.forEach(fn => fn(status));
  };

  function store(sym, price, prevClose) {
    const prev = quotes[sym] || {};
    const pc = prevClose ?? prev.prevClose ?? price;
    quotes[sym] = {
      price,
      prevClose: pc,
      change: price - pc,
      changePct: pc ? ((price - pc) / pc) * 100 : 0,
      time: Date.now(),
      direction: prev.price == null ? 0 : Math.sign(price - prev.price),
    };
    emit(sym);
  }

  // ---------- Finnhub ----------
  async function api(path, params = {}) {
    const qs = new URLSearchParams({ ...params, token: apiKey });
    let res;
    try { res = await fetch(`${API}${path}?${qs}`); }
    catch { throw new Error("Can't reach Finnhub from this page - open the hosted site instead"); }
    if (res.status === 401 || res.status === 403) throw new Error("Invalid API key");
    if (res.status === 429) throw new Error("Rate limited - slow down");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function fetchQuote(sym) {
    const q = await api("/quote", { symbol: sym });
    // Finnhub returns c=0 for unknown symbols
    if (q && q.c) store(sym, q.c, q.pc);
    return q;
  }

  async function pollAll() {
    for (const sym of symbols) {
      try { await fetchQuote(sym); }
      catch (e) { setStatus("error", e.message); return; }
    }
    if (status.mode !== "live") setStatus("live", "Live - Finnhub");
  }

  function openSocket() {
    closeSocket();
    try {
      socket = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(apiKey)}`);
    } catch { return; }
    socket.addEventListener("open", () => {
      symbols.forEach(s => socket.send(JSON.stringify({ type: "subscribe", symbol: s })));
      setStatus("live", "Live - streaming");
    });
    socket.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type !== "trade" || !msg.data) return;
      // Keep only the last trade per symbol in this batch
      const last = {};
      msg.data.forEach(t => { last[t.s] = t.p; });
      Object.entries(last).forEach(([s, p]) => symbols.has(s) && store(s, p));
    });
    socket.addEventListener("close", () => { socket = null; });
  }

  function closeSocket() {
    if (socket) { try { socket.close(); } catch {} socket = null; }
  }

  // ---------- Demo ----------
  function demoSeed(sym) {
    if (quotes[sym]) return;
    const base = (typeof SHARIAH_DB !== "undefined" && SHARIAH_DB[sym]?.price) || 50 + (hash(sym) % 200);
    const prevClose = base;
    const open = base * (1 + (((hash(sym + "d") % 400) - 200) / 10000));
    store(sym, round(open), prevClose);
  }

  function demoTick() {
    symbols.forEach(sym => {
      if (Math.random() < 0.45) return; // not every stock trades every tick
      const q = quotes[sym];
      const drift = (Math.random() - 0.5) * 0.004; // +/-0.2%
      store(sym, round(q.price * (1 + drift)));
    });
  }

  function startDemo() {
    stopDemo();
    symbols.forEach(demoSeed);
    demoTimer = setInterval(demoTick, DEMO_TICK_MS);
    setStatus("demo", "Demo prices - add a Finnhub key in Settings for live data");
  }
  function stopDemo() { clearInterval(demoTimer); demoTimer = null; }

  const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const round = (n) => Math.round(n * 100) / 100;

  // ---------- Public ----------
  function start() {
    stopDemo(); clearInterval(pollTimer); closeSocket();
    if (!apiKey) return startDemo();
    quotes = {};
    setStatus("connecting", "Connecting...");
    pollAll();
    pollTimer = setInterval(pollAll, POLL_MS);
    openSocket();
  }

  return {
    onQuote(fn) { listeners.push(fn); },
    onStatus(fn) { statusListeners.push(fn); fn(status); },
    get(sym) { return quotes[sym]; },
    isLive() { return !!apiKey; },
    setKey(key) { apiKey = (key || "").trim(); start(); },
    track(list) {
      const next = new Set(list.map(s => s.toUpperCase()));
      const added = [...next].filter(s => !symbols.has(s));
      const removed = [...symbols].filter(s => !next.has(s));
      symbols = next;
      if (!apiKey) { added.forEach(demoSeed); return; }
      added.forEach(s => {
        fetchQuote(s).catch(e => setStatus("error", e.message));
        if (socket?.readyState === 1) socket.send(JSON.stringify({ type: "subscribe", symbol: s }));
      });
      removed.forEach(s => {
        if (socket?.readyState === 1) socket.send(JSON.stringify({ type: "unsubscribe", symbol: s }));
      });
    },
    /* One-off quote for a symbol not necessarily tracked. */
    async quote(sym) {
      sym = sym.toUpperCase();
      if (!apiKey) { demoSeed(sym); return quotes[sym]; }
      await fetchQuote(sym);
      return quotes[sym];
    },
    /* Checks a key with one real quote. Resolves { price } or throws a readable error. */
    async testKey(key) {
      let res;
      try { res = await fetch(`${API}/quote?symbol=AAPL&token=${encodeURIComponent(key)}`); }
      catch { throw new Error("Can't reach Finnhub from this page. Open the website version (GitHub Pages) to use live prices."); }
      if (res.status === 401 || res.status === 403) throw new Error("Finnhub rejected this key. Check you copied all of it.");
      if (res.status === 429) throw new Error("Finnhub's rate limit was hit. Wait a minute and try again.");
      if (!res.ok) throw new Error(`Finnhub error (HTTP ${res.status}).`);
      const q = await res.json();
      if (!q || !q.c) throw new Error("Finnhub answered but sent no price. Try again in a minute.");
      return { price: q.c };
    },
    /* Company name + industry, used to auto-screen unknown tickers. */
    async profile(sym) {
      if (!apiKey) return null;
      try {
        const p = await api("/stock/profile2", { symbol: sym.toUpperCase() });
        return p && p.name ? { name: p.name, industry: p.finnhubIndustry, logo: p.logo } : null;
      } catch { return null; }
    },
    start,
  };
})();

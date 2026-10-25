/*
 * Minimal SVG donut chart with a hover tooltip. No dependencies.
 *
 * donut(container, segments, { center, sub, size })
 *   segments: [{ label, value, color, detail }]
 */
const Charts = (() => {
  const SVG = "http://www.w3.org/2000/svg";
  let tip;

  function tooltip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    return tip;
  }

  function arcPath(cx, cy, rOuter, rInner, a0, a1) {
    const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = p(rOuter, a0), [x1, y1] = p(rOuter, a1);
    const [x2, y2] = p(rInner, a1), [x3, y3] = p(rInner, a0);
    return `M${x0},${y0} A${rOuter},${rOuter} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rInner},${rInner} 0 ${large} 0 ${x3},${y3} Z`;
  }

  function donut(container, segments, opts = {}) {
    const size = opts.size || 240;
    const cx = size / 2, cy = size / 2;
    const rOuter = size / 2 - 4, rInner = rOuter * 0.68;
    const total = segments.reduce((s, d) => s + Math.max(0, d.value), 0);

    container.innerHTML = "";
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("class", "donut");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", opts.ariaLabel || "Donut chart");

    if (!total) {
      const ring = document.createElementNS(SVG, "circle");
      ring.setAttribute("cx", cx); ring.setAttribute("cy", cy);
      ring.setAttribute("r", (rOuter + rInner) / 2);
      ring.setAttribute("class", "donut-empty");
      ring.setAttribute("stroke-width", rOuter - rInner);
      svg.appendChild(ring);
    } else {
      const shown = segments.filter(d => d.value > 0);
      // 2px surface gap between segments, expressed as an angle at mid radius
      const gap = shown.length > 1 ? 2 / ((rOuter + rInner) / 2) : 0;
      let a = -Math.PI / 2;
      shown.forEach(d => {
        const sweep = (d.value / total) * Math.PI * 2;
        let a0 = a + gap / 2, a1 = a + sweep - gap / 2;
        if (shown.length === 1) { a0 = a; a1 = a + Math.PI * 2 - 0.0001; }
        const path = document.createElementNS(SVG, "path");
        path.setAttribute("d", arcPath(cx, cy, rOuter, rInner, a0, Math.max(a0 + 0.001, a1)));
        path.setAttribute("fill", d.color);
        path.setAttribute("class", "donut-seg");
        path.setAttribute("tabindex", "0");
        const pct = ((d.value / total) * 100).toFixed(1);
        path.setAttribute("aria-label", `${d.label}: ${pct}%`);
        const show = (ev) => {
          const t = tooltip();
          t.innerHTML = `<strong>${escapeHtml(d.label)}</strong><span>${pct}%${d.detail ? " · " + escapeHtml(d.detail) : ""}</span>`;
          t.classList.add("show");
          const rect = ev.currentTarget.getBoundingClientRect();
          const x = ev.clientX ?? rect.left + rect.width / 2;
          const y = ev.clientY ?? rect.top;
          t.style.left = `${Math.min(window.innerWidth - t.offsetWidth - 8, x + 12)}px`;
          t.style.top = `${y + 12}px`;
          svg.querySelectorAll(".donut-seg").forEach(s => s.classList.toggle("dim", s !== path));
        };
        const hide = () => {
          tooltip().classList.remove("show");
          svg.querySelectorAll(".donut-seg").forEach(s => s.classList.remove("dim"));
        };
        path.addEventListener("mousemove", show);
        path.addEventListener("focus", show);
        path.addEventListener("mouseleave", hide);
        path.addEventListener("blur", hide);
        svg.appendChild(path);
        a += sweep;
      });
    }

    const label = (text, y, cls) => {
      const t = document.createElementNS(SVG, "text");
      t.setAttribute("x", cx); t.setAttribute("y", y);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("class", cls);
      t.textContent = text;
      svg.appendChild(t);
    };
    if (opts.center) label(opts.center, cy + (opts.sub ? 2 : 8), "donut-center");
    if (opts.sub) label(opts.sub, cy + 24, "donut-sub");

    container.appendChild(svg);
  }

  /*
   * Line chart with a crosshair tooltip.
   * series: [{ label, color, points: [[ "YYYY-MM-DD", value ]], dashed, area }]
   */
  function line(container, series, opts = {}) {
    const fmt = opts.format || (v => v.toFixed(2));
    const W = Math.max(280, container.clientWidth || 600);
    const H = opts.height || 280;
    const narrow = W < 480;
    const endLabels = opts.endLabels !== false && !narrow;
    container.innerHTML = "";

    const data = series.filter(s => s.points && s.points.length);
    if (!data.length) {
      container.innerHTML = `<div class="chart-empty">${escapeHtml(opts.empty || "No data yet")}</div>`;
      return;
    }
    const dates = [...new Set(data.flatMap(s => s.points.map(p => p[0])))].sort();
    // Points are "YYYY-MM-DD" (daily) or "YYYY-MM-DD HH:MM" (intraday, local time)
    const intraday = (d) => d.length > 10;
    const t = (d) => intraday(d) ? new Date(d.replace(" ", "T")).getTime() : new Date(d + "T12:00:00Z").getTime();
    const asDate = (d) => new Date(t(d));
    const t0 = t(dates[0]), t1 = t(dates[dates.length - 1]) || t0 + 1;
    const vals = data.flatMap(s => s.points.map(p => p[1]));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (opts.zero) lo = Math.min(0, lo);
    if (opts.baseline != null) { lo = Math.min(lo, opts.baseline); hi = Math.max(hi, opts.baseline); }
    if (lo === hi) { lo -= Math.abs(lo) * 0.05 || 1; hi += Math.abs(hi) * 0.05 || 1; }
    const ticks = niceTicks(lo, hi, 5);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    // Short axis labels, unless rounding would make two of them read the same
    let labels = ticks.map(v => opts.axisFormat ? opts.axisFormat(v) : fmt(v));
    if (new Set(labels).size < labels.length) labels = ticks.map(v => fmt(v).replace(/\.00$/, ""));
    const widest = Math.max(...labels.map(l => l.length));
    const m = { l: Math.max(narrow ? 44 : 60, widest * 6.6 + 14), r: endLabels ? 74 : 12, t: 14, b: 28 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = (d) => m.l + (t1 === t0 ? iw / 2 : ((t(d) - t0) / (t1 - t0)) * iw);
    const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "linechart", role: "img", "aria-label": opts.ariaLabel || "Line chart" });
    const defs = el("defs");
    svg.appendChild(defs);

    // Grid + y labels
    ticks.forEach((v, ti) => {
      svg.appendChild(el("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: "grid" }));
      const tx = el("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end", class: "axis" });
      tx.textContent = labels[ti];
      svg.appendChild(tx);
    });
    // X labels
    const spanDays = (t1 - t0) / 864e5;
    const xFmt = (d) => spanDays < 2 && intraday(d)
      ? asDate(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : asDate(d).toLocaleDateString("en-US", spanDays > 300 ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" });
    const nX = Math.min(dates.length, narrow ? 3 : 6);
    for (let i = 0; i < nX; i++) {
      const d = dates[Math.round((i / Math.max(1, nX - 1)) * (dates.length - 1))];
      const tx = el("text", { x: x(d), y: H - 8, "text-anchor": i === 0 ? "start" : i === nX - 1 ? "end" : "middle", class: "axis" });
      tx.textContent = xFmt(d);
      svg.appendChild(tx);
    }

    // Reference line, e.g. yesterday's close on a 1D chart
    if (opts.baseline != null) {
      svg.appendChild(el("line", { x1: m.l, x2: m.l + iw, y1: y(opts.baseline), y2: y(opts.baseline), class: "baseline" }));
    }
    // Series
    data.forEach((s, si) => {
      const pts = s.points.map(p => [x(p[0]), y(p[1])]);
      const dPath = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
      if (s.area) {
        const id = `g${Math.random().toString(36).slice(2)}`;
        const g = el("linearGradient", { id, x1: 0, x2: 0, y1: 0, y2: 1 });
        g.appendChild(el("stop", { offset: "0%", "stop-color": s.color, "stop-opacity": 0.22 }));
        g.appendChild(el("stop", { offset: "100%", "stop-color": s.color, "stop-opacity": 0 }));
        defs.appendChild(g);
        svg.appendChild(el("path", { d: `${dPath}L${pts[pts.length - 1][0]},${m.t + ih}L${pts[0][0]},${m.t + ih}Z`, fill: `url(#${id})` }));
      }
      svg.appendChild(el("path", { d: dPath, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": s.dashed ? "5 5" : "none" }));
      const last = pts[pts.length - 1];
      if (!s.dashed) svg.appendChild(el("circle", { cx: last[0], cy: last[1], r: 4, fill: s.color, class: "end-dot" }));
    });
    // Direct end labels, nudged apart so they don't collide
    if (endLabels) {
      const labs = data.map(s => ({ s, y: y(s.points[s.points.length - 1][1]) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 14) labs[i].y = labs[i - 1].y + 14;
      labs.forEach(({ s, y: ly }) => {
        const tx = el("text", { x: m.l + iw + 8, y: ly + 4, class: "end-label" });
        tx.textContent = s.short || s.label;
        svg.appendChild(tx);
      });
    }

    // Hover layer
    const cross = el("line", { y1: m.t, y2: m.t + ih, class: "crosshair", visibility: "hidden" });
    svg.appendChild(cross);
    const dots = data.map(s => { const c = el("circle", { r: 4.5, fill: s.color, class: "hover-dot", visibility: "hidden" }); svg.appendChild(c); return c; });
    const hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", class: "hit" });
    svg.appendChild(hit);
    const maps = data.map(s => s.points);
    const at = (pts, d) => { let v = null; for (const p of pts) { if (p[0] <= d) v = p[1]; else break; } return v; };
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const tt = t0 + ((px - m.l) / iw) * (t1 - t0);
      let best = dates[0];
      for (const d of dates) { if (Math.abs(t(d) - tt) < Math.abs(t(best) - tt)) best = d; }
      const cx = x(best);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      const rows = [];
      data.forEach((s, i) => {
        const v = at(maps[i], best);
        if (v == null) { dots[i].setAttribute("visibility", "hidden"); return; }
        dots[i].setAttribute("cx", cx); dots[i].setAttribute("cy", y(v)); dots[i].setAttribute("visibility", "visible");
        rows.push(`<span class="tip-row"><i style="background:${s.color}"></i>${escapeHtml(s.short || s.label)}<b>${escapeHtml(fmt(v))}</b></span>`);
      });
      const tp = tooltip();
      const when = intraday(best)
        ? asDate(best).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : asDate(best).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      tp.innerHTML = `<strong>${when}</strong>${rows.join("")}`;
      tp.classList.add("show");
      const left = ev.clientX + 14 + tp.offsetWidth > window.innerWidth ? ev.clientX - tp.offsetWidth - 14 : ev.clientX + 14;
      tp.style.left = `${Math.max(8, left)}px`;
      tp.style.top = `${ev.clientY - 10}px`;
    };
    const leave = () => {
      cross.setAttribute("visibility", "hidden");
      dots.forEach(d => d.setAttribute("visibility", "hidden"));
      tooltip().classList.remove("show");
    };
    hit.addEventListener("mousemove", move);
    hit.addEventListener("touchmove", (e) => { move(e.touches[0]); }, { passive: true });
    hit.addEventListener("mouseleave", leave);
    hit.addEventListener("touchend", leave);
    container.appendChild(svg);
  }

  function niceTicks(lo, hi, n) {
    const span = hi - lo;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => span / s <= n) || 10 * mag;
    const out = [];
    for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(Math.round(v / step) * step);
    if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
    return out;
  }

  function el(tag, attrs = {}) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  return { donut, line, escapeHtml };
})();

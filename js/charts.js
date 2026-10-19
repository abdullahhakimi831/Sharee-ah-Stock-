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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  return { donut, escapeHtml };
})();

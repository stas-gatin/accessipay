// Small building blocks shared by every analytics chart: motion that runs once (and never under
// reduced motion), a tooltip per mark, a "Show the data" table, and section and card frames.
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Counts up to the value once, unless the reader asked for reduced motion.
export function CountUp({ value, suffix = '' }) {
  const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v);
  const [shown, setShown] = useState(reduced() ? value : 0);
  useEffect(() => {
    if (value == null || reduced()) { setShown(value); return undefined; }
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / 900);
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown == null ? '—' : fmt(shown)}{suffix}</>;
}

// True once the element has scrolled into view; true at once under reduced motion.
export function useInView() {
  const ref = useRef(null);
  const [seen, setSeen] = useState(reduced());
  useEffect(() => {
    if (seen) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') { setSeen(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

// Width of an element in CSS pixels, so SVG charts draw at real size (text stays readable on phones).
export function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const TipCtx = createContext(null);

// A chart frame that owns one tooltip. Marks call useTip() to show it on hover and on keyboard focus.
export function ChartBox({ children, className = '' }) {
  const box = useRef(null);
  const [tip, setTip] = useState(null);
  const ctl = useMemo(() => ({
    show(el, content) {
      if (!box.current) return;
      const b = box.current.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const x = Math.max(90, Math.min(b.width - 90, r.left - b.left + r.width / 2));
      setTip({ x, y: r.top - b.top, content });
    },
    hide() { setTip(null); },
  }), []);
  return (
    <TipCtx.Provider value={ctl}>
      <div ref={box} className={`ax-chart ${className}`}>
        {children}
        {tip && (
          <div className="ax-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
            <strong>{tip.content.value}</strong>
            <span>{tip.content.label}</span>
            {(tip.content.lines || []).map((l) => <span key={l} className="ax-tip-line">{l}</span>)}
          </div>
        )}
      </div>
    </TipCtx.Provider>
  );
}

export function useTip(content) {
  const ctl = useContext(TipCtx);
  if (!ctl) return {};
  return {
    onPointerEnter: (e) => ctl.show(e.currentTarget, content),
    onPointerLeave: () => ctl.hide(),
    onFocus: (e) => ctl.show(e.currentTarget, content),
    onBlur: () => ctl.hide(),
  };
}

// One horizontal bar on a track. kind: '' (magnitude), 'ok', 'bad'.
export function Bar({ value, max, seen, tip, aria, kind = '', delay = 0, label }) {
  const handlers = useTip(tip);
  const w = max ? Math.max(0, (value / max) * 100) : 0;
  return (
    <span className="ax-bar-row">
      <span className="ax-track">
        <span role="img" tabIndex={0} aria-label={aria} className={`ax-bar ${kind}`} style={{ width: seen ? `${w}%` : 0, transitionDelay: `${delay}ms` }} {...handlers} />
      </span>
      {label != null && <span className="ax-val">{label}</span>}
    </span>
  );
}

export function DataTable({ caption, head, rows, numeric = [] }) {
  return (
    <details className="ax-data">
      <summary>Show the data</summary>
      <div className="ax-scroll" role="region" aria-label={`${caption}, data table`} tabIndex={0}>
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead><tr>{head.map((h, j) => <th key={h} scope="col" className={numeric.includes(j) ? 'num' : ''}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j} className={numeric.includes(j) ? 'num' : ''}>{c}</td>))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function Section({ id, title, intro, children, n }) {
  return (
    <section className="ax-section" id={id} aria-labelledby={`${id}-h`}>
      <div className="ax-section-head">
        {n != null && <span className="ax-section-n" aria-hidden="true">{String(n).padStart(2, '0')}</span>}
        <div>
          <h2 id={`${id}-h`}>{title}</h2>
          {intro && <p className="ax-intro">{intro}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

// A chart card: heading, the one-line takeaway (computed by the caller), the chart, the data table.
export function Card({ title, takeaway, note, children, wide, className = '' }) {
  return (
    <figure className={`ax-card ${wide ? 'wide' : ''} ${className}`}>
      <figcaption>
        {title && <h3>{title}</h3>}
        {takeaway && <p className="ax-takeaway">{takeaway}</p>}
        {note && <p className="ax-note">{note}</p>}
      </figcaption>
      {children}
    </figure>
  );
}

export function Legend({ items }) {
  return (
    <ul className="ax-legend" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label}><i className={`ax-key ${it.cls}`} style={it.style} aria-hidden="true" />{it.label}</li>
      ))}
    </ul>
  );
}

// Outcome mark in SVG: shape and colour together, always next to a text label somewhere.
export function OutcomeGlyph({ shape, x = 0, y = 0, r = 5 }) {
  if (shape === 'paid') return <circle className="ax-g-paid" cx={x} cy={y} r={r} />;
  if (shape === 'reached') return <circle className="ax-g-reached" cx={x} cy={y} r={r - 0.5} />;
  if (shape === 'wrong') return <rect className="ax-g-wrong" x={x - r} y={y - r} width={r * 2} height={r * 2} transform={`rotate(45 ${x} ${y})`} />;
  const d = r - 0.5;
  return <path className="ax-g-blocked" d={`M${x - d} ${y - d}L${x + d} ${y + d}M${x + d} ${y - d}L${x - d} ${y + d}`} />;
}

export function GlyphKey({ shape }) {
  return (
    <svg className="ax-glyph-key" width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true" focusable="false">
      <OutcomeGlyph shape={shape} r={5} />
    </svg>
  );
}

// True while the media query matches (follows resizes and rotation).
export function useMedia(query) {
  const get = () => typeof matchMedia === 'function' && matchMedia(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const m = matchMedia(query);
    const f = () => setOn(m.matches);
    m.addEventListener?.('change', f);
    return () => m.removeEventListener?.('change', f);
  }, [query]);
  return on;
}

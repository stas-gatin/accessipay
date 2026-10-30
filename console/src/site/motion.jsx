import React, { useEffect, useRef, useState } from 'react';

// Motion rules (designer.md, section 3): transform/opacity only, content visible by default,
// every animation has a prefers-reduced-motion fallback, loops over 5 s have a Pause control.

const mq = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null);

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => !!mq()?.matches);
  useEffect(() => {
    const m = mq();
    if (!m) return undefined;
    const on = () => setReduced(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

// True once the element has been at least `threshold` visible (once = true), or while visible (once = false).
export function useInView(ref, { threshold = 0.2, once = true } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); if (once) io.disconnect(); } else if (!once) setInView(false);
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold, once]);
  return inView;
}

export function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

// Block reveal: fades in and rises 12 px once. Without JS motion (reduced motion) it is simply visible.
export function Reveal({ as: Tag = 'div', className = '', children, stagger = false, ...rest }) {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.12 });
  return (
    <Tag ref={ref} className={`rv${stagger ? ' rv-stagger' : ''}${inView ? ' in' : ''}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </Tag>
  );
}

// Counts up once on first view. Screen readers get the real value; the animated copy is aria-hidden.
export function CountUp({ value, prefix = '', suffix = '', duration = 900 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.4 });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced || !inView || typeof value !== 'number') { setShown(value); return undefined; }
    let raf; const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, reduced, duration]);
  return (
    <span ref={ref} className="tnum">
      <span className="sr-only">{prefix}{value}{suffix}</span>
      <span aria-hidden="true">{prefix}{shown}{suffix}</span>
    </span>
  );
}

// Founder-generated brand images live in /img/brand/ (compressed to WebP; callers keep the .png names from the plan). Until they exist (or if one fails to load),
// a geometric drawing in the same palette fills the slot, so the layout always looks complete.
export function BrandImg({ name, alt = '', art, className = '', ratio = '4 / 3', eager = false }) {
  const [state, setState] = useState('loading');
  return (
    <div className={`bimg bimg-${state}${className ? ` ${className}` : ''}`} style={{ aspectRatio: ratio }}>
      <BrandArt kind={art} />
      {state !== 'failed' && (
        <img
          src={`/img/brand/${name.replace(/\.png$/, '.webp')}`}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      )}
    </div>
  );
}

// Fallback art: flat navy, fine grid, one green accent. Decorative only.
export function BrandArt({ kind }) {
  const G = '#18c48f';
  const W = 'rgba(255,255,255,.78)';
  const F = 'rgba(255,255,255,.14)';
  let body = null;
  if (kind === 'screenreader') {
    // A braille cell row: dots, with one cell lit.
    const cells = [[1, 1, 1, 0, 0, 0], [1, 0, 1, 1, 0, 0], [1, 1, 0, 1, 1, 0], [1, 0, 0, 1, 1, 1], [1, 1, 1, 1, 0, 0]];
    body = (
      <g transform="translate(70 92)">
        <rect x="-20" y="-24" width="300" height="118" rx="18" fill="rgba(255,255,255,.05)" stroke={F} />
        {cells.map((c, i) => c.map((on, j) => (
          <circle key={`${i}-${j}`} cx={i * 56 + (j < 3 ? 0 : 18)} cy={(j % 3) * 18 + 16} r="5.5" fill={i === 3 ? (on ? G : 'rgba(24,196,143,.2)') : (on ? W : F)} />
        )))}
        <rect x={3 * 56 - 14} y="-6" width="46" height="72" rx="12" fill="none" stroke={G} strokeWidth="2.5" />
      </g>
    );
  } else if (kind === 'keyboard') {
    const keys = [[40, 150, 120, 'Tab'], [176, 150, 64], [256, 150, 64], [92, 82, 64], [172, 82, 64], [252, 82, 82]];
    body = (
      <g>
        {keys.map(([x, y, w, k], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height="54" rx="10" fill="rgba(255,255,255,.07)" stroke={k ? G : F} strokeWidth={k ? 2.5 : 1} />
            {k && <rect x={x - 7} y={y - 7} width={w + 14} height="68" rx="15" fill="none" stroke={G} strokeOpacity=".45" strokeWidth="1.5" />}
          </g>
        ))}
        <path d="M70 177h52m-10-9l10 9-10 9" stroke={W} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  } else if (kind === 'agents') {
    body = (
      <g>
        {[[0, 30], [0, 120], [0, 210], [400, 50], [400, 190], [130, 0], [270, 240]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} C ${(x + 200) / 2} ${y}, ${(x + 200) / 2} 125, 200 125`} stroke={F} strokeWidth="1.5" fill="none" />
        ))}
        <path d="M168 92h64l10 72h-84z" fill="rgba(255,255,255,.08)" stroke={W} strokeOpacity=".5" />
        <path d="M184 92c0-18 32-18 32 0" stroke={W} strokeOpacity=".5" fill="none" strokeWidth="2" />
        <circle cx="200" cy="132" r="13" fill={G} />
      </g>
    );
  } else if (kind === 'merchants') {
    body = (
      <g>
        <rect x="70" y="140" width="92" height="70" rx="6" fill="rgba(255,255,255,.08)" stroke={F} />
        <rect x="170" y="150" width="78" height="60" rx="6" fill="rgba(255,255,255,.08)" stroke={F} />
        <rect x="96" y="86" width="80" height="56" rx="6" fill="rgba(255,255,255,.08)" stroke={F} />
        <rect x="128" y="86" width="16" height="56" fill={G} />
        <rect x="272" y="118" width="64" height="92" rx="10" fill="rgba(255,255,255,.08)" stroke={W} strokeOpacity=".4" />
        <path d="M284 118v-34h40v34" fill="rgba(255,255,255,.9)" />
        <path d="M292 94h24M292 104h16" stroke="#0b1b33" strokeWidth="2" />
      </g>
    );
  } else if (kind === 'chain') {
    body = (
      <g>
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M0 ${22 + i * 24} C 160 ${22 + i * 24}, 220 125, 330 125`} stroke={i === 4 ? G : F} strokeWidth={i === 4 ? 2 : 1.2} fill="none" />
        ))}
        <circle cx="340" cy="125" r="22" fill={G} />
        <circle cx="340" cy="125" r="34" fill="none" stroke={G} strokeOpacity=".35" strokeWidth="2" />
      </g>
    );
  } else if (kind === 'method') {
    body = (
      <g>
        {[40, 70, 100, 130].map((r, i) => <ellipse key={i} cx="290" cy="80" rx={r * 1.3} ry={r * 0.8} fill="none" stroke={F} />)}
        <path d="M30 220 C 90 200, 110 150, 170 160 S 250 120, 290 80" stroke={G} strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" fill="none" />
        {[[30, 220], [100, 182], [170, 160], [232, 124]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" fill={W} />)}
        <circle cx="290" cy="80" r="10" fill={G} />
      </g>
    );
  } else if (kind === 'sites') {
    body = (
      <g>
        <rect x="40" y="206" width="320" height="14" rx="4" fill="rgba(255,255,255,.1)" />
        {[[60, F], [160, W], [260, G]].map(([x, c], i) => (
          <g key={i}>
            <rect x={x} y="110" width="80" height="96" rx="4" fill="rgba(255,255,255,.07)" stroke={F} />
            <path d={`M${x - 6} 110h92l-8 -22h-76z`} fill={c} fillOpacity={c === W ? 0.85 : 1} />
            <rect x={x + 28} y="160" width="24" height="46" rx="3" fill="rgba(255,255,255,.12)" />
          </g>
        ))}
      </g>
    );
  } else {
    // Cover / default: the mark as an object.
    body = (
      <g>
        <rect x="110" y="88" width="180" height="76" rx="38" fill="none" stroke={G} strokeWidth="3" />
        <rect x="136" y="110" width="128" height="32" rx="16" fill={G} />
      </g>
    );
  }
  return (
    <svg className="bart" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="400" height="250" fill="#0b1b33" />
      <g stroke="rgba(255,255,255,.045)" strokeWidth="1">
        {Array.from({ length: 13 }, (_, i) => <path key={`v${i}`} d={`M${i * 32} 0V250`} />)}
        {Array.from({ length: 9 }, (_, i) => <path key={`h${i}`} d={`M0 ${i * 32}H400`} />)}
      </g>
      {body}
    </svg>
  );
}

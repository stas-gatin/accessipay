import { useEffect } from 'react';

// Motion for every page, not only the brand pages: blocks below the fold rise in as they scroll into
// view, siblings one after another, including blocks that appear later when data arrives.
// Off for people who ask for reduced motion, and anything already on screen is never hidden.

const BLOCKS = [
  '.page > *', '.page section', '.card', '[class*="ax-card"]', '.ax-kpi', '.ax-site', '.ax-pair', 'table',
  '.ag-root-wrapper', 'figure', '.rv-auto', '[class*="rep-"] > section', '.report section', '.rt-step', '.theater-panel',
  // Home page blocks that have no reveal of their own.
  '.lp .sweep-table', '.lp .sweep-row', '.lp .sweep-shops', '.lp .sweep-stats li', '.lp .sweep-own', '.lp .ledger', '.lp .ledger-list > li',
  '.lp .fixlist > li', '.lp .calc', '.lp .calc-out li', '.lp .effort', '.lp .chain-foot', '.lp .foot-note', '.lp .sweep-h', '.lp .final h2', '.lp .final .cta-row',
].join(', ');
// The brand pages manage their own reveal; the replay and live views move on their own.
const SKIP = '.rv, .rv-stagger, .rp, .lp .hero-lp, .chain-list, [data-no-reveal]';

// Plain whole numbers in a block count up from zero the first time the block is seen.
const COUNT = '.sr-verdict-n, .sr-tile-nums b, .proof-grid .pv, .stat b, .kpi b, .sweep-stats b, .rv-banner-effort, td.num, .ledger .num';
function countUp(root) {
  for (const el of root.querySelectorAll(COUNT)) {
    if (el.dataset.counted) continue;
    el.dataset.counted = '1';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (/\d/.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const final = n.nodeValue;
      const nums = final.match(/\d[\d,]*/g) || [];
      if (!nums.length || nums.some((x) => x.replace(/,/g, '').length > 6)) continue;
      const t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / 800);
        const e = 1 - Math.pow(1 - k, 3);
        n.nodeValue = k >= 1 ? final : final.replace(/\d[\d,]*/g, (x) => Math.round(Number(x.replace(/,/g, '')) * e).toLocaleString('en-US'));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }
}

export function useAutoReveal(rootRef, key) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return undefined;

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('arv-in');
        countUp(e.target);
        io.unobserve(e.target);
      }
    }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });

    const scan = () => {
      const fold = window.innerHeight * 0.92;
      for (const el of root.querySelectorAll(BLOCKS)) {
        if (el.dataset.arv || el.closest(SKIP) || el.parentElement?.closest('.arv:not(.arv-in)')) continue;
        el.dataset.arv = '1';
        if (el.getBoundingClientRect().top < fold) { countUp(el); continue; } // already seen: never hide it
        const siblings = el.parentElement ? [...el.parentElement.children].filter((c) => c.dataset.arv) : [];
        el.style.setProperty('--arv-d', `${Math.min(siblings.indexOf(el), 5) * 60}ms`);
        el.classList.add('arv');
        io.observe(el);
      }
    };
    scan();
    let t = null;
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 60); });
    mo.observe(root, { childList: true, subtree: true });
    // Safety net: an observer can miss blocks inside scroll containers; anything on screen after a scroll is shown.
    let raf = 0;
    const sweep = () => {
      raf = 0;
      for (const el of root.querySelectorAll('.arv:not(.arv-in)')) {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) { el.classList.add('arv-in'); countUp(el); io.unobserve(el); }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(sweep); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { io.disconnect(); mo.disconnect(); clearTimeout(t); window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [rootRef, key]);
}

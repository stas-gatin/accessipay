import { useEffect } from 'react';

// Motion for every page, not only the brand pages: blocks below the fold rise in as they scroll into
// view, siblings one after another, including blocks that appear later when data arrives.
// Off for people who ask for reduced motion, and anything already on screen is never hidden.

const BLOCKS = [
  '.page > *', '.page section', '.card', '[class*="ax-card"]', '.ax-kpi', '.ax-site', '.ax-pair', 'table',
  '.ag-root-wrapper', 'figure', '.rv-auto', '[class*="rep-"] > section', '.report section', '.rt-step', '.theater-panel',
].join(', ');
// The brand pages manage their own reveal; the replay and live views move on their own.
const SKIP = '.rv, .rv-stagger, .rp, .lp .hero-lp, [data-no-reveal]';

export function useAutoReveal(rootRef, key) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return undefined;

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('arv-in');
        io.unobserve(e.target);
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

    const scan = () => {
      const fold = window.innerHeight * 0.92;
      for (const el of root.querySelectorAll(BLOCKS)) {
        if (el.dataset.arv || el.closest(SKIP) || el.parentElement?.closest('.arv:not(.arv-in)')) continue;
        el.dataset.arv = '1';
        if (el.getBoundingClientRect().top < fold) continue; // already seen: never hide it
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
    return () => { io.disconnect(); mo.disconnect(); clearTimeout(t); };
  }, [rootRef, key]);
}

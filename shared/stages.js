// Checkout stages, shared by the engine, the analytics and the console.
export const STAGES = ['Browse', 'Cart', 'Checkout', 'Payment', 'Paid'];

// Stage of one page from its path or URL (demo shop paths or real-site URLs).
export function stageOfPage(where = '') {
  const w = String(where).toLowerCase();
  if (/\/done(\b|$)|order[-_ ]?confirm|thank/.test(w)) return 4;
  if (/\/pay(\b|$)|payment/.test(w)) return 3;
  if (/checkout/.test(w)) return 2;
  if (/cart|bag|basket/.test(w)) return 1;
  return 0;
}

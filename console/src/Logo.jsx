import React from 'react';

// "Focused Pay": a Pay button (the pill) wearing a keyboard focus ring (WCAG 2.4.7).
// The product asks one question: can this customer reach and press Pay? The mark is that state.
// Colours come from CSS custom properties so the mark adapts to light, dark and navy surfaces:
//   --mark-ring (default navy) and --mark-btn (default green fill).
export function LogoMark({ size = 32, draw = false, className = '', title }) {
  const h = Math.round((size * 24) / 40);
  return (
    <svg
      className={`ap-mark${draw ? ' ap-mark-draw' : ''}${className ? ` ${className}` : ''}`}
      width={size}
      height={h}
      viewBox="0 0 40 24"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      <rect className="ap-mark-ring" x="1.25" y="1.25" width="37.5" height="21.5" rx="10.75" fill="none" strokeWidth="2.5" pathLength="100" />
      <rect className="ap-mark-btn" x="6" y="6" width="28" height="12" rx="6" />
    </svg>
  );
}

// Lockup: mark + wordmark. The word is one colour, never PayPal blue.
export default function Logo({ size = 30, draw = false, as: Tag = 'span', className = '', ...rest }) {
  return (
    <Tag className={`ap-logo${className ? ` ${className}` : ''}`} {...rest}>
      <LogoMark size={size} draw={draw} />
      <span className="ap-word">AccessiPay</span>
    </Tag>
  );
}

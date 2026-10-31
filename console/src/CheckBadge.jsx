import React from 'react';

// How a finding was checked against the record of the run, without AI.
const LABEL = {
  confirmed: ['Confirmed by the record', 'ok'],
  partly: ['axe-core agrees', 'ok'],
  'not-confirmed': ['Not confirmed', 'warn'],
  manual: ['Needs a person', 'muted'],
};

export default function CheckBadge({ check }) {
  if (!check) return null;
  const [text, tone] = LABEL[check.status] || LABEL.manual;
  const detail = [check.by?.length ? `Checked with: ${check.by.join(', ')}.` : '', check.evidence || ''].filter(Boolean).join(' ');
  return (
    <span className={`check-badge ${tone}`} title={detail}>
      {text}
      {detail && <span className="sr-only">. {detail}</span>}
    </span>
  );
}

export function CheckLine({ check }) {
  if (!check || !check.evidence || check.status === 'manual') return null;
  return <span className="check-line">{check.status === 'confirmed' ? 'Record: ' : ''}{check.evidence}</span>;
}

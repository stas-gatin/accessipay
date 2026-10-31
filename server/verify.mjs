// Checks each finding a customer reported against the raw record of the run, without any AI:
// the page as the customer perceived it at that step (accessibility tree or visible text and focus),
// where keyboard focus actually went, and the axe-core result for the same page in the same state.
// A finding is "confirmed" only when the record shows it; otherwise "not confirmed", or "manual"
// when no automatic check exists for that kind of problem.

const ROLES = 'button|link|combobox|textbox|checkbox|radio|switch|spinbutton|searchbox|menuitem|tab|slider|heading|dialog';
const NAME_RULES = ['link-name', 'button-name', 'label', 'select-name', 'aria-input-field-name', 'input-button-name', 'aria-command-name', 'aria-toggle-field-name', 'frame-title'];

const KINDS = [
  { kind: 'vague', re: /named only (with )?[“"A-Z(]|named only with|called only|is named only|only (says|reads|named) [“"A-Z(]|name is only|has no clear label|generic name/i },
  { kind: 'unnamed', re: /no (accessible |visible |useful )?(name|label|text)|unnamed|unlabell?ed|without (an? )?(accessible )?(name|label)|named only|only (an |a )?(icon|image|glyph)|icon-only|empty (link|button|name)|no alt|has no role or (label|name)/i },
  { kind: 'duplicate', re: /same name|identical(ly)? named|same (accessible )?name|all (read|say|named)|repeat(s|ed)? (the )?(same )?name|share (one|the same) name|with the same|duplicat|appears twice|named .* twice/i },
  { kind: 'skip', re: /no skip|skip link|skip-to|without a skip|no way to skip/i },
  { kind: 'focus', re: /focus (was |is |got )?(lost|dropped|reset|jump|went|landed|moved to the top|returned to the top|back to the top|on an unrelated)|nothing focused|focus .*top of the page|lost my place/i },
  { kind: 'prechecked', re: /pre-?(checked|ticked|selected)|already (checked|ticked)/i },
  { kind: 'template', re: /translation missing|\{\{|\bundefined\b|raw (template|placeholder)/i },
  { kind: 'announce', re: /no (clear |visible |spoken )?(announcement|confirmation|feedback|status message)|not announced|nothing (was |is )?announced|announced nothing|without (any )?(announcement|confirmation)|no sign that|got no confirmation/i },
  { kind: 'loading', re: /\bloading\b|empty main|nearly empty|was blank|showed only a banner|page read as (completely )?blank/i },
  { kind: 'captcha', re: /captcha|press (and|&) hold|bot check/i },
];

// A finding can name several problems ("unnamed buttons, and focus jumps to the top"): every kind it names is checked.
export function kindsOf(f) {
  const text = `${f.problem || ''} ${f.element?.name || ''}`;
  return KINDS.filter((k) => k.re.test(text)).map((k) => k.kind);
}
export const kindOf = (f) => kindsOf(f)[0] || 'other';

const unnamedLines = (tree) => String(tree).split('\n').filter((l) => new RegExp(`^\\s*- (${ROLES})(\\s*\\[[^\\]]*\\])*:?\\s*$`).test(l)).map((l) => l.trim());

// The step the customer named, and its neighbours: a problem is often seen one step before or after it is reported.
function window(run, step) {
  const ev = run.events || [];
  const steps = [step - 1, step, step + 1];
  // The page after the last step is recorded in the end event, not as an observation.
  const end = ev.find((e) => e.type === 'end');
  const lastObs = Math.max(0, ...ev.filter((e) => e.type === 'observe').map((e) => e.step));
  const obs = [...ev.filter((e) => e.type === 'observe' && steps.includes(e.step)), ...(end && steps.some((n) => n > lastObs) ? [{ ...end, step: lastObs + 1 }] : [])];
  const acts = ev.filter((e) => e.type === 'act' && steps.includes(e.step));
  const at = obs.find((o) => o.step === step) || obs[0] || null;
  return {
    own: (obs.find((o) => o.step === step) || obs[0] || {}).text || '',
    text: obs.map((o) => o.text || '').join('\n'),
    next: obs.filter((o) => o.step > step).map((o) => o.text || '').join('\n'),
    // An empty "Keyboard focus:" line means nothing had focus.
    focus: [...acts.map((a) => a.result), ...obs.map((o) => { const m = o.text?.match(/Keyboard focus: ?(.*)$/m); return m ? (m[1].trim() || 'nothing focused') : null; })].filter(Boolean).join(' | '),
    url: at?.url || null,
  };
}

function axeFor(run, url) {
  const pages = run.scan?.pages || [];
  const page = pages.find((p) => p.url === url) || null;
  const rules = page ? (page.rules || (page.violations || []).map?.((v) => v.id) || []) : [...new Set(pages.flatMap((p) => p.rules || []))];
  return { rules, samePage: !!page };
}

// One check per kind of problem. Returns { by: [...sources], evidence } or null when it cannot be checked.
function check(kind, f, w, axe) {
  const by = [];
  let evidence = '';
  if (kind === 'unnamed') {
    // A control the finding names ("the tooltip button") that has a name in the record contradicts it.
    const named = (f.problem.match(/\b(?:the |a |an )?([A-Za-z][\w-]{2,20}) (button|link|checkbox|field|icon)s?\b/i) || [])[1];
    const role = (f.problem.match(/\b(button|link|checkbox)\b/i) || [])[1];
    if (named && role && !/^(icon|only|unnamed|unlabell?ed|empty|no|close|header|product|image)$/i.test(named)) {
      const has = w.own.match(new RegExp(`- ${role.toLowerCase()} "([^"]*${named}[^"]*)"`, 'i'));
      if (has) return { by, evidence: `The record shows this ${role.toLowerCase()} named “${has[1]}”: it has a name, perhaps not a useful one.` };
    }
    // Unnamed controls are looked for on the page of that very step, not its neighbours.
    const lines = unnamedLines(w.own);
    // Focus records come as "Focus moved to: X" after a key, or as the bare focus line of an observation.
    const kb = w.focus.match(/(?:Focus moved to: |^|\| )(button|link|checkbox|radio|combobox|text field|select|div|span)( \[shows an icon\])?( next to the text "")?(?=$| \||\s\(| value)/);
    if (lines.length) { by.push('page snapshot'); evidence = `${lines.length} control${lines.length === 1 ? '' : 's'} without a name, e.g. ${[...new Set(lines)].slice(0, 3).join(', ')}`; }
    else if (kb) { by.push('focus record'); evidence = `Focus landed on a control with no name: ${kb[0]}`; }
    const hit = axe.rules.filter((r) => NAME_RULES.includes(r));
    if (hit.length) by.push(`axe-core (${hit.join(', ')})`);
    return { by, evidence };
  }
  if (kind === 'vague') {
    // The control exists, but its whole name says little: show the name it really has.
    const name = f.element?.name || (f.problem.match(/named only (?:with )?[“"]?([^”".,;]+)/i) || [])[1];
    if (!name) return null;
    const esc = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = w.text.match(new RegExp(`- (${ROLES}) "${esc}[^"]{0,12}"`, 'i')) || w.focus.match(new RegExp(`Focus moved to: (button|link|[a-z ]+) "${esc}[^"]{0,12}"`, 'i'));
    if (m) { by.push('page snapshot'); evidence = `The control's whole name is ${m[0].replace(/^- |^Focus moved to: /, '')}`; }
    return { by, evidence };
  }
  if (kind === 'duplicate') {
    const counts = {};
    for (const m of w.text.matchAll(new RegExp(`- (${ROLES}) "([^"]+)"`, 'g'))) counts[`${m[1]} "${m[2]}"`] = (counts[`${m[1]} "${m[2]}"`] || 0) + 1;
    for (const m of w.focus.matchAll(/Focus moved to: (button|link) "([^"]+)"/g)) counts[`${m[1]} "${m[2]}"`] = (counts[`${m[1]} "${m[2]}"`] || 0) + 1;
    const want = (f.element?.name || '').toLowerCase().slice(0, 12);
    const dupes = Object.entries(counts).filter(([k, n]) => n > 1 && (!want || k.toLowerCase().includes(want)));
    const any = dupes.length ? dupes : Object.entries(counts).filter(([, n]) => n > 2);
    if (any.length) { by.push('page snapshot'); evidence = any.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${n} × ${k}`).join(', '); }
    else {
      // The keyboard customer reads visible text: count the label it names, or quoted labels in the finding.
      const names = [f.element?.name, ...(f.problem.match(/\b[A-Z][A-Z ]{3,}[A-Z]\b/g) || []), ...((f.problem.match(/(?:Every|All) ([A-Z][\w ]{3,30}?) (?:button|link)s?/) || []).slice(1))].filter(Boolean);
      for (const n of names) {
        const k = (w.text.match(new RegExp(`^\\s*${n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gim')) || []).length;
        if (k > 1) { by.push('page snapshot'); evidence = `${k} × “${n.trim()}” in the visible text of the page`; break; }
      }
    }
    return { by, evidence };
  }
  if (kind === 'skip') {
    const hasSkip = /link "[^"]*skip[^"]*"/i.test(w.text) || /Focus moved to: link "[^"]*skip/i.test(w.focus) || /skip to/i.test(w.text);
    if (w.text && !hasSkip) { by.push('page snapshot'); evidence = 'No link containing “skip” in the page the customer perceived.'; }
    if (axe.rules.includes('bypass')) by.push('axe-core (bypass)');
    return { by, evidence };
  }
  if (kind === 'focus') {
    // Only "focus was lost" can be read from the record; "focus went to some other link" needs the replay.
    if (!/lost|nothing focused|top of (the )?page|dropped|reset/i.test(f.problem || '')) return null;
    if (/(jumped|went|moved|landed) to (a|an|the) (link|heading|button)/i.test(f.problem || '')) return null; // where it landed needs the replay
    if (/nothing focused|top of page/i.test(w.focus)) { by.push('focus record'); evidence = `Recorded focus: ${w.focus.match(/[^|]*nothing focused[^|]*|[^|]*top of page[^|]*/i)?.[0].trim()}`; }
    return { by, evidence };
  }
  if (kind === 'prechecked') {
    if (!/(news|offer|email me|subscribe|marketing|updates|protection)/i.test(f.problem || '')) return null;
    const m = w.text.match(/checkbox "[^"]*(news|offer|email me|subscribe|marketing|updates)[^"]*" \[checked\]/i)
      || w.text.match(/checkbox[^\n]*(news|offer|email me|subscribe)[^\n]*\(checked\)/i)
      || w.focus.match(/checkbox[^|]*(news|offer|email me|subscribe)[^|]*\(checked\)/i);
    if (m) { by.push('page snapshot'); evidence = m[0]; }
    return { by, evidence };
  }
  if (kind === 'announce') {
    // A status, alert or log region with text is how a page announces a change; look for one in the step after.
    const after = w.next || '';
    if (!after) return null;
    const msg = after.match(/^\s*- (status|alert|log)(?: "[^"]+")?:?\s*(\n\s+- text: [^\n]+)?/m);
    if (msg && /text:|"/.test(msg[0])) { evidence = `A ${msg[1]} region is on the page after the action: ${msg[0].trim().replace(/\s+/g, ' ').slice(0, 100)}`; return { by, evidence }; }
    by.push('page snapshot'); evidence = 'No status, alert or log message in the page after the action.';
    return { by, evidence };
  }
  if (kind === 'loading') {
    const m = w.text.match(/[^\n]*\bLoading\b[^\n]*/i) || w.text.match(/^\s*- main\s*$/m) || w.text.match(/^\s*- main:\s*\n\s*- heading \[level=\d\]\s*$/m);
    if (m) { by.push('page snapshot'); evidence = m[0].trim().replace(/\s+/g, ' ').slice(0, 100); }
    return { by, evidence };
  }
  if (kind === 'template') {
    const m = w.text.match(/[^\n]{0,40}(Translation missing[^\n]{0,40}|\{\{[^}]*\}\}|\bundefined\b[^\n]{0,30})/);
    if (m) { by.push('page snapshot'); evidence = m[0].trim(); }
    return { by, evidence };
  }
  return null;
}

export function verifyFinding(run, f) {
  const kinds = kindsOf(f);
  const step = Number(f.step);
  if (!kinds.length || kinds.every((k) => k === 'captcha')) return { kind: kinds[0] || 'other', kinds, status: 'manual', by: [], evidence: kinds.includes('captcha') ? 'Seen on the screenshot; AccessiPay never interacts with bot checks.' : 'No automatic check for this kind of problem; read the step in the replay.' };
  if (!Number.isFinite(step)) return { kind: kinds[0], kinds, status: 'manual', by: [], evidence: 'The finding names no step to check.' };
  const w = window(run, step);
  const axe = axeFor(run, w.url);
  const results = kinds.map((k) => ({ k, r: check(k, f, w, axe) })).filter((x) => x.r);
  if (!results.length) return { kind: kinds[0], kinds, status: 'manual', by: [], evidence: 'This kind of problem needs the replay to judge.' };
  const by = [...new Set(results.flatMap((x) => x.r.by))];
  const evidence = results.map((x) => x.r.evidence).filter(Boolean).join(' · ');
  const status = by.some((b) => b === 'page snapshot' || b === 'focus record') ? 'confirmed' : by.length ? 'partly' : 'not-confirmed';
  return { kind: results[0].k, kinds, status, by, evidence: evidence || (status === 'partly' ? 'axe-core flags this kind of problem on the same page.' : 'The record of this step and its neighbours does not show it.'), url: w.url };
}

export function verifyFindings(run) {
  return (run.findings || []).map((f) => verifyFinding(run, f));
}

export function verificationSummary(checks) {
  const n = (s) => checks.filter((c) => c.status === s).length;
  const auto = checks.filter((c) => c.status !== 'manual').length;
  return { total: checks.length, checked: auto, confirmed: n('confirmed'), partly: n('partly'), notConfirmed: n('not-confirmed'), manual: n('manual') };
}

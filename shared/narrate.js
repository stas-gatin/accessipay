// One plain-English sentence per step, for the live run view, the replay and the step log.
// Shared by the console and the server (reports), so it has no dependencies.
//
// narrate(step, persona, ctx) -> { text, tone, perceived }
//   step:    { action, args, result, ok, refused, thinking, final, outcome }
//   persona: 'screenreader' | 'keyboard' | 'agent'
//   ctx:     { lastFocus } the element that had focus before this step (for Enter and typing)
//   tone:    'ok' | 'bad' | 'refused' | 'thinking' | 'done' | 'idle'
//   perceived: { label, text } what the customer heard or saw as a result, or null

export const FAILED = /did not work|There is no|cannot take keyboard focus|not available|Nothing was typed|Not allowed|No option starts/;

const q = (s) => `“${String(s).trim()}”`;
const clip = (s, n = 70) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

const KEY_NAMES = { Enter: 'Enter', Escape: 'Escape', Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', ArrowDown: 'the Down arrow', ArrowUp: 'the Up arrow', ArrowLeft: 'the Left arrow', ArrowRight: 'the Right arrow', Home: 'Home', End: 'End' };
export const keyName = (k) => KEY_NAMES[k] || k || 'a key';

const FIELD_KINDS = { email: 'email field', tel: 'phone field', number: 'number field', password: 'password field', search: 'search field', 'text field': 'text field', url: 'web address field', textarea: 'text box', select: 'drop-down list', input: 'field' };

// Turns the engine's description of a focused element into words:
//   'button "Subscribe"'                       -> 'the button “Subscribe”'
//   'email next to the text "Email"'           -> 'the email field labelled “Email”'
//   'textbox "Full name": Alex'                -> 'the text box “Full name”'
export function describeElement(raw) {
  if (!raw) return '';
  const s = String(raw).split('\n')[0].replace(/^- /, '').replace(/\s*\[shows an icon\]/, '').trim();
  if (/^nothing focused/.test(s)) return 'nothing (the top of the page)';
  if (/^an element with no name/.test(s)) return 'an element with no name';
  let m = s.match(/^([a-z][\w ]*?) next to the text "([^"]*)"/i);
  if (m) {
    const kind = FIELD_KINDS[m[1]] || (/(checkbox|radio)/.test(m[1]) ? m[1] : `${m[1]} field`);
    return `the ${kind} labelled ${q(clip(m[2], 50))}`;
  }
  m = s.match(/^([a-z][\w ]*?) "([^"]*)"/i);
  if (m) {
    const role = m[1] === 'textbox' ? 'text box' : m[1] === 'combobox' ? 'drop-down list' : m[1] === 'main' ? 'main content area' : m[1];
    return m[2] ? `the ${role} ${q(clip(m[2], 60))}` : `a ${role} with no name`;
  }
  m = s.match(/^([a-z][\w ]*?):?$/i);
  if (m) return `a ${m[1] === 'textbox' ? 'text box' : m[1]} with no name`;
  return clip(s, 70);
}

const roleWord = (role) => ({ textbox: 'text box', combobox: 'drop-down list', checkbox: 'checkbox', radio: 'option', link: 'link', button: 'button' }[role] || role || 'element');

// "Focus moved to: ..." -> the focused element's description.
const focusOf = (result) => { const m = String(result || '').match(/^Focus moved to: ([\s\S]*)$/); return m ? m[1] : null; };

function refusalText(result) {
  if (/signs in|passwords/.test(result)) return 'Stopped here: AccessiPay never signs in or creates accounts on a real site.';
  if (/card data/.test(result)) return 'Stopped here: AccessiPay never types card data on a real site.';
  return 'Stopped here: AccessiPay never pays on a real site.';
}

function failureText(step) {
  const a = step.args || {};
  const r = String(step.result || '');
  let m = r.match(/There is no (\w+) named "([^"]*)"/);
  if (m) return `Looked for a ${roleWord(m[1])} named ${q(m[2])}. There is none on the page.`;
  m = r.match(/The (\w+) "([^"]*)" is on the page but cannot take keyboard focus/);
  if (m) return `Found the ${roleWord(m[1])} ${q(m[2])}, but it cannot take keyboard focus.`;
  if (/Nothing was typed/.test(r)) return 'Tried to type, but the focused element is not a text field.';
  if (/not available to this persona/.test(r)) return `Tried “${step.action}”, which this customer cannot do.`;
  if (/No option starts/.test(r)) return `Typed ${q(a.text)} to pick an option, but no option starts with it.`;
  if (step.target?.missing || /waiting for|resolved to 0|Timeout/i.test(r)) {
    if (a.name) return `Looked for a ${roleWord(a.role || (step.action === 'fill' ? 'textbox' : step.action === 'select' ? 'combobox' : 'button'))} named ${q(a.name)}. There is none on the page.`;
  }
  const verb = { click: 'click', fill: 'fill in', select: 'choose in', check: 'tick' }[step.action];
  if (verb && a.name) return `Tried to ${verb} ${q(a.name)}, but it did not work.`;
  return `That did not work: ${clip(r.replace(/^That did not work:\s*/, ''), 90)}`;
}

export function narrate(step, persona = 'agent', ctx = {}) {
  if (!step) return { text: '', tone: 'idle', perceived: null };
  if (step.final) {
    const o = step.outcome?.status;
    const text = o === 'purchased' ? 'Paid. The order page confirms the purchase.'
      : o === 'reached-payment' ? 'Reached the payment step. Stopped there: nothing was paid.'
      : o === 'wrong-item' ? 'Paid, but not for what the customer asked.'
      : o === 'blocked' ? `Could not buy. The customer stopped at the ${ctx.stageName || 'last'} step.`
      : o === 'stopped' ? 'The run was stopped.'
      : 'The run ended.';
    return { text, tone: o === 'purchased' || o === 'reached-payment' ? 'done' : 'bad', perceived: null };
  }
  if (!step.action) {
    return step.thinking || step.observed
      ? { text: 'Deciding what to do next…', tone: 'thinking', perceived: null }
      : { text: 'Opening the shop…', tone: 'idle', perceived: null };
  }
  const a = step.args || {};
  const done = step.result != null;
  const ok = step.ok ?? !FAILED.test(step.result || '');
  const sr = persona === 'screenreader';
  const lastFocus = ctx.lastFocus ? describeElement(ctx.lastFocus) : '';

  if (step.action === 'done') return { text: step.closing ? 'Reports what was hard along the way.' : 'Says the purchase is done.', tone: 'done', perceived: null };
  if (step.action === 'give_up') return { text: 'Gives up. The customer cannot finish the purchase.', tone: 'bad', perceived: null };
  if (step.refused || /^Not allowed/.test(step.result || '')) return { text: refusalText(step.result || ''), tone: 'refused', perceived: null };
  if (done && !ok) return { text: failureText(step), tone: 'bad', perceived: step.target?.missing ? null : { label: sr ? 'Hears' : persona === 'keyboard' ? 'Sees' : 'Browser reply', text: step.result } };

  const focus = focusOf(step.result);
  const perceived = focus ? { label: sr ? 'Hears' : 'Sees focus on', text: focus.split('\n')[0].replace(/^- /, '') } : null;
  const moved = focus ? ` Focus moves to ${describeElement(focus)}.` : '';
  let text;
  switch (step.action) {
    case 'next': text = `Presses Tab.${moved}`; break;
    case 'prev': text = `Presses Shift+Tab.${focus ? ` Focus moves back to ${describeElement(focus)}.` : ''}`; break;
    case 'jump': text = `Opens the screen reader's list of controls and jumps to the ${roleWord(a.role)} ${q(a.name)}.`; break;
    case 'activate': text = lastFocus && !/^nothing/.test(lastFocus) ? `Presses Enter on ${lastFocus}.` : 'Presses Enter.'; break;
    case 'press': {
      const sel = String(step.result || '').match(/^Selected "([^"]*)"/);
      text = sel ? `Presses ${keyName(a.key)}. The list now shows ${q(sel[1])}.` : `Presses ${keyName(a.key)}.`;
      break;
    }
    case 'type': {
      const sel = String(step.result || '').match(/^Selected "([^"]*)"/);
      text = sel ? `Types ${q(a.text)} and the list picks ${q(sel[1])}.` : `Types ${q(clip(a.text ?? '', 50))}${lastFocus && !/^nothing/.test(lastFocus) ? ` into ${lastFocus}` : ''}.`;
      break;
    }
    case 'read': text = sr ? 'Listens to the whole page again.' : 'Reads the page again.'; break;
    case 'click': text = `Clicks the ${roleWord(a.role)} ${q(a.name)}.`; break;
    case 'fill': text = `Types ${q(clip(a.text ?? '', 50))} into ${q(a.name)}.`; break;
    case 'select': text = `Chooses ${q(a.option)} in ${q(a.name)}.`; break;
    case 'check': text = `${a.role === 'radio' ? 'Picks' : 'Ticks'} ${q(a.name)}.`; break;
    default: text = `${step.action}${a.name ? ` ${q(a.name)}` : ''}.`;
  }
  return { text, tone: done ? 'ok' : 'thinking', perceived };
}

// Short label for a step, for thumbnails and the step list: "Tab", "Enter", "Click “Pay”".
export function actionLabel(step) {
  if (!step) return '';
  if (step.final) return 'End';
  const a = step.args || {};
  switch (step.action) {
    case 'next': return 'Tab';
    case 'prev': return 'Shift+Tab';
    case 'activate': return 'Enter';
    case 'press': return a.key || 'Key';
    case 'type': return `Type ${q(clip(a.text ?? '', 18))}`;
    case 'jump': return `Jump to ${q(clip(a.name ?? '', 22))}`;
    case 'read': return 'Read page';
    case 'click': return `Click ${q(clip(a.name ?? '', 22))}`;
    case 'fill': return `Fill ${q(clip(a.name ?? '', 22))}`;
    case 'select': return `Choose ${q(clip(a.option ?? '', 18))}`;
    case 'check': return `Tick ${q(clip(a.name ?? '', 22))}`;
    case 'done': return 'Done';
    case 'give_up': return 'Gives up';
    default: return step.action || '…';
  }
}

// What each persona perceives and what it can do. The brain never gets pixels or HTML:
// - screenreader: the accessibility tree, moving and acting only with the keyboard
// - keyboard: the visible text of the page (a sighted user), acting only with the keyboard
// - agent: the accessibility tree, acting on elements by role and name, like browser agents do

export const PERSONAS = {
  screenreader: {
    label: 'Screen reader user',
    summary: 'Cannot see the screen. Hears the accessibility tree and uses only the keyboard.',
    actions: ['next', 'prev', 'jump', 'activate', 'press', 'type', 'read', 'done', 'give_up'],
    maxSteps: 70,
  },
  keyboard: {
    label: 'Keyboard-only user',
    summary: 'Sees the page but cannot use a mouse. Uses only the keyboard.',
    actions: ['next', 'prev', 'activate', 'press', 'type', 'read', 'done', 'give_up'],
    maxSteps: 90,
  },
  agent: {
    label: 'AI shopping agent',
    summary: 'An AI agent that reads the accessibility tree and acts on elements by role and name.',
    actions: ['click', 'fill', 'select', 'check', 'press', 'read', 'done', 'give_up'],
    maxSteps: 40,
  },
};

const KEYS = new Set(['Enter', 'Space', 'Escape', 'Tab', 'Shift+Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace']);
const MAX_TREE = 7000;

// Screen readers do not read link targets aloud; dropping them also keeps instance ids out.
const noUrls = (s) => {
  const lines = s.split('\n').filter((l) => !/^\s*- \/url:/.test(l));
  const indent = (l) => l.length - l.trimStart().length;
  // A line that ended in ":" only because its URL child was removed loses the colon.
  return lines.map((l, i) => (l.endsWith(':') && !(lines[i + 1] && indent(lines[i + 1]) > indent(l)) ? l.slice(0, -1) : l)).join('\n');
};
// Long option lists are summarised the way a screen reader announces them ("list, 250 options"),
// keeping the selected option and a few neighbours, so the rest of the form stays in view.
export const collapseOptions = (s) => {
  const lines = s.split('\n');
  const out = [];
  for (let i = 0; i < lines.length;) {
    if (!/^\s*- option /.test(lines[i])) { out.push(lines[i]); i += 1; continue; }
    let j = i;
    while (j < lines.length && /^\s*- option /.test(lines[j])) j += 1;
    const run = lines.slice(i, j);
    if (run.length <= 12) out.push(...run);
    else {
      const indent = run[0].match(/^\s*/)[0];
      const selected = run.filter((l) => /\[selected\]/.test(l));
      out.push(...run.slice(0, 4), ...selected.filter((l) => !run.slice(0, 4).includes(l)), `${indent}- (${run.length} options in total; choose one by its name)`);
    }
    i = j;
  }
  return out.join('\n');
};
const roundBox = (b) => ({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
const clip = (s, n = MAX_TREE) => (s.length > n ? s.slice(0, n) + '\n[... page continues ...]' : s);
const firstLine = (e) => String(e?.message || e).split('\n')[0].replace(/\u001b\[[0-9;]*m/g, '').slice(0, 220);

// On real sites the shopper must never pay, place an order, or type card data.
export const FINAL_ACTION = /\b(place|complete|submit|confirm)\s+(my\s+)?(order|purchase|payment)\b|\bpay\s*(now|\$|€|£|\d)|^\s*pay\b|\bpay\s+with\b|\bbuy\s+(it\s+)?now\b|\bcomplete\s+checkout\b|^\s*purchase\b|\bcheckout\s+with\b|\bexpress\s+checkout\b/i;
// Accounts are out of scope on real sites: no passwords, no sign-in, no sign-up.
export const ACCOUNT_ACTION = /\b(sign\s*in|log\s*in|sign\s*up|register|create\s+(an\s+)?account)\b/i;
export const CARD_FIELD = /card\s*number|cardholder|name on card|\bcvv\b|\bcvc\b|security code|expir|\biban\b|account number|routing/i;

export class Session {
  constructor(page, persona, { external = false } = {}) {
    if (!PERSONAS[persona]) throw new Error(`Unknown persona ${persona}`);
    this.page = page;
    this.persona = persona;
    this.external = external;
  }

  // Visible iframes in document order with their frames. Screen readers and browser agents read inside
  // iframes (payment fields live there), so the customer perceives them as part of the page.
  async visibleFrames() {
    const out = [];
    const handles = await this.page.locator('iframe').elementHandles().catch(() => []);
    for (const h of handles) {
      const box = await h.boundingBox().catch(() => null);
      const hidden = await h.evaluate((el) => el.getAttribute('aria-hidden') === 'true' || getComputedStyle(el).visibility === 'hidden').catch(() => true);
      if (!box || box.width < 2 || box.height < 2 || hidden) continue;
      const frame = await h.contentFrame().catch(() => null);
      if (frame) out.push({ frame, box });
    }
    return out;
  }

  // The frame that holds keyboard focus: an iframe's document when focus is inside it, else the page.
  // Follows document.activeElement through nested iframes (a ':focus' locator waits forever on a focused iframe).
  async focusFrame() {
    let frame = this.page.mainFrame();
    for (let depth = 0; depth < 4; depth++) {
      const h = await frame.evaluateHandle(() => (document.activeElement?.tagName === 'IFRAME' ? document.activeElement : null)).catch(() => null);
      const el = h?.asElement();
      if (!el) break;
      const inner = await el.contentFrame().catch(() => null);
      if (!inner) break;
      frame = inner;
    }
    return frame;
  }

  // Finds an element by role and exact name on the page, then inside visible iframes.
  async byRole(role, name, nth = 0) {
    const main = this.page.getByRole(role, { name, exact: true });
    if ((await main.count()) > 0) return main.nth(nth);
    for (const { frame } of await this.visibleFrames()) {
      const loc = frame.getByRole(role, { name, exact: true });
      if ((await loc.count()) > 0) return loc.nth(nth);
    }
    return main.nth(nth);
  }

  async focusedName() {
    const frame = await this.focusFrame();
    return frame.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return '';
      const label = el.labels && el.labels[0] ? el.labels[0].innerText : '';
      return [el.getAttribute('aria-label'), label, el.getAttribute('placeholder'), el.getAttribute('autocomplete'), el.getAttribute('name'), el.innerText, el.value].filter(Boolean).join(' ').slice(0, 200);
    }).catch(() => '');
  }

  // Returns a refusal message when an action on a real site would pay, order, or enter card data.
  async refuse(d) {
    if (!this.external) return null;
    const a = d.args || {};
    const stop = 'Not allowed on a real site: AccessiPay never pays or places orders. You have reached the payment step; finish with done and your findings.';
    if (['click', 'check'].includes(d.action) && FINAL_ACTION.test(a.name || '')) return stop;
    if (d.action === 'fill' && CARD_FIELD.test(a.name || '')) return 'Not allowed on a real site: AccessiPay never types card data. Finish with done and your findings.';
    if (d.action === 'activate' || (d.action === 'press' && (a.key === 'Enter' || a.key === 'Space'))) {
      if (FINAL_ACTION.test(await this.focusedName())) return stop;
    }
    if (d.action === 'type' && CARD_FIELD.test(await this.focusedName())) return 'Not allowed on a real site: AccessiPay never types card data. Finish with done and your findings.';
    const account = 'Not allowed on a real site: AccessiPay never signs in, signs up or types passwords. Continue as a guest, or finish with your findings.';
    if (['click', 'check'].includes(d.action) && ACCOUNT_ACTION.test(a.name || '')) return account;
    if (d.action === 'fill' && /password/i.test(a.name || '')) return account;
    if (d.action === 'type' || d.action === 'activate') {
      const isPassword = await (await this.focusFrame()).evaluate(() => document.activeElement?.type === 'password').catch(() => false);
      if (isPassword) return account;
      if (d.action === 'activate' && ACCOUNT_ACTION.test(await this.focusedName())) return account;
    }
    return null;
  }

  async settle() {
    await this.page.waitForTimeout(350);
    await this.page.waitForLoadState('load').catch(() => {});
    await this.page.waitForTimeout(150);
  }

  async tree() {
    try {
      let main = (await this.page.locator('body').ariaSnapshot()).trim();
      const frames = await this.visibleFrames();
      if (frames.length && /^\s*- iframe\b/m.test(main)) {
        let i = 0;
        const lines = [];
        for (const line of main.split('\n')) {
          const m = line.match(/^(\s*)- iframe\b/);
          if (!m || i >= frames.length) { lines.push(line); continue; }
          const inner = await frames[i++].frame.locator('body').ariaSnapshot().catch(() => '');
          lines.push(`${m[1]}- iframe:`);
          for (const l of inner.trim().split('\n').filter(Boolean)) lines.push(`${m[1]}  ${l}`);
        }
        main = lines.join('\n');
      }
      return collapseOptions(noUrls(main));
    } catch (e) { return `(page unreadable: ${firstLine(e)})`; }
  }

  async focusForScreenReader() {
    const frame = await this.focusFrame();
    const inFrame = frame !== this.page.mainFrame();
    const loc = frame.locator(':focus');
    if ((await loc.count()) === 0) return inFrame ? 'an embedded frame with nothing focused inside it' : 'nothing focused (top of page)';
    try {
      const said = noUrls((await loc.first().ariaSnapshot({ timeout: 2000 })).trim()).replace(/^- /, '');
      return inFrame ? `${said} (inside an embedded payment field)` : said;
    } catch { return 'an element with no name'; }
  }

  // What a sighted keyboard user sees on the focused element.
  async focusForSighted() {
    const frame = await this.focusFrame();
    const inFrame = frame !== this.page.mainFrame();
    const text = await frame.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'nothing focused (top of page)';
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute('type');
      const kind = type && tag === 'input' ? `${type === 'text' ? 'text field' : type}` : tag === 'a' ? 'link' : tag;
      const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
      const icon = el.querySelector('svg') ? ' [shows an icon]' : '';
      let label = '';
      if (el.labels && el.labels.length) label = ` next to the text "${el.labels[0].innerText.trim()}"`;
      else if (el.getAttribute('aria-label') || el.getAttribute('placeholder')) label = ` showing "${el.getAttribute('aria-label') || el.getAttribute('placeholder')}"`;
      const shown = tag === 'select' ? el.options[el.selectedIndex]?.text : el.value;
      const value = 'value' in el && shown && tag !== 'button' ? ` value "${shown}"` : '';
      const checked = el.type === 'checkbox' || el.type === 'radio' ? (el.checked ? ' (checked)' : ' (not checked)') : '';
      return `${kind}${text ? ` "${text.slice(0, 80)}"` : ''}${icon}${label}${value}${checked}`;
    }).catch(() => 'a field');
    return inFrame ? `${text} (inside an embedded payment field)` : text;
  }

  // A closed native <select> works the same on every OS here: arrows and Home/End change the
  // choice, typing jumps to the first option that starts with the text (as on Windows and Linux).
  // Headless Chromium on macOS would otherwise open a system menu that no automation can reach.
  async selectKey(key) {
    const r = await this.page.evaluate((key) => {
      const el = document.activeElement;
      if (!el || el.tagName !== 'SELECT') return null;
      const n = el.options.length;
      let i = el.selectedIndex;
      if (key === 'ArrowDown' || key === 'ArrowRight') i = Math.min(n - 1, i + 1);
      else if (key === 'ArrowUp' || key === 'ArrowLeft') i = Math.max(0, i - 1);
      else if (key === 'Home') i = 0;
      else if (key === 'End') i = n - 1;
      else return 'The list is closed. Use the arrow keys or type the first letters of an option to choose.';
      el.selectedIndex = i;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return `Selected "${el.options[i].text}".`;
    }, key);
    return r;
  }

  async selectType(text) {
    return this.page.evaluate((text) => {
      const el = document.activeElement;
      if (!el || el.tagName !== 'SELECT') return null;
      const t = text.trim().toLowerCase();
      const i = Array.from(el.options).findIndex((o) => o.text.toLowerCase().startsWith(t));
      if (i < 0) return `No option starts with "${text}".`;
      el.selectedIndex = i;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return `Selected "${el.options[i].text}".`;
    }, text);
  }

  // Where the element the brain is about to act on sits on the screen. Role-based actions resolve by
  // role and name; keyboard actions resolve to the focused element. A missing element is evidence too.
  async locate(d) {
    const a = d.args || {};
    const role = { click: a.role, fill: a.role || 'textbox', select: 'combobox', check: a.role || 'checkbox', jump: a.role }[d.action];
    if (!role && !['activate', 'press', 'type'].includes(d.action)) return null;
    try {
      const loc = role ? await this.byRole(role, a.name, a.nth || 0) : await this.focusedHandle();
      if (!loc || (role && (await loc.count()) === 0)) return { missing: true, role: role || null, name: a.name || null };
      let box = await loc.boundingBox();
      let scrolled = false;
      const vp = this.page.viewportSize();
      if (box && vp && (box.y < 0 || box.y + box.height > vp.height)) {
        await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
        box = await loc.boundingBox();
        scrolled = true;
      }
      const info = await loc.evaluate((el) => ({ tag: el.tagName.toLowerCase(), outer: el.outerHTML.slice(0, 600) }));
      return { box: box && roundBox(box), role: role || null, name: a.name || null, scrolled, ...info };
    } catch (e) {
      return { missing: true, role: role || null, name: a.name || null, error: String(e.message || e).split('\n')[0].slice(0, 160) };
    }
  }

  // The focused element on the page itself; when focus is inside an iframe, that iframe.
  async focusedHandle() {
    const h = await this.page.evaluateHandle(() => (document.activeElement && document.activeElement !== document.body ? document.activeElement : null)).catch(() => null);
    return h?.asElement() || null;
  }

  async focusBox() {
    try {
      const el = await this.focusedHandle();
      const box = el && (await el.boundingBox());
      return box && roundBox(box);
    } catch { return null; }
  }

  async observe() {
    const page = this.page;
    const title = await page.title().catch(() => '');
    const url = page.url();
    const path = this.external ? new URL(url).pathname : (new URL(url).pathname.replace(/^\/s\/[^/]+/, '') || '/');
    let text;
    if (this.persona === 'keyboard') {
      const visible = await page.evaluate(() => document.body.innerText).catch(() => '');
      text = `Page title: ${title}\n\nWhat is visible on screen:\n${clip(visible.trim())}\n\nKeyboard focus: ${await this.focusForSighted()}`;
    } else {
      const focus = this.persona === 'screenreader' ? `\n\nKeyboard focus: ${await this.focusForScreenReader()}` : '';
      text = `Page title: ${title}\n\nPage as an accessibility tree:\n${clip(await this.tree(), this.external ? 16000 : MAX_TREE)}${focus}`;
    }
    const focus = this.persona === 'agent' ? null : await this.focusBox();
    return { title, path, url, text, focus };
  }

  async act(d) {
    const page = this.page;
    const a = d.args || {};
    const allowed = PERSONAS[this.persona].actions;
    if (!allowed.includes(d.action)) return `Action "${d.action}" is not available to this persona.`;
    const refusal = await this.refuse(d);
    if (refusal) return refusal;
    try {
      switch (d.action) {
        case 'read':
          return 'You read the page again.';
        case 'next':
        case 'prev': {
          await page.keyboard.press(d.action === 'next' ? 'Tab' : 'Shift+Tab');
          await page.waitForTimeout(80);
          return `Focus moved to: ${this.persona === 'keyboard' ? await this.focusForSighted() : await this.focusForScreenReader()}`;
        }
        case 'jump': {
          // A screen reader's elements list: go straight to a control by role and name.
          // Only elements that can take keyboard focus can be reached this way.
          const loc = await this.byRole(a.role, a.name, a.nth || 0);
          if ((await loc.count()) === 0) return `There is no ${a.role} named "${a.name}" on the page.`;
          const focusable = await loc.evaluate((el) => el.tabIndex >= 0 && !el.disabled && !el.closest('[inert],[aria-hidden="true"]'));
          if (!focusable) return `The ${a.role} "${a.name}" is on the page but cannot take keyboard focus.`;
          await loc.focus();
          return `Focus moved to: ${await this.focusForScreenReader()}`;
        }
        case 'activate':
          await page.keyboard.press('Enter');
          await this.settle();
          return 'Pressed Enter on the focused element.';
        case 'press': {
          const key = a.key === 'Space' ? 'Space' : a.key;
          if (!KEYS.has(key)) return `Key "${a.key}" is not available.`;
          const onSelect = await this.selectKey(key);
          if (onSelect) return onSelect;
          await page.keyboard.press(key === 'Space' ? ' ' : key);
          await this.settle();
          return `Pressed ${key}.`;
        }
        case 'type': {
          const editable = await (await this.focusFrame()).evaluate(() => {
            const el = document.activeElement;
            return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
          });
          const picked = await this.selectType(String(a.text ?? ''));
          if (picked) return picked;
          if (!editable) return 'Nothing was typed: the focused element is not a text field.';
          await page.keyboard.press('ControlOrMeta+A');
          await page.keyboard.type(String(a.text ?? ''), { delay: 5 });
          return `Typed "${a.text}".`;
        }
        case 'click':
          await (await this.byRole(a.role, a.name, a.nth || 0)).click({ timeout: 2500 });
          await this.settle();
          return `Clicked ${a.role} "${a.name}".`;
        case 'fill':
          {
            // Typed key by key like a person, so masked fields (card number, expiry) format correctly.
            const field = await this.byRole(a.role || 'textbox', a.name, a.nth || 0);
            await field.click({ timeout: 2500 });
            await field.press('ControlOrMeta+A');
            await field.press('Backspace');
            await field.pressSequentially(String(a.text ?? ''), { delay: 12 });
          }
          return `Filled ${a.role || 'textbox'} "${a.name}" with "${a.text}".`;
        case 'select':
          await (await this.byRole('combobox', a.name, a.nth || 0)).selectOption({ label: a.option }, { timeout: 2500 });
          await this.settle();
          return `Selected "${a.option}" in "${a.name}".`;
        case 'check':
          await (await this.byRole(a.role || 'checkbox', a.name, a.nth || 0)).check({ timeout: 2500 });
          await this.settle();
          return `Checked ${a.role || 'checkbox'} "${a.name}".`;
        default:
          return `Unknown action "${d.action}".`;
      }
    } catch (e) {
      return `That did not work: ${firstLine(e)}`;
    }
  }
}

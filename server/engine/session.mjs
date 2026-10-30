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
const noUrls = (s) => s.split('\n').filter((l) => !/^\s*- \/url:/.test(l)).join('\n').replace(/:\n(?=\S|$)/g, '\n').replace(/:$/, '');
const clip = (s, n = MAX_TREE) => (s.length > n ? s.slice(0, n) + '\n[... page continues ...]' : s);
const firstLine = (e) => String(e?.message || e).split('\n')[0].replace(/\u001b\[[0-9;]*m/g, '').slice(0, 220);

export class Session {
  constructor(page, persona) {
    if (!PERSONAS[persona]) throw new Error(`Unknown persona ${persona}`);
    this.page = page;
    this.persona = persona;
  }

  async settle() {
    await this.page.waitForTimeout(350);
    await this.page.waitForLoadState('load').catch(() => {});
    await this.page.waitForTimeout(150);
  }

  async tree() {
    try { return noUrls((await this.page.locator('body').ariaSnapshot()).trim()); } catch (e) { return `(page unreadable: ${firstLine(e)})`; }
  }

  async focusForScreenReader() {
    const loc = this.page.locator(':focus');
    if ((await loc.count()) === 0) return 'nothing focused (top of page)';
    try { return noUrls((await loc.first().ariaSnapshot()).trim()).replace(/^- /, ''); } catch { return 'an element with no name'; }
  }

  // What a sighted keyboard user sees on the focused element.
  async focusForSighted() {
    return this.page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'nothing focused (top of page)';
      const tag = el.tagName.toLowerCase();
      const kind = el.getAttribute('type') ? `${tag} ${el.getAttribute('type')}` : tag;
      const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
      const icon = el.querySelector('svg') ? ' [shows an icon]' : '';
      let label = '';
      if (el.labels && el.labels.length) label = ` next to the text "${el.labels[0].innerText.trim()}"`;
      const shown = tag === 'select' ? el.options[el.selectedIndex]?.text : el.value;
      const value = 'value' in el && shown && tag !== 'button' ? ` value "${shown}"` : '';
      const checked = el.type === 'checkbox' || el.type === 'radio' ? (el.checked ? ' (checked)' : ' (not checked)') : '';
      return `${kind}${text ? ` "${text.slice(0, 80)}"` : ''}${icon}${label}${value}${checked}`;
    });
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

  async observe() {
    const page = this.page;
    const title = await page.title().catch(() => '');
    const path = new URL(page.url()).pathname.replace(/^\/s\/[^/]+/, '') || '/';
    let text;
    if (this.persona === 'keyboard') {
      const visible = await page.evaluate(() => document.body.innerText).catch(() => '');
      text = `Page title: ${title}\n\nWhat is visible on screen:\n${clip(visible.trim())}\n\nKeyboard focus: ${await this.focusForSighted()}`;
    } else {
      const focus = this.persona === 'screenreader' ? `\n\nKeyboard focus: ${await this.focusForScreenReader()}` : '';
      text = `Page title: ${title}\n\nPage as an accessibility tree:\n${clip(await this.tree())}${focus}`;
    }
    return { title, path, text };
  }

  async act(d) {
    const page = this.page;
    const a = d.args || {};
    const allowed = PERSONAS[this.persona].actions;
    if (!allowed.includes(d.action)) return `Action "${d.action}" is not available to this persona.`;
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
          const loc = page.getByRole(a.role, { name: a.name, exact: true }).nth(a.nth || 0);
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
          const editable = await page.evaluate(() => {
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
          await page.getByRole(a.role, { name: a.name, exact: true }).nth(a.nth || 0).click({ timeout: 2500 });
          await this.settle();
          return `Clicked ${a.role} "${a.name}".`;
        case 'fill':
          await page.getByRole(a.role || 'textbox', { name: a.name, exact: true }).nth(a.nth || 0).fill(String(a.text ?? ''), { timeout: 2500 });
          return `Filled ${a.role || 'textbox'} "${a.name}" with "${a.text}".`;
        case 'select':
          await page.getByRole('combobox', { name: a.name, exact: true }).nth(a.nth || 0).selectOption({ label: a.option }, { timeout: 2500 });
          await this.settle();
          return `Selected "${a.option}" in "${a.name}".`;
        case 'check':
          await page.getByRole(a.role || 'checkbox', { name: a.name, exact: true }).nth(a.nth || 0).check({ timeout: 2500 });
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

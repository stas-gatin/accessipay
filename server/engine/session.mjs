// What each persona perceives and what it can do. The brain never gets pixels or HTML:
// - screenreader: the accessibility tree, moving and acting only with the keyboard
// - keyboard: the visible text of the page (a sighted user), acting only with the keyboard
// - agent: the accessibility tree, acting on elements by role and name, like browser agents do

export const PERSONAS = {
  screenreader: {
    label: 'Screen reader user',
    summary: 'Cannot see the screen. Hears the accessibility tree and uses only the keyboard.',
    actions: ['next', 'prev', 'activate', 'press', 'type', 'read', 'done', 'give_up'],
  },
  keyboard: {
    label: 'Keyboard-only user',
    summary: 'Sees the page but cannot use a mouse. Uses only the keyboard.',
    actions: ['next', 'prev', 'activate', 'press', 'type', 'read', 'done', 'give_up'],
  },
  agent: {
    label: 'AI shopping agent',
    summary: 'An AI agent that reads the accessibility tree and acts on elements by role and name.',
    actions: ['click', 'fill', 'select', 'check', 'press', 'read', 'done', 'give_up'],
  },
};

const KEYS = new Set(['Enter', 'Space', 'Escape', 'Tab', 'Shift+Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace']);
const MAX_TREE = 7000;

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
    try { return (await this.page.locator('body').ariaSnapshot()).trim(); } catch (e) { return `(page unreadable: ${firstLine(e)})`; }
  }

  async focusForScreenReader() {
    const loc = this.page.locator(':focus');
    if ((await loc.count()) === 0) return 'nothing focused (top of page)';
    try { return (await loc.first().ariaSnapshot()).trim().replace(/^- /, ''); } catch { return 'an element with no name'; }
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
      const value = 'value' in el && el.value && tag !== 'button' ? ` value "${el.value}"` : '';
      const checked = el.type === 'checkbox' || el.type === 'radio' ? (el.checked ? ' (checked)' : ' (not checked)') : '';
      return `${kind}${text ? ` "${text.slice(0, 80)}"` : ''}${icon}${label}${value}${checked}`;
    });
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
        case 'activate':
          await page.keyboard.press('Enter');
          await this.settle();
          return 'Pressed Enter on the focused element.';
        case 'press': {
          const key = a.key === 'Space' ? 'Space' : a.key;
          if (!KEYS.has(key)) return `Key "${a.key}" is not available.`;
          await page.keyboard.press(key === 'Space' ? ' ' : key);
          await this.settle();
          return `Pressed ${key}.`;
        }
        case 'type': {
          const editable = await page.evaluate(() => {
            const el = document.activeElement;
            return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
          });
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

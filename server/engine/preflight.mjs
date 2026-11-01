// Before and during a run on a real site: respect robots.txt, and stop at the first sign of bot
// protection or rate limiting. AccessiPay never tries to get past a challenge: the site is
// marked "not testable" instead.

export const USER_AGENT_TOKEN = 'AccessiPay';

// robots.txt -> groups of { agents: [...], rules: [{ allow, path }] }
export function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === 'allow' || key === 'disallow') cur.rules.push({ allow: key === 'allow', path: value });
    }
  }
  return groups;
}

function ruleMatches(rulePath, path) {
  if (!rulePath) return false;
  const anchored = rulePath.endsWith('$');
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const re = new RegExp('^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''));
  return re.test(path);
}

// Longest matching rule wins; on a tie, allow wins (RFC 9309).
export function robotsAllows(groups, agent, path) {
  const a = agent.toLowerCase();
  const own = groups.filter((g) => g.agents.some((x) => x !== '*' && a.includes(x)));
  const group = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  let best = null;
  for (const g of group) for (const r of g.rules) {
    if (!ruleMatches(r.path, path)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow, rule: r };
  }
  return { allowed: best ? best.allow : true, rule: best?.rule || null, own: own.length > 0 };
}

// Checks the start page against robots.txt. Checkout paths that robots.txt asks search crawlers to
// skip are reported, not enforced: a run is one guest session, nothing is indexed or stored.
export async function checkRobots(url, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const u = new URL(url);
  const robotsUrl = `${u.origin}/robots.txt`;
  let text = '';
  try {
    const r = await fetchImpl(robotsUrl, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': `${USER_AGENT_TOKEN} accessibility check` } });
    if (r.status === 429) return { ok: false, reason: 'The site answered 429 Too Many Requests to robots.txt.', robotsUrl };
    if (r.ok) text = await r.text();
  } catch {
    return { ok: true, robotsUrl, note: 'robots.txt could not be fetched; treated as no rules.' };
  }
  const groups = parseRobots(text);
  const start = robotsAllows(groups, USER_AGENT_TOKEN, u.pathname + u.search);
  if (!start.allowed) {
    return { ok: false, robotsUrl, reason: `robots.txt disallows ${u.pathname} (${start.rule.path}${start.own ? ` for ${USER_AGENT_TOKEN}` : ''}).` };
  }
  const notes = ['/cart', '/checkout']
    .map((p) => ({ p, r: robotsAllows(groups, USER_AGENT_TOKEN, p) }))
    .filter((x) => !x.r.allowed)
    .map((x) => x.p);
  return { ok: true, robotsUrl, crawlerSkips: notes };
}

const CHALLENGE_HOSTS = /(^|\.)(challenges\.cloudflare\.com|hcaptcha\.com|recaptcha\.net|captcha-delivery\.com|perimeterx\.net|px-cloud\.net|px-cdn\.net|arkoselabs\.com|funcaptcha\.com|geo\.captcha-delivery\.com)$/i;
const CHALLENGE_TEXT = /verify (that )?you are (a )?human|confirm you.re (a )?human|are you a robot|not a bot|quick verification|checking your browser|press (&|and) hold|pardon our interruption|access (to this page has been )?denied|unusual (traffic|activity)|automated (traffic|access)|complete the security check|just a moment\.\.\.|attention required|request unsuccessful\. incapsula|enable javascript and cookies to continue/i;

const MAINTENANCE_TEXT = /system maintenance|maintenance (is )?in progress|we.re working on it|temporarily unavailable|we.ll be (right )?back/i;
// Known challenge widgets, by element. The invisible reCAPTCHA badge many checkouts carry is not one.
const CHALLENGE_SELECTOR = '#px-captcha, #challenge-form, #challenge-stage, #cf-challenge-running, .cf-turnstile, .h-captcha, iframe[title*="challenge" i], iframe[src*="captcha-delivery"]';

// Looks at the page the shopper is on, including every iframe (bot checks often render inside one).
// Returns a reason string when a bot check or a maintenance page is on screen.
export async function detectBotWall(page) {
  for (const f of page.frames()) {
    let host = '';
    try { host = new URL(f.url()).hostname; } catch {}
    if (host && CHALLENGE_HOSTS.test(host) && /challenge|captcha|turnstile|hcaptcha|recaptcha\/api2\/(anchor|bframe)/i.test(f.url())) {
      // Many checkouts load an invisible bot score in a hidden frame. Only a challenge the customer can see is a wall.
      const el = await f.frameElement().catch(() => null);
      const box = el && (await el.boundingBox().catch(() => null));
      const shown = el && (await el.isVisible().catch(() => false));
      if (shown && box && box.width >= 60 && box.height >= 60) return `A bot check from ${host} is on the page.`;
    }
  }
  for (const f of page.frames()) {
    const info = await f.evaluate((sel) => ({
      main: window === window.top,
      title: document.title || '',
      text: (document.body?.innerText || '').slice(0, 3000),
      widget: !!document.querySelector(sel),
    }), CHALLENGE_SELECTOR).catch(() => null);
    if (!info) continue;
    const short = info.text.length < 1500;
    if (info.widget) return 'The page shows a bot check widget.';
    if ((info.main && CHALLENGE_TEXT.test(info.title)) || (short && CHALLENGE_TEXT.test(info.text))) {
      return `The page shows a bot check: "${(CHALLENGE_TEXT.exec(info.title) || CHALLENGE_TEXT.exec(info.text))[0]}".`;
    }
    if (info.main && short && MAINTENANCE_TEXT.test(info.text)) return 'The site showed a maintenance page instead of the shop.';
  }
  return null;
}

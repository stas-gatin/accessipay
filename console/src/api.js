export async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

export const OUTCOME = {
  purchased: { label: 'Purchased', tone: 'ok' },
  blocked: { label: 'Blocked', tone: 'bad' },
  stopped: { label: 'Stopped', tone: 'muted' },
  error: { label: 'Error', tone: 'bad' },
};

export function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

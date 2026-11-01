// Marks drawn on a screenshot: where the customer got stuck (circle, arrow, numbered "Analysis" card)
// and what the scanner flagged (blue dashed boxes). Pure functions that return strings, so the same
// drawing is used by the report pages (server), the baked PNG (Playwright) and the console (React).
//
// Input: { width, height, marks: [{ n, kind: 'blocker'|'friction'|'context'|'scanner', box: {x,y,width,height}|null, title, note }] }
// Coordinates are screenshot pixels; the SVG uses the same viewBox, so it scales with the image.

export const MARK_COLORS = {
  blocker: '#b3261e', // 6.5:1 on white; drawn over a white halo, so it keeps 3:1 on any background
  friction: '#8a5800',
  context: '#0b1b33',
  scanner: '#1d4ed8',
  halo: '#ffffff',
  card: '#ffffff',
  cardInk: '#0b1b33',
  cardMuted: '#4a586b',
};

const CARD_W = 440;
const LINE_H = 25;
const WRAP = 38;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function wrap(text, width = WRAP, maxLines = 4) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= width) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '…';
    return kept;
  }
  return lines;
}

const overlaps = (a, b, pad = 6) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
const inside = (r, W, H) => r.x >= 4 && r.y >= 4 && r.x + r.w <= W - 4 && r.y + r.h <= H - 4;

function ellipseOf(box) {
  const rx = box.width / 2 + 16;
  const ry = Math.max(box.height / 2 + 14, 28);
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, rx, ry };
}

// Where the line from the ellipse centre towards (px, py) leaves the ellipse.
function edgePoint(e, px, py) {
  const dx = px - e.cx;
  const dy = py - e.cy;
  if (!dx && !dy) return { x: e.cx, y: e.cy - e.ry };
  const t = 1 / Math.sqrt((dx * dx) / (e.rx * e.rx) + (dy * dy) / (e.ry * e.ry));
  return { x: e.cx + dx * t, y: e.cy + dy * t };
}

// Nearest point of a rectangle to (px, py).
function rectPoint(r, px, py) {
  return { x: Math.min(Math.max(px, r.x), r.x + r.w), y: Math.min(Math.max(py, r.y), r.y + r.h) };
}

// Computes ellipses, label cards and arrows. Labels try 8 positions around their mark and take the
// first one that fits inside the image without covering another mark or label.
export function layoutMarks({ width, height, marks = [] }) {
  const W = width;
  const H = height;
  const taken = [];
  const out = [];
  for (const m of marks) {
    if (m.kind === 'scanner' || m.kind === 'context') {
      if (m.box) taken.push({ x: m.box.x, y: m.box.y, w: m.box.width, h: m.box.height, soft: true });
      continue;
    }
    if (m.box) {
      const e = ellipseOf(m.box);
      taken.push({ x: e.cx - e.rx - 6, y: e.cy - e.ry - 6, w: 2 * e.rx + 12, h: 2 * e.ry + 12 });
    }
  }
  for (const m of marks) {
    if (m.kind === 'scanner' || m.kind === 'context') { out.push({ ...m }); continue; }
    const lines = wrap(m.note, WRAP, 4);
    const title = m.title ? wrap(m.title, WRAP - 4, 1)[0] : '';
    const h = 46 + (title ? LINE_H : 0) + lines.length * LINE_H + 12;
    const w = Math.min(CARD_W, W - 8);
    let label;
    let e = null;
    if (m.box) {
      e = ellipseOf(m.box);
      const gap = 44;
      const cands = [
        { x: e.cx + e.rx + gap, y: e.cy - h / 2 }, // right
        { x: e.cx - e.rx - gap - w, y: e.cy - h / 2 }, // left
        { x: e.cx - w / 2, y: e.cy + e.ry + gap }, // below
        { x: e.cx - w / 2, y: e.cy - e.ry - gap - h }, // above
        { x: e.cx + e.rx + gap / 2, y: e.cy + e.ry + gap / 2 }, // below right
        { x: e.cx - e.rx - gap / 2 - w, y: e.cy + e.ry + gap / 2 }, // below left
        { x: e.cx + e.rx + gap / 2, y: e.cy - e.ry - gap / 2 - h }, // above right
        { x: e.cx - e.rx - gap / 2 - w, y: e.cy - e.ry - gap / 2 - h }, // above left
      ].map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), w, h }));
      // First choice: covers nothing we drew. Then: may cover outlines (context, scanner) but no circle or card.
      const clear = (r) => inside(r, W, H) && !taken.some((t) => overlaps(r, t));
      const free = (r) => inside(r, W, H) && !taken.some((t) => !t.soft && overlaps(r, t));
      label = cands.find(clear) || cands.find(free) || null;
      if (!label) {
        // Nothing fits cleanly: clamp the first choice into the image.
        const c = cands[0];
        label = { x: Math.max(4, Math.min(W - w - 4, c.x)), y: Math.max(4, Math.min(H - h - 4, c.y)), w, h };
      }
    } else {
      // No element position (older runs): the card sits in the top left corner.
      const y = 12 + out.filter((o) => o.label && !o.ellipse).reduce((s, o) => s + o.label.h + 10, 0);
      label = { x: 12, y, w, h };
    }
    taken.push(label);
    let arrow = null;
    if (e) {
      const lc = { x: label.x + label.w / 2, y: label.y + label.h / 2 };
      const start = rectPoint(label, e.cx, e.cy);
      const end = edgePoint(e, lc.x, lc.y);
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      const bend = Math.min(40, len / 4);
      const cx = mx - (dy / len) * bend;
      const cy = my + (dx / len) * bend;
      arrow = { d: `M${start.x.toFixed(1)},${start.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${end.x.toFixed(1)},${end.y.toFixed(1)}`, long: len > 30 };
    }
    out.push({ ...m, ellipse: e, label: { ...label, lines, title }, arrow });
  }
  return out;
}

// Accessible names read out a close button as "×": that sign means nothing in a sentence.
export const cleanText = (s) => String(s ?? '').replace(/[×✕✖]\s*/g, '').replace(/\s{2,}/g, ' ').trim();

// The ellipse drawn around a mark passes through the corners of its box, which cuts through a popup's
// title. Grow the box so the ellipse goes round the whole element, kept inside the screenshot.
export function roomyBox(box, W, H) {
  if (!box) return box;
  const rx = (box.width / 2) * Math.SQRT2 + 10;
  const ry = (box.height / 2) * Math.SQRT2 + 10;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const w = Math.max(box.width, 2 * (Math.min(rx, cx - 4, W - cx - 4) - 16));
  const h = Math.max(box.height, 2 * (Math.min(ry, cy - 4, H - cy - 4) - 14));
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

// Marks as the owner report shows them (the console's Report.jsx does the same): text cleaned, the
// ellipse round the whole element, and on the picture the callout carries the title only; the full
// note is the numbered list under it. Returns { marks, onPicture }.
export function reportMarks({ width, height, marks = [] }) {
  const side = (m) => m.kind === 'scanner' || m.kind === 'context';
  const clean = marks.map((m) => (side(m) ? m : { ...m, title: cleanText(m.title), note: cleanText(m.note), box: roomyBox(m.box, width, height) }));
  return { marks: clean, onPicture: clean.map((m) => (side(m) ? m : { ...m, note: '' })) };
}

// Short text alternative for the whole picture.
export function annotationAlt({ marks = [], caption = '', scannerRecorded = true }) {
  const main = marks.filter((m) => m.kind !== 'scanner' && m.kind !== 'context');
  const scanner = marks.filter((m) => m.kind === 'scanner').length;
  const parts = [caption || 'Screenshot of the page'];
  for (const m of main) parts.push(`Mark ${m.n}${m.box ? ' circles' : ' refers to'} ${m.title || 'an element'}: ${m.note}`);
  if (scannerRecorded) parts.push(scanner ? `${scanner} element${scanner === 1 ? '' : 's'} flagged by the scanner are outlined with blue dashed boxes.` : 'The scanner flagged nothing visible on this screen.');
  return parts.join('. ').replace(/\.\./g, '.');
}

// The overlay as an SVG string. With `image` (a URL or data URL) the screenshot is drawn inside the
// SVG, which is how the baked PNG is made; without it, the SVG is laid over an <img>.
export function annotationSvg({ width, height, marks = [], image = null, idPrefix = 'ap', animate = false, decorative = true }) {
  const laid = layoutMarks({ width, height, marks });
  const C = MARK_COLORS;
  const arrowId = `${idPrefix}-arrow`;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" ${decorative ? 'aria-hidden="true" focusable="false"' : 'role="img"'} class="ap-annot-svg">`);
  parts.push(`<defs><marker id="${arrowId}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L11,6 L1,11 z" fill="${C.blocker}" stroke="${C.halo}" stroke-width="1"/></marker>`);
  parts.push(`<filter id="${idPrefix}-shadow" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#0b1b33" flood-opacity=".28"/></filter></defs>`);
  if (image) parts.push(`<image href="${esc(image)}" x="0" y="0" width="${width}" height="${height}"/>`);
  for (const m of laid.filter((x) => x.kind === 'context' && x.box)) {
    const b = m.box;
    parts.push(`<rect x="${b.x - 4}" y="${b.y - 4}" width="${b.width + 8}" height="${b.height + 8}" rx="8" fill="none" stroke="${C.halo}" stroke-width="6"/>`);
    parts.push(`<rect x="${b.x - 4}" y="${b.y - 4}" width="${b.width + 8}" height="${b.height + 8}" rx="8" fill="none" stroke="${C.context}" stroke-width="2.5" stroke-dasharray="3 6"/>`);
  }
  for (const m of laid.filter((x) => x.kind === 'scanner' && x.box)) {
    const b = m.box;
    parts.push(`<rect x="${b.x - 3}" y="${b.y - 3}" width="${b.width + 6}" height="${b.height + 6}" fill="none" stroke="${C.halo}" stroke-width="6"/>`);
    parts.push(`<rect x="${b.x - 3}" y="${b.y - 3}" width="${b.width + 6}" height="${b.height + 6}" fill="rgba(29,78,216,.06)" stroke="${C.scanner}" stroke-width="3" stroke-dasharray="10 6"/>`);
  }
  for (const m of laid.filter((x) => x.label)) {
    const color = m.kind === 'friction' ? C.friction : C.blocker;
    const e = m.ellipse;
    if (e) {
      const t = `rotate(-3 ${e.cx.toFixed(1)} ${e.cy.toFixed(1)})`;
      const draw = animate ? ' pathLength="100" class="ap-draw"' : '';
      parts.push(`<ellipse cx="${e.cx.toFixed(1)}" cy="${e.cy.toFixed(1)}" rx="${e.rx.toFixed(1)}" ry="${e.ry.toFixed(1)}" transform="${t}" fill="none" stroke="${C.halo}" stroke-width="10"/>`);
      parts.push(`<ellipse cx="${e.cx.toFixed(1)}" cy="${e.cy.toFixed(1)}" rx="${e.rx.toFixed(1)}" ry="${e.ry.toFixed(1)}" transform="${t}" fill="none" stroke="${color}" stroke-width="4.5"${draw}/>`);
    }
    if (m.arrow && m.arrow.long) {
      parts.push(`<path d="${m.arrow.d}" fill="none" stroke="${C.halo}" stroke-width="8" stroke-linecap="round"/>`);
      parts.push(`<path d="${m.arrow.d}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" marker-end="url(#${arrowId})"/>`);
    }
    const L = m.label;
    parts.push(`<g filter="url(#${idPrefix}-shadow)"><rect x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="12" fill="${C.card}" stroke="${color}" stroke-width="2.5"/></g>`);
    parts.push(`<circle cx="${L.x + 28}" cy="${L.y + 27}" r="15" fill="${color}"/>`);
    parts.push(`<text x="${L.x + 28}" y="${L.y + 33}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="17" font-weight="700" fill="#ffffff">${esc(m.n)}</text>`);
    parts.push(`<text x="${L.x + 52}" y="${L.y + 33}" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="700" letter-spacing="1.6" fill="${color}">ANALYSIS</text>`);
    let y = L.y + 46 + 16;
    if (L.title) {
      parts.push(`<text x="${L.x + 18}" y="${y}" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700" fill="${C.cardInk}">${esc(L.title)}</text>`);
      y += LINE_H;
    }
    for (const line of L.lines) {
      parts.push(`<text x="${L.x + 18}" y="${y}" font-family="Inter, system-ui, sans-serif" font-size="17" fill="${C.cardInk}">${esc(line)}</text>`);
      y += LINE_H;
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

// A complete accessible figure for HTML pages: the picture is one image with a text alternative,
// the notes are repeated as a numbered list under it, and a legend explains the two kinds of marks.
// The callout on the picture carries the title only (see reportMarks), the same as the console.
export function annotatedFigureHtml({ src, width, height, marks: given = [], caption = '', idPrefix = 'ap', legend = true, stuckLabel = 'Where the customer got stuck', scannerRecorded = true }) {
  const { marks, onPicture } = reportMarks({ width, height, marks: given });
  const alt = annotationAlt({ marks, caption, scannerRecorded });
  const main = marks.filter((m) => m.kind !== 'scanner' && m.kind !== 'context');
  const scanner = marks.filter((m) => m.kind === 'scanner');
  const svg = annotationSvg({ width, height, marks: onPicture, idPrefix, animate: true });
  const notes = main.map((m) => `<li value="${esc(m.n)}"><strong>${esc(m.title || 'Element')}</strong>: ${esc(m.note)}</li>`).join('');
  const legendHtml = legend
    ? `<p class="ap-legend"><span class="ap-key ap-key-red" aria-hidden="true"></span> ${esc(stuckLabel)} <span class="ap-key ap-key-blue" aria-hidden="true"></span> ${!scannerRecorded ? 'Positions of what axe-core flagged were not recorded in this run' : scanner.length ? `What axe-core flagged (${scanner.length})` : 'axe-core flagged nothing on this screen'}</p>`
    : '';
  return `<figure class="ap-figure">
<div class="ap-annot" role="img" aria-label="${esc(alt)}" style="aspect-ratio:${width}/${height}">
<img src="${esc(src)}" alt="" width="${width}" height="${height}">
${svg}
</div>
${legendHtml}
${notes ? `<ol class="ap-notes">${notes}</ol>` : ''}
${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
</figure>`;
}

// CSS for the figure (report pages and console share it).
export const ANNOTATE_CSS = `
.ap-figure{margin:0 0 16px}
.ap-annot{position:relative;width:100%;border:1px solid #d5dce6;border-radius:10px;overflow:hidden;background:#f6f8fb}
.ap-annot img{display:block;width:100%;height:100%;object-fit:fill}
.ap-annot svg{position:absolute;inset:0;width:100%;height:100%}
.ap-legend{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:13px;color:#4a586b;margin:8px 0 0}
.ap-key{display:inline-block;width:22px;height:12px;border-radius:999px;vertical-align:middle}
.ap-key-red{border:3px solid #b3261e}
.ap-key-blue{border:2px dashed #1d4ed8;border-radius:2px}
.ap-notes{margin:8px 0 0;padding-left:22px}
.ap-notes li{margin:4px 0}
.ap-figure figcaption{font-size:13px;color:#4a586b;margin-top:6px}
@media (prefers-reduced-motion:no-preference){.ap-draw{stroke-dasharray:100;stroke-dashoffset:100;animation:ap-draw 900ms ease-out 200ms forwards}}
@keyframes ap-draw{to{stroke-dashoffset:0}}
@media print{.ap-draw{stroke-dasharray:none;stroke-dashoffset:0;animation:none}}
`;

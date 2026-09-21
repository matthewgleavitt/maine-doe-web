#!/usr/bin/env node
/* Maine DOE interior pages — contrast and layout checks
 * Version: 2026-09-21-b  ·  Last edited: 2026-09-21
 *
 *   node interior-checks.js                 both widths
 *   node interior-checks.js --width 1280    one width
 *
 * Runs against interior-preview.html, which carries twelve real pages
 * with the real chrome, so what it measures is what a reader gets.
 *
 * WHY THIS IS NOT THREE LINES OF getComputedStyle
 * -----------------------------------------------
 * Three earlier versions of this check reported numbers that were
 * wrong, in both directions, and each was wrong for a different
 * reason worth writing down:
 *
 *  1. Reading only backgroundColor. Walked straight past .blockhead
 *     and .contact-cube, whose grounds are gradients — 139 phantom
 *     failures, then 2 when the gradient was read.
 *
 *  2. Treating any element with a text node as text. A container
 *     whose first child is whitespace counted as text on its own
 *     background. Fixed by summing DIRECT text nodes only.
 *
 *  3. Walking ancestors alone. The banner is one object painted by
 *     .doe-hero, which sits BEHIND a sibling block — the Drupal page
 *     title. An ancestor walk from that h1 never meets the hero and
 *     judges white type against the beige page. Fixed by compositing
 *     any element that geometrically contains the text on top of the
 *     ancestor stack, tightest one wins.
 *
 *  4. Ignoring pseudo-elements. The banner's veil is an ::after. A
 *     scanner that cannot see it judges the type against the bare
 *     photograph and fails text that is comfortably legible.
 *
 *  5. Judging a gradient by one end. The veil runs 97% navy on the
 *     left to 62% on the right. Taking the darkest stop passes text
 *     that sits in the thin part; taking the lightest fails text that
 *     never reaches it. Sampled at the text's own far edge instead.
 *
 * WORST CASE, DELIBERATELY: a photograph behind a veil is treated as
 * pure white, because an author can upload one. If a page passes here
 * it passes whatever picture goes in later.
 */
'use strict';
const path = require('path');
/* --raw points the same checks at interior-preview-raw.html, which is
   today's live markup under the new stylesheet. That is the rollout
   question: the injector goes live on every page at once, the bodies
   are replaced one at a time, so what matters is whether the rule is
   safe on markup that has not been touched yet. */
const FILE = 'file://' + path.join(__dirname,
  process.argv.includes('--raw') ? 'interior-preview-raw.html' : 'interior-preview.html');

/* EXPORTED so the rollout sweep can run the SAME probe rather than a
   second copy of it. Two implementations of a contrast test is how
   the first three versions of this file disagreed with each other. */
const PROBE = () => {
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); };
  const parse = s => { const m = s && s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, bg) => f.rgb.map((v, i) => v * f.a + bg[i] * (1 - f.a));

  /* Sample a linear-gradient at `frac` across it. Stop positions are
     optional in CSS, so a gradient written with none gets its stops
     spread evenly — the case that made every .contact-cube read as
     white text on white. */
  function gradAt(bi, frac) {
    const raw = [...bi.matchAll(/(rgba?\([^)]+\))(?:\s+(\d+(?:\.\d+)?)%)?/g)]
      .map(m => ({ c: parse(m[1]), p: m[2] === undefined ? null : parseFloat(m[2]) / 100 }))
      .filter(s => s.c);
    if (raw.length < 2) return raw.length === 1 ? raw[0].c : null;
    raw.forEach((s, i) => { if (s.p === null) s.p = i / (raw.length - 1); });
    const f = Math.max(0, Math.min(1, frac));
    let a = raw[0], b = raw[raw.length - 1];
    for (let i = 0; i < raw.length - 1; i++) if (f >= raw[i].p && f <= raw[i + 1].p) { a = raw[i]; b = raw[i + 1]; break; }
    const span = (b.p - a.p) || 1, t = Math.max(0, Math.min(1, (f - a.p) / span));
    return { rgb: a.c.rgb.map((v, i) => v + (b.c.rgb[i] - v) * t), a: a.c.a + (b.c.a - a.c.a) * t };
  }

  function layers(n, pseudo, textRect) {
    const cs = getComputedStyle(n, pseudo || undefined), out = [];
    if (pseudo) {
      const c = cs.content;
      if (!c || c === 'none' || c === 'normal') return out;
      if (cs.display === 'none') return out;
      /* A MARK IS NOT A GROUND. The accordion's plus sign is a navy
         ::after pinned 18px from the right at 24px square; counted as
         a ground it painted navy across its whole title and reported
         navy-on-navy for text that measures 12:1 on beige. Only a
         pseudo-element stretched to every edge — the banner's veil,
         inset: 0 — is painting the ground under the type. */
      if (cs.position === 'absolute' || cs.position === 'fixed') {
        if (!['top', 'right', 'bottom', 'left'].every(k => cs[k] === '0px')) return out;
      }
    }
    const bi = cs.backgroundImage;
    if (bi && bi !== 'none') {
      const box = n.getBoundingClientRect();
      const frac = box.width ? (textRect.right - box.left) / box.width : 1;
      if (/gradient/.test(bi)) { const g = gradAt(bi, frac); out.push(g || { rgb: [255, 255, 255], a: 1 }); }
      /* A DECORATIVE MARK IS NOT A GROUND. The envelope before the
         contact heading and the accordion's plus sign are SVG data
         URIs, drawn `contain no-repeat` at the size of a glyph.
         Counted as grounds they covered their whole element in
         worst-case white and reported white-on-white for headings
         that are plainly legible. A picture only counts as the ground
         when it is actually painted across the box. */
      else if (cs.backgroundSize === 'cover' || cs.backgroundSize === '100% 100%' || cs.backgroundRepeat === 'repeat') {
        out.push({ rgb: [255, 255, 255], a: 1 });
      }
    }
    const c = parse(cs.backgroundColor);
    /* BOTTOM TO TOP, and that ordering is the whole correctness of
       this function. background-color paints first, background-image
       over it, ::before over that, ::after last. Returned top-first
       and composited backwards it came out inverted — a hero's
       photograph painted OVER the veil that protects the type, which
       reported white-on-white for text that is plainly legible. */
    if (c && c.a > 0) out.unshift(c);
    return out;
  }
  const all = (n, r) => [...layers(n, null, r), ...layers(n, '::before', r), ...layers(n, '::after', r)];
  const paint = (list, base) => { for (const L of list) base = over(L, base); return base; };

  function backdrop(el, root) {
    const r = el.getBoundingClientRect();
    /* 1. the ancestor chain, outermost first so it composites in
       paint order, stopping once an opaque ground is reached. */
    const chain = []; let n = el, opaque = false;
    while (n && n.nodeType === 1) {
      chain.push(n);
      if (all(n, r).some(L => L.a === 1)) { opaque = true; break; }
      n = n.parentElement;
    }
    chain.reverse();
    let base = paint(chain.flatMap(x => all(x, r)), [255, 255, 255]);
    /* 2. anything that CONTAINS the text without being in its
       ancestry paints over that — the .doe-hero case. Tightest wins. */
    let win = null, area = Infinity;
    for (const x of root.querySelectorAll('*')) {
      if (x === el || x.contains(el) || el.contains(x)) continue;
      const q = x.getBoundingClientRect();
      if (!(q.left <= r.left + 1 && q.right >= r.right - 1 && q.top <= r.top + 1 && q.bottom >= r.bottom - 1)) continue;
      if (!all(x, r).length) continue;
      const a = q.width * q.height;
      if (a > 0 && a < area) { area = a; win = x; }
    }
    if (win) base = paint(all(win, r), base);
    /* The chain is reported with every failure. A contrast number on
       its own cannot be checked; a number plus the elements it was
       measured against can. */
    const name = x => x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') +
      (typeof x.className === 'string' && x.className ? '.' + x.className.trim().split(/\s+/)[0] : '');
    return { rgb: base, why: chain.filter(x => all(x, r).length).map(name).join(' > ') +
      (win ? '  over:' + name(win) : '') };
  }

  const fails = [];
  for (const p of document.querySelectorAll('.pv-page')) {
    const page = (p.querySelector('.pv-meta')?.textContent || '').trim().split('·')[0].trim();
    for (const el of p.querySelectorAll('#container *')) {
      /* DIRECT text nodes only — a wrapper whose first child is
         whitespace is not text. */
      const direct = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
      if (direct.length < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
      /* Image replacement: text-indent -9999px puts the words off
         screen so the background image can stand in for them. The
         text has no contrast requirement because nobody sees it —
         this is what made the header logo link report 3.56:1 and
         nearly earned a stylesheet rule for invisible words. */
      if (parseFloat(cs.textIndent) <= -999) continue;
      /* font-size: 0 is the other half of the same technique — the
         back-to-top button shows a drawn chevron and keeps its words
         only so a screen reader has a name to announce. There is
         nothing on screen to measure. */
      if (parseFloat(cs.fontSize) < 1) continue;
      if (cs.clip === 'rect(1px, 1px, 1px, 1px)' || cs.clipPath === 'inset(50%)') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const fg = parse(cs.color); if (!fg) continue;
      const B = backdrop(el, p), bg = B.rgb, fgc = over(fg, bg);
      const size = parseFloat(cs.fontSize), wt = parseInt(cs.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && wt >= 700);   /* WCAG 1.4.3 */
      const need = large ? 3 : 4.5, got = ratio(fgc, bg);
      if (got < need - 0.05) fails.push({
        page: page.replace('/doe/', ''),
        el: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''),
        text: direct.slice(0, 34), got: got.toFixed(2), need, size: Math.round(size),
        fg: `rgb(${fgc.map(Math.round)})`, bg: `rgb(${bg.map(Math.round)})`, why: B.why,
      });
    }
  }

  /* LAYOUT: cards in one row must come out the same width, or their
     fixed-ratio pictures come out different heights. */
  const ragged = [];
  for (const p of document.querySelectorAll('.pv-page')) {
    const page = (p.querySelector('.pv-meta')?.textContent || '').trim().split('·')[0].trim();
    for (const row of p.querySelectorAll('#block-doe-content .row')) {
      const cols = [...row.children].filter(c => /col-/.test(c.className));
      const spans = cols.map(c => (c.className.match(/col-(?:sm|md|lg)-(\d+)/) || [])[1]);
      if (cols.length < 2 || new Set(spans).size !== 1) continue;   /* an intentional 8/4 split is not ragged */
      const w = cols.map(c => Math.round(c.getBoundingClientRect().width));
      if (new Set(w).size > 1) ragged.push({ page: page.replace('/doe/', ''), widths: w });
    }
  }
  return { fails, ragged };
};

module.exports = { PROBE };
if (require.main !== module) return;

(async () => {
  const { chromium } = require(path.join(process.env.HOME, 'Documents/Claude/node_modules/playwright'));
  const widths = process.argv.includes('--width')
    ? [Number(process.argv[process.argv.indexOf('--width') + 1])]
    : [1280, 900];
  const browser = await chromium.launch();
  let bad = 0;
  for (const width of widths) {
    const pg = await browser.newPage({ viewport: { width, height: 1200 } });
    await pg.goto(FILE);
    await pg.waitForTimeout(700);
    /* The harness shows one page at a time; measure them all. */
    await pg.addStyleTag({ content: '.pv-page{display:block !important}' });
    await pg.waitForTimeout(2200);
    const { fails, ragged } = await pg.evaluate(PROBE);
    console.log(`\n── ${width}px ──────────────────────────────────`);
    if (!fails.length) console.log('  contrast   0 failures');
    else {
      bad += fails.length;
      console.log(`  contrast   ${fails.length} failures`);
      const seen = new Set();
      for (const f of fails) {
        const k = f.el + f.fg + f.bg;
        if (seen.has(k)) continue;
        seen.add(k);
        console.log(`    ${f.got} (need ${f.need})  ${f.size}px  ${f.el}  "${f.text}"`);
        console.log(`         ${f.fg} on ${f.bg}  — ${f.page}`);
        console.log(`         ground: ${f.why || '(nothing painted — page default)'}`);
      }
    }
    if (!ragged.length) console.log('  card rows  all equal');
    else { bad += ragged.length; ragged.forEach(r => console.log(`  RAGGED ROW ${r.widths.join('/')}  — ${r.page}`)); }
    await pg.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();

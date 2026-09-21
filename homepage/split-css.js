#!/usr/bin/env node
/* Maine DOE — split the interior stylesheet into site structure and
 * page content
 * Version: 2026-09-21-a  ·  Last edited: 2026-09-21
 *
 *   node split-css.js
 *
 * WHY. The homepage, header, footer and side menu are ready now; the
 * interior page bodies are months of hand work away. They were one
 * stylesheet because they were built together, but they are two
 * deployments, so they have to be two Injector rules.
 *
 * THE LINE. A rule is STRUCTURE if it styles something Drupal puts on
 * the page whatever the body field contains — the side menu, the
 * breadcrumb, the page title block, the content wrappers, the social
 * rail. Everything else is CONTENT: it styles markup that arrives in
 * the body field, so it does nothing at all until a page is migrated,
 * and shipping it early would ship dead CSS.
 *
 * It reads the DEPLOY build rather than the source, for two reasons:
 * that file is already comment-stripped and WAF-linted, and splitting
 * it means the two halves provably sum to the whole. The check at the
 * end proves it rather than asserting it.
 */
'use strict';
const fs = require('fs'), path = require('path');
const H = __dirname;
const SRC = path.join(H, 'interior-css-injector.deploy.css');
const css = fs.readFileSync(SRC, 'utf8');
const ver = (css.match(/interior-css-injector\.css ([\w-]+)/) || [])[1] || '?';

/* Drupal's own furniture. Matched against a selector with the body
   prefix and any leading `html` already taken off. */
const STRUCTURE = [
  /^#sectionnav\b/, /\s#sectionnav\b/,
  /^#maincontent2\b/, /\s#maincontent2\b/,
  /^#content\b/, /\s#content\b/,
  /^#block-doe-pagetitle\b/, /\s#block-doe-pagetitle\b/,
  /^\.crumb_trail\b/, /\s\.crumb_trail\b/,
  /^\.dh-social/, /\s\.dh-social/,
  /^\.doe-scroll\b/, /\s\.doe-scroll\b/,
];
const isStructure = (sel) => {
  if (/#block-doe-content/.test(sel)) return false;     // content area, always CONTENT
  const s = sel.replace(/^html\s+/, '').replace(/^body[^\s]*\s*/, '').trim();
  if (!s) return true;                                   // a rule ON body itself
  return STRUCTURE.some((re) => re.test(s));
};

/* Walk the file brace by brace so an @media block keeps its wrapper
   and its children are classified individually. A regex cannot nest. */
function split(text) {
  const out = { s: '', c: '' };
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    if (/^@media/i.test(head)) {
      let d = 1, j = open + 1;
      while (d > 0 && j < text.length) { if (text[j] === '{') d++; else if (text[j] === '}') d--; j++; }
      const inner = split(text.slice(open + 1, j - 1));
      if (inner.s.trim()) out.s += head + ' {\n' + inner.s.trim() + '\n}\n';
      if (inner.c.trim()) out.c += head + ' {\n' + inner.c.trim() + '\n}\n';
      i = j;
      continue;
    }
    const close = text.indexOf('}', open);
    if (close < 0) break;
    const body = text.slice(open + 1, close);
    const parts = head.split(',').map((x) => x.trim()).filter(Boolean);
    /* A RULE THAT DECLARES A CUSTOM PROPERTY GOES IN BOTH FILES.
       The palette sits on the body element and the banner's three
       spacing values sit on #maincontent2, so the classifier sends
       both to STRUCTURE — and then --i-band, which a hero rule in the
       content half reads, resolves to nothing there. Duplicating a
       declaration is free: identical values, and whichever file loads
       second sets them to what they already were. Doing it by
       detecting the declaration, rather than by listing the two
       selectors that happen to carry them today, means the next
       variable added to the stylesheet is handled without anyone
       remembering this. */
    /* CONTAINMENT RULES GO IN BOTH, FOR THE SAME REASON.
       The structural half re-lays the main column out beside the side
       menu. The rules that keep wide things INSIDE a column — a table
       capped at 100%, a cell allowed to break a long word, an image
       capped at 100%, a link allowed to wrap mid-address — read as
       page content by selector and live in the other half. Installed
       on its own, the structural half therefore moved the column and
       left nothing holding the content in it: measured at 70 pages
       newly scrolling sideways, every one of them by the same 128px.
       These four are the floor the layout stands on, so both halves
       carry them. Matched on the bare element, so a rule about a card
       or a chip is never swept in by accident. */
    const bareEl = parts.every((p) =>
      /^body[^\s]*\s+#block-doe-content\s+(?:table|img|a|table\s+th|table\s+td)$/.test(p.trim()));
    if (bareEl && /max-width|overflow-wrap|word-break|width:\s*auto/i.test(body)) {
      out.s += parts.join(',\n') + ' {' + body + '}\n';
      out.c += parts.join(',\n') + ' {' + body + '}\n';
      i = close + 1;
      continue;
    }
    if (/--[a-z0-9-]+\s*:/i.test(body)) {
      out.s += parts.join(',\n') + ' {' + body + '}\n';
      out.c += parts.join(',\n') + ' {' + body + '}\n';
      i = close + 1;
      continue;
    }
    const S = parts.filter(isStructure), C = parts.filter((p) => !isStructure(p));
    if (S.length) out.s += S.join(',\n') + ' {' + body + '}\n';
    if (C.length) out.c += C.join(',\n') + ' {' + body + '}\n';
    i = close + 1;
  }
  return out;
}

const bare = css.replace(/^\/\*[\s\S]*?\*\/\s*/, '');
const { s, c } = split(bare);

/* THE CUSTOM PROPERTIES GO IN BOTH, and that is not an accident.
   The variable block sits on the body element, so the classifier puts
   it in STRUCTURE — and then every var() in the content half resolves
   to nothing if that half is ever installed on its own. Re-declaring
   them is free (identical values, later wins, no cascade effect) and
   it makes each file independently deployable, which is the whole
   point of splitting them. */
const vars = (bare.match(/body\.page-node-type-multi-column-page\s*\{[^}]*--i-[^}]*\}/) || [])[0];
const withVars = (t) => (vars && !t.startsWith(vars) ? vars + '\n' : '') + t;

const banner = (what, extra) => `/* Maine DOE — ${what}, generated by split-css.js from
 * interior-css-injector.css ${ver}. Do not edit this file: edit the
 * source, run  node build-interior-preview.js , then  node split-css.js
 *${extra}
 */\n`;

fs.writeFileSync(path.join(H, 'structural-css-injector.deploy.css'),
  banner('SITE STRUCTURE', `
 * The side menu, breadcrumb, page-title block, content wrappers and
 * social rail. These style what Drupal puts on the page, so they work
 * on a page whose body has not been touched.`) + s);
fs.writeFileSync(path.join(H, 'content-css-injector.deploy.css'),
  banner('PAGE CONTENT', `
 * Everything inside the body field: cards, tables, accordions, contact
 * blocks, the banner, chips. Inert until a page's HTML is replaced.
 * Carries its own copy of the custom properties so it can be installed
 * on its own.`) + c);

const count = (t) => (t.match(/\{/g) || []).length - (t.match(/@media/g) || []).length;
/* A rule whose selector list spans both halves is written into both
   files, one with its structural selectors and one with the rest, so
   the totals differ by exactly the number of those. Counted rather
   than allowed for, or the check would pass while hiding a real
   mismatch. */
const blocks = [...bare.matchAll(/([^{}@]+)\{([^{}]*)\}/g)];
const isBareEl = (p) => /^body[^\s]*\s+#block-doe-content\s+(?:table|img|a|table\s+th|table\s+td)$/.test(p.trim());
const contain = blocks.filter((m) => m[1].trim().split(',').every(isBareEl)
  && /max-width|overflow-wrap|word-break|width:\s*auto/i.test(m[2])).length;
const varRules = blocks.filter((m) => /--[a-z0-9-]+\s*:/i.test(m[2])).length;
const mixed = blocks.filter((m) => !/--[a-z0-9-]+\s*:/i.test(m[2]))
  .map((m) => m[1].trim().split(',').map((x) => x.trim()).filter(Boolean))
  .filter((p) => p.some(isStructure) && p.some((x) => !isStructure(x))).length;
const n0 = count(bare) + mixed + varRules + contain, n1 = count(s), n2 = count(c);
console.log(`structural-css-injector.deploy.css — ${(s.length / 1024).toFixed(1)}KB, ${n1} rules`);
console.log(`content-css-injector.deploy.css    — ${(c.length / 1024).toFixed(1)}KB, ${n2} rules`);
console.log(`source                             — ${(bare.length / 1024).toFixed(1)}KB, ${n0 - mixed - varRules - contain} rules`);
console.log(`  ${mixed} rule(s) split across both, ${varRules} variable and ${contain} containment rule(s) copied to both`);
console.log(n1 + n2 === n0 ? '\nevery rule accounted for.' : `\nMISMATCH: ${n1}+${n2} != ${n0}`);
if (/http:\/\//.test(s) || /http:\/\//.test(c)) console.log('WAF: FAILS — a bare http:// is present');
else console.log('WAF lint: clean, safe to paste');

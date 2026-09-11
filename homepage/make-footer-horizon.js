#!/usr/bin/env node
/* Maine DOE footer horizon — SVG generator
 * Version: 2026-09-10-d  ·  Last edited: 2026-09-10
 *
 * Writes doe-footer-horizon.svg: a tone-on-tone silhouette for the
 * bottom edge of the footer, after maine.gov/ifw. Theirs is forest,
 * because they are Fisheries & Wildlife. Ours is a Maine treeline with
 * a schoolhouse in it.
 *
 * Re-run after editing:  node make-footer-horizon.js
 *
 * WHAT THE EARLIER PASSES GOT WRONG — do not reintroduce these:
 *  · The building sat 24 units BELOW the ground line, so the door
 *    appeared to be sunk into the earth. Everything now derives its
 *    baseline from the same NEAR_BASE constant.
 *  · The roof was drawn as a thin chevron strip, leaving a hollow
 *    triangle underneath. The cupola sat on that gap and the chimney
 *    ended in mid-air. The roof is now one solid triangle, and both
 *    the cupola and the chimney extend well INTO it so they read as
 *    attached rather than balanced on top.
 *  · Every tree got an independently jittered baseline, height, lean
 *    and droop, so the row sawtoothed instead of reading as a mass.
 *    Trees now share an exact baseline, vary gently around a mean, and
 *    are spaced closely enough that the crowns overlap.
 *
 * THREE PLANES, not two. The depth in the IFW footer comes from
 * atmospheric layering — each plane a little closer in value to the
 * ground than the one in front of it. Two planes read as a sticker.
 *
 * PALETTE — must stay close in value to the footer ground (#eee6df).
 * This is texture, not illustration.
 */
const fs = require('fs');
const path = require('path');

const W = 1440, H = 220, BOTTOM = H;

const FAR   = '#eae1d7';   // distant ridge, barely separated from the ground
const MID   = '#ded3c5';   // middle treeline
const NEAR  = '#cfc0ad';   // near treeline and the schoolhouse
const LIT   = '#eee6df';   // window and door openings, same value as the ground

const FAR_BASE  = 150;
const MID_BASE  = 178;
const NEAR_BASE = 200;

/* Deterministic pseudo-random, so the file regenerates identically and
   a diff means a real change rather than a reshuffled treeline. */
let seed = 20260910;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const between = (a, b) => a + rnd() * (b - a);
const f = n => n.toFixed(1);
const P = (x, y) => f(x) + ' ' + f(y);

/* A fir in silhouette: tiers of boughs, each overhanging the one below.
   The outer edge of every bough is a quadratic that bows upward, which
   is what separates a tree from a zigzag. */
function fir(cx, base, h, w) {
  const tiers = Math.max(4, Math.round(h / 14));
  const top = base - h;
  const tierH = h / tiers;

  const right = [], left = [];
  let d = `M${P(cx, top)}`;

  for (let i = 1; i <= tiers; i++) {
    const t = i / tiers;
    const yTip = top + h * t;
    const half = (w / 2) * Math.pow(t, 0.82);
    /* Control point sits only slightly above the chord. A strong bow
       turned every bough into a scallop and the tree read as a fern. */
    const ctl = [cx + half * 0.52, yTip - tierH * 0.30];
    right.push([`Q${P(ctl[0], ctl[1])} ${P(cx + half, yTip)}`,
                `L${P(cx + half * 0.28, yTip + tierH * 0.10)}`]);
    left.unshift([`L${P(cx - half, yTip)}`,
                  `Q${P(-ctl[0] + 2 * cx, ctl[1])} ${P(cx - half * 0.28, yTip - tierH * 0.90)}`]);
  }

  const trunk = Math.max(1.4, w * 0.05);
  d += right.map(p => p.join('')).join('');
  d += `L${P(cx + trunk, base)}L${P(cx - trunk, base)}`;
  d += left.map(p => p.join('')).join('');
  return d + 'Z';
}

/* Rolling ridge, quadratics through alternating anchors. */
function ridge(startY, anchors) {
  let d = `M0 ${BOTTOM}L${P(0, startY)}`;
  let prev = [0, startY];
  anchors.forEach(([x, y, bow]) => {
    d += `Q${P((prev[0] + x) / 2, Math.min(prev[1], y) - (bow || 0))} ${P(x, y)}`;
    prev = [x, y];
  });
  return d + `L${W} ${BOTTOM}Z`;
}

/* Trees in CLUMPS, not a continuous row. Evenly spacing them across the
   full width — even at a natural-looking random step — produced a wall
   of firs that read as a tree farm. Real treelines clump: a few trees
   together, then a real gap. `within` is the spacing inside a clump,
   `gap` the clearing between clumps, and the ratio between the two is
   what makes it read as landscape rather than pattern.
   Every tree still shares one exact baseline. */
function treeline(x0, x1, base, hMean, spread, clump, within, gap, skip) {
  const out = [];
  let x = x0;
  while (x < x1) {
    const n = Math.round(between(clump[0], clump[1]));
    for (let i = 0; i < n && x < x1; i++) {
      if (!(skip && x > skip[0] && x < skip[1])) {
        const h = hMean * between(1 - spread, 1 + spread);
        out.push(fir(x, base, h, h * between(0.46, 0.56)));
      }
      x += between(within[0], within[1]);
    }
    x += between(gap[0], gap[1]);
  }
  return out;
}

/* ── far plane ──────────────────────────────────────────────── */
const farRidge = ridge(FAR_BASE, [
  [200, 128, 18], [470, 148, 4], [740, 120, 22], [1010, 144, 6],
  [1270, 118, 24], [W, 140, 8],
]);
const farTrees = treeline(10, W + 20, FAR_BASE - 4, 22, 0.26, [3, 6], [20, 30], [70, 130]);

/* ── schoolhouse ────────────────────────────────────────────────
   Everything below is measured off NEAR_BASE so the building stands on
   the same ground as the trees. */
const BW = 130, BH = 58, EAVE = 13, RISE = 40;
const SX = 604, SR = SX + BW, CX = SX + BW / 2;
const bodyTop = NEAR_BASE - BH;          // 142
const apex = bodyTop - RISE;             // 102

/* Cupola and chimney both run several units INTO the roof mass. They
   are the same fill, so the overlap is invisible — but it is the
   difference between "attached" and "balanced on top". */
const cupW = 9, cupTop = apex - 17, cupRoof = cupTop - 14;
const chimX = CX + 40, chimW = 13, chimTop = apex + 6;

const school = [
  /* body */
  `M${P(SX, NEAR_BASE)}L${P(SX, bodyTop)}L${P(SR, bodyTop)}L${P(SR, NEAR_BASE)}Z`,
  /* chimney — drawn first so the roof lands on top of its lower half */
  `M${P(chimX, NEAR_BASE)}L${P(chimX, chimTop)}L${P(chimX + chimW, chimTop)}L${P(chimX + chimW, NEAR_BASE)}Z`,
  /* roof: ONE solid triangle with an eave overhang, plus a fascia band
     under the eaves so the edge reads as thickness */
  `M${P(SX - EAVE, bodyTop)}L${P(CX, apex)}L${P(SR + EAVE, bodyTop)}Z`,
  `M${P(SX - EAVE, bodyTop)}L${P(SR + EAVE, bodyTop)}L${P(SR + EAVE - 4, bodyTop + 6)}L${P(SX - EAVE + 4, bodyTop + 6)}Z`,
  /* cupola: base sunk into the ridge, pyramid roof, finial */
  `M${P(CX - cupW, apex + 9)}L${P(CX - cupW, cupTop)}L${P(CX + cupW, cupTop)}L${P(CX + cupW, apex + 9)}Z`,
  `M${P(CX - cupW - 4, cupTop)}L${P(CX, cupRoof)}L${P(CX + cupW + 4, cupTop)}Z`,
  `M${P(CX - 1.5, cupRoof)}L${P(CX - 1.5, cupRoof - 7)}L${P(CX + 1.5, cupRoof - 7)}L${P(CX + 1.5, cupRoof)}Z`,
].join('');

/* Flagpole, clear of the eave so the two don't merge into one shape. */
const FP = SX - EAVE - 32;
const flag = [
  `M${P(FP, NEAR_BASE)}L${P(FP, NEAR_BASE - 106)}L${P(FP + 3, NEAR_BASE - 106)}L${P(FP + 3, NEAR_BASE)}Z`,
  `M${P(FP + 3, NEAR_BASE - 102)}L${P(FP + 3, NEAR_BASE - 76)}` +
  `Q${P(FP + 20, NEAR_BASE - 82)} ${P(FP + 38, NEAR_BASE - 76)}` +
  `L${P(FP + 38, NEAR_BASE - 102)}Q${P(FP + 20, NEAR_BASE - 96)} ${P(FP + 3, NEAR_BASE - 102)}Z`,
].join('');

/* Door foot sits ON the baseline. Windows mirror around the door so the
   outermost pair cannot run through the wall. */
const dHalf = 9, doorTop = NEAR_BASE - 32;
const winW = 12, winH = 17, winY = NEAR_BASE - 46;
const openings = [
  `<path d="M${P(CX - dHalf, NEAR_BASE)}L${P(CX - dHalf, doorTop + 9)}` +
  `Q${P(CX - dHalf, doorTop)} ${P(CX, doorTop)}` +
  `Q${P(CX + dHalf, doorTop)} ${P(CX + dHalf, doorTop + 9)}` +
  `L${P(CX + dHalf, NEAR_BASE)}Z"/>`,
  ...[21, 44].flatMap(d => [CX - d - winW, CX + d])
    .map(x => `<rect x="${f(x)}" y="${f(winY)}" width="${winW}" height="${winH}" rx="1.5"/>`),
].join('');

/* ── middle plane ───────────────────────────────────────────── */
const midRidge = ridge(MID_BASE, [[380, 172, 8], [820, 180, 3], [1240, 170, 9], [W, 178, 4]]);
const midTrees = treeline(-10, W + 20, MID_BASE, 46, 0.22, [2, 4], [26, 38], [100, 180]);

/* ── near plane ─────────────────────────────────────────────── */
const nearGround = ridge(NEAR_BASE, [[420, 196, 4], [900, 202, 2], [W, 197, 4]]);
const nearTrees = treeline(-14, W + 24, NEAR_BASE, 66, 0.20, [1, 3], [34, 48], [140, 250], [FP - 46, SR + EAVE + 40]);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="presentation" aria-hidden="true">
  <g fill="${FAR}">
    <path d="${farRidge}"/>
    ${farTrees.map(d => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <g fill="${MID}">
    <path d="${midRidge}"/>
    ${midTrees.map(d => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <g fill="${NEAR}">
    <path d="${nearGround}"/>
    <path d="${flag}"/>
    <path d="${school}"/>
    ${nearTrees.map(d => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <g fill="${LIT}">${openings}</g>
</svg>
`;

fs.writeFileSync(path.join(__dirname, 'doe-footer-horizon.svg'), svg);
console.log(`doe-footer-horizon.svg written — ${(svg.length / 1024).toFixed(1)}KB, ${W}×${H}`);
console.log(`  far ${FAR} · mid ${MID} · near ${NEAR}`);
console.log(`  ${farTrees.length} far, ${midTrees.length} mid, ${nearTrees.length} near trees`);
console.log(`  ground line ${NEAR_BASE} · building base ${NEAR_BASE} · roof apex ${apex}`);

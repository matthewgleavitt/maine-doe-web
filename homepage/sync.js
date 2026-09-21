#!/usr/bin/env node
/* Maine DOE interior pages — pull in what authors have changed
 * Version: 2026-09-21-b  ·  Last edited: 2026-09-21
 *
 *   node sync.js            check, pull, rebuild
 *   node sync.js --check    say what moved and stop
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Every proposal is built from a snapshot of the site. Authors keep
 * editing the live pages while the review runs, so a body pasted
 * from out/ can overwrite an edit made yesterday. That is the one
 * way this project can destroy work instead of improving it, and it
 * is not hypothetical: three days after the first snapshot, three
 * pages had been edited and one deleted — including a page whose
 * 56,000-character table had been replaced by the entry form it was
 * always meant to be.
 *
 * Run this at the start of a review session, and again before
 * pasting a batch. It only ever pulls the handful of pages that
 * actually moved, so the rest of the review — including everything
 * already approved — stays exactly where it was.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const run = (args) => execFileSync(process.execPath, args, { cwd: __dirname, encoding: 'utf8', stdio: 'pipe' });

/* An override names exact text. If an author rewords the line it
   names, it stops matching and goes quiet — nothing breaks, the
   instruction simply stops applying, which is the failure mode
   hardest to notice. Checked on every run, including the runs where
   nothing moved: an override can also stop matching because a rule
   here changed, not only because an author edited. */
function checkOverrides() {
  console.log(`\n── 5. checking your page instructions still match ────`);
  const C2 = path.join(__dirname, 'cache');
  const idx2 = JSON.parse(fs.readFileSync(path.join(C2, 'inventory-multi_column_page.json'), 'utf8'));
  const aud = JSON.parse(fs.readFileSync(path.join(C2, 'pages.json'), 'utf8'));
  const by2 = Object.fromEntries(aud.map(p2 => [p2.alias, p2]));
  const ov2 = JSON.parse(fs.readFileSync(path.join(C2, 'overrides.json'), 'utf8'));
  let bad = 0;
  for (const [alias, o] of Object.entries(ov2)) {
    if (alias === '_readme') continue;
    const node = idx2.find(x => x.alias === alias);
    if (!node) { console.log('   page is gone: ' + alias); bad++; continue; }
    let r2; try { r2 = propose(node, by2[alias], idx2, o); } catch (e) { continue; }
    const ids = r2.decisions.map(x => x.id);
    const want = [];
    if (o.dropText) want.push(...[].concat(o.dropText).map(t => ['droptext', t]));
    if (o.dropSection) want.push(...[].concat(o.dropSection).map(t => ['drop', t]));
    if (o.h3) want.push(...[].concat(o.h3).map(t => ['h3', t]));
    if (o.labelList) want.push(...Object.values(o.labelList).map(t => ['label', t]));
    if (o.sectionCta) want.push(...Object.keys(o.sectionCta).map(t => ['sectioncta', t]));
    if (o.unfold) want.push(...[].concat(o.unfold).map(t => ['unfold', t]));
    if (o.headings) want.push(...Object.keys(o.headings).map(t => ['rename', t]));
    const miss = want.filter(([k]) => !ids.some(i => i.startsWith(k)));
    if (miss.length) {
      bad++;
      console.log('   ' + alias + ' — ' + miss.length + ' no longer matches:');
      miss.forEach(([k, t]) => console.log('      ' + k + ': ' + String(t).slice(0, 58)));
    }
  }
  if (!bad) console.log('   all page instructions still match.');

}

const step = (n, what) => console.log(`\n── ${n}. ${what} ${'─'.repeat(Math.max(0, 50 - what.length))}`);

try {
  step(1, 'what has changed on the server');
  const drift = run(['check-drift.js', '--json']);
  console.log(drift.split('\n').filter(l => l.trim()).join('\n'));

  const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', 'drift.json'), 'utf8'));
  const moved = (d.edited || []).length + (d.added || []).length + (d.removed || []).length;
  if (!moved) {
    console.log('\nNothing has moved. The proposals are current.');
    checkOverrides();
    process.exit(0);
  }
  if (process.argv.includes('--check')) {
    console.log('\n--check: stopping here. Run without it to pull these in.');
    process.exit(0);
  }

  step(2, 'pulling just those pages');
  console.log(run(['refresh-pages.js', '--drift']).trim());

  step(3, 'rebuilding the audit');
  console.log(run(['audit-pages.js', '--json']).trim().split('\n').slice(-1)[0]);

  step(4, 'rebuilding the proposals and the panel');
  console.log(run(['build-review-panel.js']).trim().split('\n').filter(l => /pages|unsafe|contents/.test(l)).join('\n'));

  checkOverrides();

  console.log('\nDone. Reload the panel.');
  if ((d.edited || []).length) {
    console.log('\nThese pages changed underneath the review — worth re-checking if you had already approved them:');
    for (const n of d.edited) console.log('   ' + (n.alias || n));
  }
  if ((d.removed || []).length) {
    console.log('\nGone from the site, and now gone from the review:');
    for (const n of d.removed) console.log('   ' + (n.alias || n));
  }
} catch (e) {
  console.error('\nStopped: ' + (e.stderr || e.message || e));
  process.exit(1);
}

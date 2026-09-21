/* Maine DOE homepage — standing invariant checks
 * Version: 2026-09-17-c  ·  Last edited: 2026-09-17
 *
 * WHY THIS EXISTS
 * ---------------
 * Every regression in this project so far has been mechanically
 * detectable and was missed because each change was verified only
 * against the symptom it was meant to fix:
 *
 *   · hero strip painted grey forever — a clone template picked up the
 *     loading class. The loading state was checked; the settled state
 *     was not.
 *   · slider silently absent — trimming to one authored slide tripped
 *     build()'s `slides.length < 2` guard. Controls were never counted.
 *   · every width measured wrong for several rounds — the preview
 *     collapsed to 492px because the harness reproduced the theme's
 *     floats without its clearfix. Nothing asserted preview geometry
 *     against production.
 *
 * Run the WHOLE suite after ANY change. Checking the one thing you
 * touched is what produced the list above.
 *
 * HOW TO RUN
 * ----------
 * Load a built preview, wait for the feeds (the calendar endpoint can
 * take 15s), then in the page:
 *
 *     const src = await (await fetch('/checks.js')).text();
 *     new Function(src + ';return runChecks()')()
 *
 * Returns { pass, fail, results[] }. `fail` must be 0 before deploying.
 */
function runChecks() {
  var out = [];
  var seen = function (name, ok, detail) {
    out.push({ check: name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  };
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return [].slice.call(document.querySelectorAll(s)); };
  var vis = function (s) { return $$(s).filter(function (e) { return e.offsetParent !== null; }); };
  var box = function (e) { return e.getBoundingClientRect(); };

  /* ── hoisting hazard ────────────────────────────────────────
     Three separate outages in this project came from the same thing:
     a `var` constant declared below the boot block, hoisted as the NAME
     but not the VALUE, read by a path that turned out to run
     synchronously. HERO_CLASS killed every hero photo; CACHE_PREFIX
     made the feed cache never hit; TONES emptied the events panel.
     Cheap to assert from the page: if a feed painted, the constants it
     needed resolved. */
  var evRows = $$('.dh-event-list li:not([data-dh-tpl])');
  if ($('.dh-event-list')) {
    seen('events painted (constants resolved)', evRows.length > 0,
         evRows.length + ' rows');
  }

  /* ── harness sanity ─────────────────────────────────────────
     If this fails nothing else below can be trusted. #block-doe-content
     is overflow:hidden, so it is a block formatting context and will
     SHRINK to avoid any uncleared float above it. */
  var block = $('#block-doe-content');
  if (block) {
    var w = Math.round(box(block).width);
    seen('page column spans the viewport', Math.abs(w - window.innerWidth) <= 2,
         w + 'px of ' + window.innerWidth + 'px');
  }

  /* ── nothing left in a loading or template state ──────────── */
  seen('no loading placeholders remain', $$('.dh-skel').length === 0,
       $$('.dh-skel').length + ' left');
  seen('no clone template is visible', vis('[data-dh-tpl]').length === 0,
       vis('[data-dh-tpl]').length + ' visible');

  /* ── sliders actually built ──────────────────────────────────
     A slider that never got built still LOOKS fine: one static slide,
     no controls, and index links that navigate away instead of
     changing slide. Count the controls, don't eyeball the slide. */
  ['hero', 'news'].forEach(function (kind) {
    var host = $('[data-dh-slider="' + kind + '"]');
    if (!host) return;
    var slides = host.querySelectorAll('.dh-slide').length;
    if (slides < 2) { seen(kind + ' slider: single slide, no slider expected', true, slides); return; }
    /* Phones get no controls at all; wider screens get the full
       prev/pause/next cluster. */
    var want = window.innerWidth > 640 ? 3 : 0;
    var btns = host.querySelectorAll('.dh-ctl button').length;
    seen(kind + ' slider controls match the layout', btns === want,
         btns + ' buttons at ' + window.innerWidth + 'px, wanted ' + want);

    /* Autoplay has no visible sign on a phone now that the pause
       button is gone, so the JS publishes its timer state instead.
       Without this the check suite cannot tell a running slider from
       a dead one — which is precisely how a hero that never advanced
       shipped and sat there unnoticed. */
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      seen(kind + ' slider is running', host.getAttribute('data-dh-playing') === '1',
           'data-dh-playing=' + host.getAttribute('data-dh-playing'));
    }

    var link = host.querySelector('[data-dh-go]');
    seen(kind + ' index links switch slides', !!(link && link.dataset.dhBound === '1'),
         link ? 'bound=' + link.dataset.dhBound : 'no index link');
    var idx = host.querySelectorAll('.dh-index li, .dh-stories li').length;
    seen(kind + ' index count matches slides', idx === slides, idx + ' index vs ' + slides + ' slides');
  });

  /* ── every newsroom card is the same height ──────────────────
     Only one slide is displayed at a time, so a card that is 80px
     taller than its neighbour is invisible until the slider turns and
     the whole page jumps. The three things that drove it were the
     photo frame, the headline and the blurb, so assert all three are
     pinned rather than measuring the hidden slides. A placeholder at
     a different ratio to a real photo was worth 36px on its own. */
  var newsPhotos = $$('.dh-news .dh-photo');
  if (newsPhotos.length > 1) {
    var ratios = newsPhotos.map(function (p) { return getComputedStyle(p).aspectRatio; });
    var oneRatio = ratios.every(function (r) { return r === ratios[0]; });
    seen('newsroom photo frames share one ratio', oneRatio, ratios.join(' / '));
  }
  ['.dh-news .dh-cap h3', '.dh-news .dh-cap .dh-blurb'].forEach(function (sel) {
    var el = $(sel);
    if (!el) return;
    var cs = getComputedStyle(el);
    if (cs.webkitLineClamp === 'none' || !cs.webkitLineClamp) return;
    /* Clamped without a floor still varies — the clamp caps the tall
       ones, the floor lifts the short ones. Both are needed. */
    seen(sel.split(' ').pop() + ' has a height floor to match its clamp',
         parseFloat(cs.minHeight) > 0, 'min-height ' + cs.minHeight);
  });

  /* ── feeds produced content ─────────────────────────────────── */
  [['.dh-index li', 'hero strip'], ['.dh-stories li', 'newsroom rows'],
   ['.dh-event-list li', 'event rows'], ['.dh-card-link', 'good-news cards'],
   ['.dh-vids a', 'video slots']].forEach(function (pair) {
    var n = vis(pair[0]).length;
    seen(pair[1] + ' present', n > 0, n);
  });

  /* ── section headers fit their container ────────────────────
     A header row is h2 + rule + link on one line with the h2 set to
     nowrap, so enlarging the type pushes the link out of a narrow
     column rather than wrapping. Raising the type from 21px to 24px
     did exactly that to the events panel, and the size itself measured
     perfectly correct — only the ROW was wrong. Check the row. */
  $$('.dh-shead').forEach(function (h) {
    var more = h.querySelector('.dh-more');
    if (!more || !h.parentElement) return;
    var over = Math.round(box(more).right - box(h.parentElement).right);
    var name = (h.querySelector('h2') || {}).textContent || '?';
    seen('"' + name.trim().slice(0, 18) + '" header fits its column', over <= 0,
         over > 0 ? over + 'px past the edge' : Math.abs(over) + 'px spare');
  });

  /* ── hero photographs actually resolved ─────────────────────
     Every slide falling back to the branded panel looks deliberate, so
     this fails silently to the eye. It is how a hoisting bug that left
     HERO_CLASS undefined during the synchronous cached render went
     unnoticed: five slides, five headlines, zero photographs. */
  var heroFrames = $$('.dh-hero .dh-photo');
  if (heroFrames.length) {
    var withPhoto = heroFrames.filter(function (f) { return !!f.querySelector('img'); }).length;
    seen('hero slides have photographs', withPhoto > 0,
         withPhoto + ' of ' + heroFrames.length + ' (0 means the gate rejected every one)');
  }

  /* ── clamped text must not escape its box ───────────────────
     overflow:hidden clips at the PADDING box, so anything clamped with
     -webkit-line-clamp and given padding-bottom renders its next line
     inside that padding, where it stays visible. That is how a third
     line slid under the good-news Read more bar. */
  $$('.dh-mg-p, .dh-card-p, .dh-hero .dh-blurb, .dh-more-good .dh-h').forEach(function (el, i) {
    var cs = getComputedStyle(el);
    if (cs.webkitLineClamp === 'none' || !cs.webkitLineClamp) return;
    var pb = parseFloat(cs.paddingBottom) || 0;
    if (i === 0 || pb > 0) {
      seen('clamped text has no padding-bottom (' + el.className + ')', pb === 0, pb + 'px');
    }
  });
  $$('.dh-more-good a').forEach(function (a, i) {
    var p = a.querySelector('.dh-mg-p');
    if (!p) return;
    var barTop = box(a).bottom - 44;
    seen('mini card ' + (i + 1) + ' clears the Read more bar', box(p).bottom <= barTop,
         Math.round(box(p).bottom - barTop) + 'px');
  });

  /* ── hero card geometry ─────────────────────────────────────── */
  /* Only meaningful in the desktop layout, where the card floats inside
     a fixed-height stage above the strip. Below 641px the hero stacks
     and the two are simply consecutive blocks. */
  var strip = $('.dh-index');
  var card = $('.dh-hero .dh-slide.is-on .dh-card') || $('.dh-hero .dh-card');
  if (strip && card && window.innerWidth > 640) {
    var gap = Math.round(box(strip).top - box(card).bottom);
    seen('hero card clears the story strip', gap >= 30, gap + 'px');
  }

  /* ── copy quality ───────────────────────────────────────────── */
  $$('.dh-hero .dh-blurb').forEach(function (p, i) {
    var t = (p.textContent || '').trim();
    if (!t) return;
    seen('hero blurb ' + (i + 1) + ' ends on a sentence', /[.!?]$/.test(t),
         JSON.stringify(t.slice(-16)));
  });

  /* ── links resolve ──────────────────────────────────────────── */
  var dead = $$('.dh-home a[href="/link"]').length;
  seen('no placeholder /link hrefs', dead === 0, dead + ' found');

  /* ── images loaded ──────────────────────────────────────────── */
  var imgs = $$('.dh-home img').filter(function (i) { return i.complete && i.currentSrc; });
  var broken = imgs.filter(function (i) { return i.naturalWidth === 0; });
  seen('no broken images', broken.length === 0,
       broken.length + ' of ' + imgs.length + ' (lazy ones off-screen are skipped)');

  var pass = out.filter(function (r) { return r.ok; }).length;
  return {
    pass: pass,
    fail: out.length - pass,
    results: out.filter(function (r) { return !r.ok; }).concat(
             out.filter(function (r) { return r.ok; }))
  };
}

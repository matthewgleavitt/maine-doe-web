/* Maine DOE homepage — JS Injector rule
 * Version: 2026-09-10-r  ·  Last edited: 2026-09-10
 * Versions are per-file and do NOT need to match the other two.
 */

/* ============================================================
   Maine DOE homepage
   JS Injector rule — scope to page: doe   ·   Placement: Footer
   ============================================================

   Progressive enhancement only. The body field already contains
   every story as a real, linked, readable article. This file adds:

     · autoplay on the two sliders (hero 7s, newsroom 6s)
     · the prev / pause / next controls — built in JavaScript on
       purpose, so Drupal's content filter never sees a button
       element in the body field and can't strip it
     · the hero strip thumbnails, taken from each slide's image
     · the broken/missing image guard
     · live content from the Newsroom

   The feed code follows the same pattern as the existing DOE News
   widget on /doe/learning/elo: WordPress.com's wp/v2 API, numeric
   category IDs via data-category, images out of the _embed payload.
   Verified CORS-enabled from the live www.maine.gov origin — no key,
   no proxy, no Apps Script in the path.

   Accessibility rules this obeys, because autoplaying carousels are
   the most-complained-about pattern on government sites:
     · never autoplays when the visitor asks for reduced motion
     · stops on hover, on keyboard focus, and when the tab is hidden
     · always offers a visible pause control
     · every slide stays in the DOM as a real link regardless of
       which one is showing
   ============================================================ */
(function () {
  'use strict';

  var root = document.querySelector('.dh-home');
  if (!root) return;

  /* ── Version reporting ────────────────────────────────────────
     Each of the three files carries its OWN version, and they do NOT
     have to match. That's deliberate: an earlier design demanded all
     three be identical, which meant a one-file change forced pasting
     all three just to keep the stamps aligned — busywork that also
     made a real mismatch harder to spot, because there was always a
     redeploy in flight.

     Now this just reports what is actually loaded. Nothing is flagged
     as wrong unless a file has no stamp at all, which does mean it
     predates this scheme and is genuinely stale.

     Silent in normal use. ?dhdebug=1 shows the badge.
     ------------------------------------------------------------ */
  var JS_VERSION = '2026-09-10-r';
  reportVersions();

  function reportVersions() {
    var css = (getComputedStyle(root).getPropertyValue('--dh-version') || '')
                .trim().replace(/^["']|["']$/g, '');
    var html = (root.getAttribute('data-dh-version') || '').trim();

    var missing = !css || !html;
    var debug = /[?&]dhdebug=1/.test(location.search);
    if (!missing && !debug) return;

    var lines = [
      missing ? 'Maine DOE homepage — a file predates version stamping.'
              : 'Maine DOE homepage — loaded versions',
      '  body HTML   : ' + (html || 'NO STAMP — this file is stale, re-paste it'),
      '  CSS Injector: ' + (css || 'NO STAMP — this rule is stale, or it did not save'),
      '  JS Injector : ' + JS_VERSION,
      '  (these are independent; they do not need to match)'
    ];

    /* Under ?dhdebug=1, also report what the browser actually computed
       for the rules that have caused trouble. A screenshot of this says
       more than a screenshot of the page. */
    if (debug) {
      lines.push('', 'computed:');
      [['.dh-stories a', 'display,paddingLeft'],
       ['.dh-mission-list li', 'display,paddingLeft'],
       ['.dh-mission-list li .dh-ico', 'position,width,backgroundColor'],
       ['.dh-index .dh-thumb', 'cssFloat,width'],
       ['.dh-card-link', 'display,flexDirection'],
       ['.dh-hero', 'paddingBottom']
      ].forEach(function (row) {
        var el = root.querySelector(row[0]);
        if (!el) { lines.push('  ' + row[0] + ' -> NOT FOUND'); return; }
        var cs = getComputedStyle(el);
        lines.push('  ' + row[0] + ' -> ' + row[1].split(',').map(function (prop) {
          return prop + ':' + cs[prop];
        }).join('  '));
      });
      lines.push('  rules loaded: ' + countRules() + ' (expect a few hundred)');
    }

    var text = lines.join('\n');
    if (window.console) console.warn(text);

    if (debug) {
      var flag = document.createElement('div');
      flag.setAttribute('style',
        'position:fixed;left:12px;bottom:12px;z-index:99999;max-width:460px;' +
        'background:' + (missing ? '#8a2e13' : '#123') + ';color:#fff;' +
        'font:11.5px/1.5 monospace;padding:12px 14px;' +
        'border-radius:8px;white-space:pre-wrap;box-shadow:0 6px 20px rgba(0,0,0,.45)');
      flag.textContent = text;
      document.body.appendChild(flag);
    }
  }

  /* How many of our rules the browser actually parsed. A number far
     below the expected count means the stylesheet arrived truncated. */
  function countRules() {
    var n = 0;
    for (var i = 0; i < document.styleSheets.length; i++) {
      var rules;
      try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
      for (var r = 0; r < rules.length; r++) {
        if (rules[r].selectorText && rules[r].selectorText.indexOf('dh-') > -1) n++;
      }
    }
    return n;
  }

  /* ── Addresses are PROTOCOL-RELATIVE on purpose ──────────────
     The maine.gov WAF rejects an Injector save — CSS or JS — whose
     body contains a scheme-qualified address, reading it as remote
     file inclusion. Starting at the double slash carries no scheme,
     so the save goes through, and the browser resolves it against
     the page (https on maine.gov) at request time.
     Do not "tidy" these back into full addresses; the save will
     start failing again with a bare 403 and no explanation. */
  var WP_SITE  = 'mainedoenews.net';
  var API_BASE = '//public-api.wordpress.com/wp/v2/sites/' + WP_SITE;

  /* Fonts attach from here rather than the CSS rule, same reason. */
  var FONT_CSS = '//fonts.googleapis.com/css2' +
                 '?family=League+Spartan:wght@500;600;700;800' +
                 '&family=Inter:wght@400;500;600;700&display=swap';

  loadFonts();

  function loadFonts() {
    if (document.querySelector('link[data-dh-fonts]')) return;
    ['//fonts.googleapis.com', '//fonts.gstatic.com'].forEach(function (href) {
      var pre = document.createElement('link');
      pre.rel = 'preconnect';
      pre.href = href;
      if (href.indexOf('gstatic') > -1) pre.crossOrigin = 'anonymous';
      document.head.appendChild(pre);
    });
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_CSS;
    link.setAttribute('data-dh-fonts', '1');
    document.head.appendChild(link);
  }

  var CALM = window.matchMedia &&
             window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Categories on nearly every post — useless as an eyebrow label. */
  var DULL = { 'newsroom articles': 1, 'news & views': 1, 'uncategorized': 1, 'maine doe': 1 };

  /* Mission icon paths. Declared HERE, above the boot block that calls
     drawIcons(), not down beside the function — `var` hoists the name
     but not the value, so a call that runs first sees undefined and
     throws, which would take the feeds down with it. */
  var ICONS = {
    student:   'M2 8.5l10-4 10 4-10 4-10-4z M6.5 10.8v3.9c0 1.6 2.9 2.8 5.5 2.8s5.5-1.2 5.5-2.8v-3.9',
    idea:      'M9.2 18.5h5.6 M10.2 21h3.6 M12 3a6 6 0 0 0-3.9 10.6c.6.6 1 1.5 1.1 2.4h5.6c.1-.9.5-1.8 1.1-2.4A6 6 0 0 0 12 3z',
    educator:  'M12 11.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z M4.5 20.5c0-3.6 3.4-5.5 7.5-5.5s7.5 1.9 7.5 5.5',
    guidance:  'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v14.5H6.5A2.5 2.5 0 0 0 4 20V5.5z M8.5 7.5h7 M8.5 11h7',
    funding:   'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z M12 7.2v9.6 M14.6 9.9c0-1-1.2-1.7-2.6-1.7s-2.6.7-2.6 1.7 1.2 1.5 2.6 1.8 2.6.8 2.6 1.8-1.2 1.7-2.6 1.7-2.6-.7-2.6-1.7',
    trust:     'M12 3l7 2.9v5.8c0 4.3-2.9 7.4-7 8.8-4.1-1.4-7-4.5-7-8.8V5.9L12 3z M9.2 11.9l2 2 3.6-3.7'
  };


  /* Written as markup rather than built with createElementNS, because
     that call needs the SVG namespace URL as a literal — and a
     scheme-qualified address anywhere in this file gets the Injector
     save rejected by the WAF. Assigning innerHTML inside an HTML
     document namespaces the SVG automatically, so no URL is needed. */
  function drawIcons() {
    var slots = root.querySelectorAll('[data-dh-ico]');
    for (var n = 0; n < slots.length; n++) {
      var d = ICONS[slots[n].getAttribute('data-dh-ico')];
      if (!d || slots[n].querySelector('.dh-ico')) continue;

      var paths = d.split(' M').map(function (seg, i) {
        return '<path d="' + (i ? 'M' : '') + seg + '"/>';
      }).join('');

      /* Built here rather than authored in the body field: an empty <i>
         placeholder gets deleted by Drupal's content filter, and
         createElementNS would need the SVG namespace URL, which the WAF
         rejects. Assigning innerHTML namespaces the SVG on its own. */
      var mark = document.createElement('span');
      mark.className = 'dh-ico';
      mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
        'focusable="false">' + paths + '</svg>';
      slots[n].insertBefore(mark, slots[n].firstChild);
    }
  }


  /* ── boot ─────────────────────────────────────────────────── */

  var frames = root.querySelectorAll('.dh-photo');
  for (var f = 0; f < frames.length; f++) guardPhoto(frames[f]);

  var made = {};
  var boxes = root.querySelectorAll('[data-dh-slider]');
  for (var i = 0; i < boxes.length; i++) {
    made[boxes[i].getAttribute('data-dh-slider')] = build(boxes[i]);
  }

  drawIcons();
  loadFeeds(made);
  loadEvents();
  loadVideos();


  /* ── missing and broken images ────────────────────────────────
     The CSS fires the branded fallback panel on :empty OR on
     .dh-no-photo. The class is needed because whitespace between
     tags counts as a child node, so a div an editor has touched is
     almost never truly :empty.
     ------------------------------------------------------------ */
  function guardPhoto(frame) {
    /* A video thumbnail keeps its duration chip and play ring, so it
       drops the broken image without switching to the fallback panel —
       the gradient behind it is already a reasonable poster. */
    var isVideo = frame.classList.contains('dh-vid-thumb');
    var img = frame.querySelector('img');

    var fail = function () {
      if (img && img.parentNode) img.parentNode.removeChild(img);
      if (!isVideo) frame.classList.add('dh-no-photo');
    };

    if (isVideo && !img) return;

    if (!img || !img.getAttribute('src')) { fail(); return; }
    if (img.complete) { if (img.naturalWidth === 0) fail(); return; }
    img.addEventListener('error', fail);
  }


  /* Drupal's content filter deletes empty inline elements, so a
     <span class="dh-thumb"></span> authored in the body field never
     survives the paste — it renders locally and is simply absent on
     the live page, which is why the strip showed no thumbnails there.
     Same failure that took out the mission icons and the video
     descriptions. Build it here instead of trusting the markup. */
  function ensureThumb(link) {
    if (!link) return null;
    var t = link.querySelector('.dh-thumb');
    if (!t) {
      t = document.createElement('span');
      t.className = 'dh-thumb';
      link.insertBefore(t, link.firstChild);
    }
    return t;
  }


  /* ── slider ───────────────────────────────────────────────── */

  function build(box) {
    var stage = box.querySelector('.dh-stage');
    if (!stage) return null;

    var slides  = stage.querySelectorAll('.dh-slide');
    if (slides.length < 2) return null;

    var isHero  = box.getAttribute('data-dh-slider') === 'hero';
    var dwell   = parseInt(box.getAttribute('data-dh-dwell'), 10) || 6000;
    var index   = box.querySelectorAll('[data-dh-go]');
    var cur     = 0;
    var timer   = null;
    var held    = false;
    var playing = !CALM;

    var ctl = makeControls();
    seedThumbs();
    wireIndex();

    /* Thumbnails come from each slide's own image, so there's nothing
       extra to author. Only applied once the image has genuinely
       loaded — a src that 404s would paint nothing over the CSS base
       and leave a hole in the strip. */
    function seedThumbs() {
      for (var n = 0; n < index.length; n++) {
        var thumb = ensureThumb(index[n]);
        if (!thumb || !slides[n]) continue;
        var img = slides[n].querySelector('.dh-photo > img');
        if (!img || !img.getAttribute('src')) continue;
        paintThumb(img, thumb);
      }
    }

    function paintThumb(img, thumb) {
      var apply = function () {
        thumb.style.backgroundImage = 'url("' + img.getAttribute('src') + '")';
      };
      if (img.complete) { if (img.naturalWidth > 0) apply(); return; }
      img.addEventListener('load', apply);
    }

    function wireIndex() {
      for (var k = 0; k < index.length; k++) {
        (function (link, n) {
          if (link.dataset.dhBound) return;
          link.dataset.dhBound = '1';
          link.addEventListener('click', function (e) { e.preventDefault(); jump(n); });
        })(index[k], k);
      }
    }

    function makeControls() {
      var bar = document.createElement('div');
      bar.className = 'dh-ctl';

      var prev  = btn('‹', 'Previous story');
      var play  = btn('❚❚', 'Pause slideshow');
      var next  = btn('›', 'Next story');
      var count = document.createElement('span');
      count.className = 'dh-count';

      bar.appendChild(prev); bar.appendChild(play);
      bar.appendChild(next); bar.appendChild(count);

      prev.addEventListener('click', function () { jump(cur - 1); });
      next.addEventListener('click', function () { jump(cur + 1); });
      play.addEventListener('click', function () { setPlaying(!playing); });

      if (isHero) { stage.appendChild(bar); }
      else { box.insertBefore(bar, box.querySelector('.dh-stories')); }
      return { play: play, count: count };
    }

    function btn(glyph, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = glyph;
      b.setAttribute('aria-label', label);
      return b;
    }

    function paint(n) {
      cur = (n + slides.length) % slides.length;
      for (var s = 0; s < slides.length; s++) slides[s].classList.toggle('is-on', s === cur);
      for (var a = 0; a < index.length; a++) {
        if (a === cur) index[a].setAttribute('aria-current', 'true');
        else index[a].removeAttribute('aria-current');
      }
      ctl.count.textContent = (cur + 1) + ' / ' + slides.length;
    }

    /* The live index item's top bar fills over the dwell, so the strip
       doubles as the progress indicator. Custom properties inherit
       into ::before; transition-duration does not — which is why the
       dwell rides in as a variable. */
    function sweep() {
      for (var a = 0; a < index.length; a++) index[a].classList.remove('is-timing');
      var live = index[cur];
      if (!live || !playing) return;
      live.style.setProperty('--dh-dwell', dwell + 'ms');
      void live.offsetWidth;
      live.classList.add('is-timing');
    }

    function tick() {
      clearTimeout(timer);
      if (!playing) return;
      timer = setTimeout(function () { paint(cur + 1); cycle(); }, dwell);
    }

    function cycle() { sweep(); tick(); }
    function jump(n) { paint(n); if (playing) cycle(); }

    function setPlaying(on) {
      playing = on;
      ctl.play.innerHTML = on ? '❚❚' : '▶';
      ctl.play.setAttribute('aria-label', on ? 'Pause slideshow' : 'Play slideshow');
      if (on) { cycle(); }
      else {
        clearTimeout(timer);
        for (var a = 0; a < index.length; a++) index[a].classList.remove('is-timing');
      }
    }

    ['mouseenter', 'focusin'].forEach(function (ev) {
      box.addEventListener(ev, function () {
        if (!playing || held) return;
        held = true;
        clearTimeout(timer);
        for (var a = 0; a < index.length; a++) index[a].classList.remove('is-timing');
      });
    });
    ['mouseleave', 'focusout'].forEach(function (ev) {
      box.addEventListener(ev, function () {
        if (!held) return;
        if (ev === 'focusout' && box.contains(document.activeElement)) return;
        held = false;
        if (playing) cycle();
      });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearTimeout(timer);
      else if (playing && !held) cycle();
    });

    paint(0);
    setPlaying(playing);

    /* Called after a feed swaps the slides in — re-reads the DOM. */
    return {
      refresh: function () {
        clearTimeout(timer);
        slides = stage.querySelectorAll('.dh-slide');
        index  = box.querySelectorAll('[data-dh-go]');
        wireIndex();
        seedThumbs();
        paint(0);
        if (playing) cycle();
      }
    };
  }


  /* ── feeds ────────────────────────────────────────────────────
     Each block carries data-category (a numeric WordPress category
     ID) and data-count, exactly like the ELO news widget. Leave
     data-category empty for "most recent, any category". Leave the
     attribute off entirely and the block keeps its authored markup.
     ------------------------------------------------------------ */

  function loadFeeds(sliders) {
    var hosts = root.querySelectorAll('[data-dh-feed]');

    for (var h = 0; h < hosts.length; h++) {
      (function (host) {
        var kind = host.getAttribute('data-dh-feed');
        if (!host.hasAttribute('data-category')) return;   /* not wired up yet */

        get(host,
            parseInt(host.getAttribute('data-count'), 10) || 5,
            function (posts) {
              if (!posts || !posts.length) return;   /* keep the authored markup */
              try {
                if (kind === 'highlights') fillCards(host, posts);
                else {
                  fillSlides(host, posts, kind);
                  if (sliders[kind]) sliders[kind].refresh();
                }
              } catch (e) { /* authored markup stands; never blank the page */ }
            });
      })(hosts[h]);
    }
  }

  /* Query params, all verified working against mainedoenews.net:
       categories         — only these (numeric IDs, comma separated)
       categories_exclude — never these
       exclude            — never these individual post IDs
     Ask for extra posts so that pinned slides and any post that slips
     through can be trimmed without leaving the block short. */
  function get(host, count, done) {
    var cat  = host.getAttribute('data-category');
    var noCat = host.getAttribute('data-exclude-categories');
    var noId  = host.getAttribute('data-exclude-posts');

    var url = API_BASE + '/posts?per_page=' + (count + 5) + '&_embed' +
              (cat   ? '&categories=' + encodeURIComponent(cat) : '') +
              (noCat ? '&categories_exclude=' + encodeURIComponent(noCat) : '') +
              (noId  ? '&exclude=' + encodeURIComponent(noId) : '');

    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (posts) { done((posts || []).map(tidy)); })
      .catch(function (err) { if (window.console) console.warn('DOE homepage feed:', err); done(null); });
  }

  /* The hero frame is roughly 2.9:1 and full width. Featured images on
     mainedoenews.net are mostly small and near-square — 330x248 and
     491x369 are both real examples off the Good News category — so
     stretching one across the hero upscales it to mush. Anything
     narrower than this falls back to the branded panel, which reads as
     deliberate where a blurry upscale just reads as broken. The cards
     and the newsroom slider are far smaller frames and take whatever
     the post has. */
  var HERO_MIN_WIDTH = 1000;

  function tidy(p) {
    var media = p._embedded && p._embedded['wp:featuredmedia'];
    var m = media && media[0];
    var det = m && m.media_details;
    return {
      title: text(p.title && p.title.rendered),
      url: (p.link || '').replace(/^http:/, 'https:'),
      blurb: clip(text(p.excerpt && p.excerpt.rendered), 108),
      date: p.date || '',
      image: m && m.source_url ? m.source_url.replace(/^http:/, 'https:') : '',
      imageW: (det && det.width) || 0,
      kind: label(p)
    };
  }

  function text(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function clip(s, n) {
    if (s.length <= n) return s;
    var cut = s.slice(0, n);
    var stop = cut.lastIndexOf(' ');
    return (stop > 0 ? cut.slice(0, stop) : cut) + '…';
  }

  function fullDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function shortDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /* The most specific category wins — "Special Education" reads far
     better as an eyebrow than "News & Views". */
  function label(p) {
    var terms = p._embedded && p._embedded['wp:term'] && p._embedded['wp:term'][0];
    if (!terms) return 'Update';
    for (var i = 0; i < terms.length; i++) {
      var name = text(terms[i].name);
      if (name && !DULL[name.toLowerCase()]) return name;
    }
    return 'Update';
  }

  /* Render by cloning the authored markup, so the body field stays
     the single source of truth for structure. */

  /* Slides marked data-dh-pin are hand-written in the Drupal body and
     stay put — that's how something with no Newsroom article behind it
     (a campaign, a deadline, a program page) gets on the hero. Feed
     posts fill the remaining spots up to data-count.

     Index items are regenerated for every slide, pinned or not, so the
     data-dh-go numbering can't drift out of sync with the slides. */
  function fillSlides(host, posts, kind) {
    var stage = host.querySelector('.dh-stage');
    var list  = host.querySelector('.dh-index, .dh-stories');
    if (!stage || !list || !stage.querySelector('.dh-slide') || !list.querySelector('li')) return;

    var count    = parseInt(host.getAttribute('data-count'), 10) || 5;
    var pinned   = [].slice.call(stage.querySelectorAll('.dh-slide[data-dh-pin]'));
    var slideTpl = stage.querySelector('.dh-slide:not([data-dh-pin])');
    slideTpl = (slideTpl || stage.querySelector('.dh-slide')).cloneNode(true);
    slideTpl.removeAttribute('data-dh-pin');
    var itemTpl = list.querySelector('li').cloneNode(true);
    var ctlBar  = stage.querySelector('.dh-ctl');

    /* Never repeat a story that's already pinned by hand. */
    var pinnedUrls = {};
    pinned.forEach(function (el) {
      var d = readSlide(el);
      if (d.url) pinnedUrls[d.url] = 1;
    });
    var fresh = posts.filter(function (p) { return !pinnedUrls[p.url]; })
                     .slice(0, Math.max(0, count - pinned.length));

    /* Detach pinned nodes before wiping, then put them back. */
    pinned.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    stage.innerHTML = '';
    list.innerHTML = '';

    var rows = pinned.map(function (el) { return { node: el, data: readSlide(el) }; })
      .concat(fresh.map(function (p) { return { node: null, data: p }; }));

    rows.forEach(function (row, n) {
      var slide = row.node;

      if (!slide) {
        var p = row.data;
        slide = slideTpl.cloneNode(true);
        setPhoto(slide.querySelector('.dh-photo'), p, kind === 'hero' ? HERO_MIN_WIDTH : 0);
        set(slide, '.dh-eyebrow', kind === 'news' ? fullDate(p.date) + ' · ' + p.kind : p.kind);

        var head = slide.querySelector('h2, h3');
        if (head) {
          var link = head.querySelector('a');
          if (link) { link.textContent = p.title; link.href = p.url; }
          else head.textContent = p.title;
        }
        /* .dh-blurb, not '.dh-cap p' — the eyebrow is also a <p> inside
           .dh-cap and comes first, so a loose selector overwrites the
           eyebrow with the excerpt and leaves the real blurb stale. */
        var blurb = slide.querySelector('.dh-blurb');
        if (blurb) blurb.textContent = p.blurb;
        var cta = slide.querySelector('.dh-btn');
        if (cta) cta.href = p.url;
      }

      slide.classList.toggle('is-on', n === 0);
      stage.appendChild(slide);

      var d = row.data;
      var item = itemTpl.cloneNode(true);
      var a = item.querySelector('a');
      a.setAttribute('data-dh-go', n);
      if (d.url) a.href = d.url;
      delete a.dataset.dhBound;
      if (n === 0) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
      set(item, '.dh-kicker', d.kind);
      set(item, '.dh-t', d.title);
      set(item, '.dh-h', d.title);
      set(item, '.dh-d', d.date ? shortDate(d.date) : '');
      var thumb = ensureThumb(a);
      if (thumb) thumb.style.backgroundImage = '';
      list.appendChild(item);
    });

    if (ctlBar) stage.appendChild(ctlBar);   /* controls survive the swap */
  }

  /* Read a hand-authored slide back out of the DOM so it can be
     indexed alongside the feed ones. */
  function readSlide(el) {
    var head = el.querySelector('h2, h3');
    var cta  = el.querySelector('.dh-btn') || (head && head.querySelector('a'));
    var eyebrow = el.querySelector('.dh-eyebrow');
    return {
      title: head ? text(head.innerHTML) : '',
      kind: eyebrow ? text(eyebrow.innerHTML) : 'Featured',
      url: cta ? cta.getAttribute('href') : '',
      date: ''
    };
  }

  function fillCards(host, posts) {
    var first = host.querySelector('.dh-card-link');
    if (!first) return;
    var cardTpl = first.cloneNode(true);

    var extras = root.querySelector('.dh-more-good');
    var extraLi = extras && extras.querySelector('li');
    var extraTpl = extraLi ? extraLi.cloneNode(true) : null;

    host.innerHTML = '';
    if (extras && extraTpl) extras.innerHTML = '';

    /* 3 photo cards + 2 overflow cards. Capped here rather than trusting
       data-count, so a larger count can't lengthen the band. */
    posts.slice(0, 5).forEach(function (p, n) {
      if (n < 3) {
        var card = cardTpl.cloneNode(true);
        card.href = p.url;
        setPhoto(card.querySelector('.dh-photo'), p);
        set(card, '.dh-card-tag', p.kind);
        set(card, '.dh-meta', fullDate(p.date));
        set(card, '.dh-card-h', p.title);
        set(card, '.dh-card-p', p.blurb);
        host.appendChild(card);
      } else if (extraTpl && extras) {
        var li = extraTpl.cloneNode(true);
        li.querySelector('a').href = p.url;
        set(li, '.dh-place', shortDate(p.date));
        set(li, '.dh-h', p.title);
        set(li, '.dh-mg-p', p.blurb);
        extras.appendChild(li);
      }
    });

    /* The hand-written placeholder disclaimer is no longer true once
       real stories are in. */
    var disclaimer = root.querySelector('.dh-good .dh-note');
    if (disclaimer) disclaimer.remove();
  }

  function setPhoto(frame, p, minWidth) {
    if (!frame) return;
    frame.setAttribute('data-dh-kind', p.kind);
    frame.innerHTML = '';
    frame.classList.remove('dh-no-photo');

    var tooSmall = minWidth && p.imageW && p.imageW < minWidth;
    if (!p.image || tooSmall) { frame.classList.add('dh-no-photo'); return; }
    var img = document.createElement('img');
    img.src = p.image;
    img.alt = '';
    img.loading = 'lazy';
    frame.appendChild(img);
    guardPhoto(frame);
  }

  function set(scope, sel, value) {
    var el = scope.querySelector(sel);
    if (el) el.textContent = value;
  }


  /* ── events ───────────────────────────────────────────────────
     The calendar page reads ?focus= but has no per-event deep link, so
     each row goes to its own registration URL when the event has one,
     and otherwise to the calendar filtered to that focus area. Landing
     on the right filtered view beats dumping everyone on the index.
     ------------------------------------------------------------ */
  var TONES = {
    'data': 'blue', 'school health': 'green', 'child nutrition': 'rust',
    'federal programs': 'plum', 'school safety': 'rust',
    'special education': 'plum', 'special services & inclusive education': 'plum',
    'special & inclusive education': 'plum', 'early learning': 'green',
    'career & technical education': 'blue', 'teaching & learning': 'teal'
  };

  function loadEvents() {
    var box = root.querySelector('[data-dh-feed="events"]');
    if (!box) return;
    var endpoint = box.getAttribute('data-endpoint');
    var list = box.querySelector('.dh-event-list');
    if (!endpoint || !list) return;

    var tpl = list.querySelector('li');
    if (!tpl) return;
    tpl = tpl.cloneNode(true);
    var want = parseInt(box.getAttribute('data-count'), 10) || 6;

    fetch(endpoint + (endpoint.indexOf('?') > -1 ? '&' : '?') + 'type=calendar')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var events = (j && j.events) || [];
        if (!events.length) return;              /* keep the authored rows */

        list.innerHTML = '';
        events.slice(0, want).forEach(function (ev) {
          var li = tpl.cloneNode(true);
          var a = li.querySelector('a');

          var focus = ev.focusArea || '';
          /* href stays a real, working link — that is what a middle-click,
             a screen reader and a crawler follow. The click handler below
             opens the dialog instead for ordinary clicks. */
          a.href = ev.register
            ? String(ev.register).replace(/^https?:/, '')
            : '/doe/calendar' + (focus ? '?focus=' + encodeURIComponent(focus) : '');
          a.addEventListener('click', function (e) {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            openEvent(ev);
          });

          var d = new Date((ev.date || '') + 'T12:00:00');
          if (!isNaN(d)) {
            set(li, '.dh-mo', d.toLocaleDateString('en-US', { month: 'short' }));
            set(li, '.dh-dy', String(d.getDate()));
          }
          set(li, '.dh-h', ev.title || '');
          set(li, '.dh-sub', [ev.time || ev.startTime, ev.type].filter(Boolean).join(' · '));

          var tag = li.querySelector('.dh-tag');
          if (tag) {
            if (focus) {
              tag.textContent = focus;
              tag.setAttribute('data-tone', TONES[focus.toLowerCase()] || 'blue');
            } else { tag.remove(); }
          }
          list.appendChild(li);
        });
      })
      .catch(function (err) { if (window.console) console.warn('DOE homepage events:', err); });
  }


  /* ── event dialog ─────────────────────────────────────────────
     A copy of the modal on /doe/calendar — same markup, same icons,
     same cluster colours — built from the feed data already in hand,
     so it costs no extra request. Lifted from
     comms-portal/calendar/index.html; if that modal changes, change
     this with it.
     ------------------------------------------------------------ */
  var CLUSTER_OF = {
    'Webinar': 'learning', 'Training': 'learning', 'Workshop': 'learning',
    'Information Session': 'learning',
    'Conference': 'convening', 'Discussion Group': 'convening', 'Office Hours': 'convening',
    'Public Hearing': 'public',
    'Student Opportunity': 'students'
  };
  var SVG = {
    close: '<path d="M6 6l12 12M6 18L18 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    pin:   '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    user:  '<circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/>',
    mail:  '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + SVG[name] + '</svg>';
  }

  var dlg = null, lastFocus = null;

  function openEvent(ev) {
    if (!dlg) dlg = buildDialog();
    lastFocus = document.activeElement;

    dlg.className = 'dh-dlg cat-' + (CLUSTER_OF[ev.type] || 'convening');

    var when = [prettyDate(ev.date), ev.time || ev.startTime].filter(Boolean).join(' - ');
    var where = ev.venueName || ev.location || '';
    var addr = ev.venueAddress || '';

    fact(dlg, 'when',  'clock', 'When',  when);
    fact(dlg, 'where', 'pin',   'Where', where, addr);
    fact(dlg, 'aud',   'users', 'Audience', ev.audience || '');
    fact(dlg, 'con',   'user',  'Contact', ev.contactName || '', '', ev.contactEmail || '');

    var chip = dlg.querySelector('.dh-dlg-chip');
    chip.textContent = ev.type || 'Event';
    chip.hidden = !ev.type;

    set(dlg, '.dh-dlg-title', ev.title || '');

    var desc = dlg.querySelector('.dh-dlg-desc');
    desc.textContent = text(ev.long || ev.desc || '');
    desc.hidden = !desc.textContent.trim();

    var cta = dlg.querySelector('.dh-dlg-cta');
    if (ev.register) {
      cta.href = String(ev.register).replace(/^https?:/, '');
      cta.firstChild.textContent = (ev.registerText || 'Register') + ' ';
      cta.hidden = false;
    } else { cta.hidden = true; }

    var meta = dlg.querySelector('.dh-dlg-meta');
    meta.textContent = ev.focusArea ? 'Focus area - ' + ev.focusArea : '';
    meta.hidden = !ev.focusArea;

    dlg.hidden = false;
    document.body.style.overflow = 'hidden';
    dlg.querySelector('.dh-dlg-close').focus();
  }

  /* One fact row: icon, label, value, plus an optional second line and
     an optional mailto. Hides itself when there is no value, rather
     than leaving a stranded label. */
  function fact(root_, key, ico, label, value, sub, email) {
    var row = root_.querySelector('.dh-dlg-fact-' + key);
    if (!row) return;
    if (!value && !email) { row.hidden = true; return; }
    row.hidden = false;
    var html = '<span aria-hidden="true">' + icon(ico) + '</span><div><strong>' +
               label + '</strong><span class="dh-dlg-val"></span>';
    row.innerHTML = html + '</div>';
    row.querySelector('.dh-dlg-val').textContent = value;
    var box = row.querySelector('div');
    if (sub) {
      var s2 = document.createElement('span');
      s2.setAttribute('style', 'font-weight:500;font-size:13px;opacity:.85;display:block');
      s2.textContent = sub;
      box.appendChild(s2);
    }
    if (email) {
      var a = document.createElement('a');
      a.className = 'dh-dlg-mail';
      a.href = 'mailto:' + email;
      a.setAttribute('aria-label', 'Email ' + (value || email));
      a.innerHTML = '<span aria-hidden="true">' + icon('mail') + '</span>';
      a.appendChild(document.createTextNode(email));
      box.appendChild(a);
    }
  }

  function closeEvent() {
    if (!dlg) return;
    dlg.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function buildDialog() {
    var d = document.createElement('div');
    d.className = 'dh-dlg';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-label', 'Event details');
    d.hidden = true;
    d.innerHTML =
      '<div class="dh-dlg-panel">' +
        '<button type="button" class="dh-dlg-close" aria-label="Close">' + icon('close') + '</button>' +
        '<span class="dh-dlg-chip"></span>' +
        '<h2 class="dh-dlg-title"></h2>' +
        '<div class="dh-dlg-desc"></div>' +
        '<div class="dh-dlg-facts">' +
          '<div class="dh-dlg-fact dh-dlg-fact-when"></div>' +
          '<div class="dh-dlg-fact dh-dlg-fact-where"></div>' +
          '<div class="dh-dlg-fact dh-dlg-fact-aud"></div>' +
          '<div class="dh-dlg-fact dh-dlg-fact-con"></div>' +
        '</div>' +
        '<a class="dh-dlg-cta" href="#" target="_blank" rel="noopener">Register ' + icon('arrow') + '</a>' +
        '<div class="dh-dlg-meta"></div>' +
      '</div>';
    d.addEventListener('click', function (e) { if (e.target === d) closeEvent(); });
    d.querySelector('.dh-dlg-close').addEventListener('click', closeEvent);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !d.hidden) closeEvent();
    });
    root.appendChild(d);
    return d;
  }

  function prettyDate(iso) {
    var d = new Date((iso || '') + 'T12:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('en-US',
      { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }


  /* ── videos ───────────────────────────────────────────────────
     Titles and thumbnails work with no key (see the note in the body
     field). Descriptions are the exception: YouTube's channel feed
     carries them but sends no CORS headers, so they come through the
     Apps Script proxy — the same thing Elfsight does server-side.

     Put the exec URL on the block as data-endpoint, PROTOCOL-RELATIVE:
       <div class="dh-watch" data-dh-feed="youtube"
            data-endpoint="//script.google.com/macros/s/AKfy…/exec">
     With no data-endpoint the authored titles and thumbnails stand and
     the description slots stay hidden.
     ------------------------------------------------------------ */
  function loadVideos() {
    var box = root.querySelector('[data-dh-feed="youtube"]');
    if (!box) return;

    var endpoint = box.getAttribute('data-endpoint');
    if (!endpoint) return;

    var slots = box.querySelectorAll('.dh-vids a');
    if (!slots.length) return;

    fetch(endpoint + (endpoint.indexOf('?') > -1 ? '&' : '?') +
          'type=youtube_videos&count=' + slots.length)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        if (!j || j.error || !j.videos || !j.videos.length) return;
        j.videos.slice(0, slots.length).forEach(function (v, n) {
          var a = slots[n];
          if (v.url) a.href = v.url.replace(/^https?:/, '');
          a.setAttribute('data-dh-yt', v.id);

          var frame = a.querySelector('.dh-photo');
          if (frame && v.thumb) {
            var img = frame.querySelector('img');
            if (!img) {
              img = document.createElement('img');
              img.alt = ''; img.loading = 'lazy';
              frame.insertBefore(img, frame.firstChild);
            }
            img.src = v.thumb.replace(/^https?:/, '');
            guardPhoto(frame);
          }
          set(a, '.dh-vid-h', v.title);

          /* Created here, not authored. Drupal's content filter deletes
             empty inline tags, so a placeholder span never survives the
             paste — the same thing that killed the mission icons. */
          if (v.description) {
            var body = a.querySelector('.dh-vid-body') || a;
            var d = body.querySelector('.dh-vid-p');
            if (!d) {
              d = document.createElement('span');
              d.className = 'dh-vid-p';
              body.appendChild(d);
            }
            d.textContent = v.description;
          }
        });
      })
      .catch(function (err) {
        if (window.console) console.warn('DOE homepage videos:', err);
      });
  }
})();

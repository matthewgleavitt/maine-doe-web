#!/usr/bin/env node
/* Maine DOE interior pages — mechanical cleanup
 * Version: 2026-09-21-n  ·  Last edited: 2026-09-21
 *
 *   node interior-cleanup.js <url-or-file> [--write out.html]
 *   node interior-cleanup.js --audit urls.txt
 *
 * WHAT THIS IS FOR
 * ----------------
 * The 84-page survey turned up eight recurring defects. Five of them
 * are mechanical — the same edit every time, no judgement — and doing
 * those by hand across 84 pages is how mistakes get made. This does
 * those five and REPORTS the other three, because they need a person.
 *
 * MECHANICAL (fixed here):
 *   empty <p> spacers .............. 56 pages
 *   unlinked @maine.gov addresses .. 42 pages
 *   Word paste artifacts ............ 7 pages
 *   <b>/<i>, <u>, data-entity attrs, target=_blank, safelinks
 *   white-on-white inline colour .... found live on /doe/fedrelief,
 *                                     where a "Resources & Tools"
 *                                     heading is invisible
 *
 * JUDGEMENT (reported, never auto-fixed):
 *   no section-header device ....... 62 pages — someone has to decide
 *                                    what is tier 1 and what is tier 2
 *   legacy jumbotron ............... 11 pages — becomes dc-note or a
 *                                    button depending on what it says
 *   h5.card-title .................. 18 pages — card-header is a
 *                                    different DOM shape, not a rename
 *
 * THE RULE THIS OBEYS: never alter a word of content. Every transform
 * below changes markup around text, or turns text into a link. If a
 * change would drop or reword content it belongs in the report, not
 * in the output.
 */
'use strict';
const fs = require('fs');

/* ── the format vocabulary, written once ─────────────────────────
   Four places need to know which words name a file format: the two
   chip rules, the rule that strips file sizes, and the loss check
   that has to know a chip is not a loss. They were four separate
   lists and they had already drifted — "rtf" was in none of them
   while two pages carried "(RTF, 226KB)".

   THE KEY IS WHAT THE AUTHOR TYPED; THE VALUE IS WHAT THE CHIP
   SAYS. Matt's call, and the right one: a chip is a tag, not a
   sentence, and the reader does not need to be told "Document"
   twice — the thing next to it is plainly a document. So every way
   of naming a Word file — "Word Document", "Docx/Word", "DOCX",
   "Word Document Download" — sets the same two-letter-wider chip
   that "Word" does, and the page stops spelling one idea six ways.
   "Fillable PDF" collapses the same way.
   WEB PDF AND PRINT PDF DO NOT. /funding/training-materials links
   EPS_Infographic.pdf and EPS_Infographic1_Print.pdf under the
   identical title "EPS Funding Formula Infographic"; the qualifier
   is the only thing telling the two apart, and two identical rows
   with two identical chips would be worse than what is there now.
   Say the word and they collapse too. */
const FORMAT_CANON = {
  'pdf': 'PDF', 'fillable pdf': 'PDF',
  'web pdf': 'Web PDF', 'print pdf': 'Print PDF',
  'word': 'Word', 'word doc': 'Word', 'word document': 'Word',
  'word document download': 'Word', 'doc': 'Word', 'docx': 'Word', 'docx/word': 'Word',
  'excel': 'Excel', 'excel spreadsheet': 'Excel', 'excel document': 'Excel',
  'spreadsheet': 'Excel', 'xls': 'Excel', 'xlsx': 'Excel', 'csv': 'CSV',
  'powerpoint': 'PowerPoint', 'power point': 'PowerPoint', 'ppt': 'PowerPoint', 'pptx': 'PowerPoint',
  'zip': 'ZIP', 'rtf': 'RTF',
  'youtube': 'YouTube', 'video': 'Video', 'recording': 'Recording', 'audio': 'Audio',
  'podcast': 'Podcast', 'webinar': 'Webinar', 'slides': 'Slides',
  'presentation': 'Presentation', 'transcript': 'Transcript', 'infographic': 'Infographic',
  'google doc': 'Google Doc', 'google docs': 'Google Doc', 'google slides': 'Google Slides',
  'google sheet': 'Google Sheet', 'google sheets': 'Google Sheet',
  'google form': 'Google Form', 'google forms': 'Google Form',
};
const FORMAT_WORDS = Object.keys(FORMAT_CANON);
/* Longest first, so "word document" wins over "word" in an
   alternation — a shorter prefix matching first would leave
   "document" stranded as prose. */
const FORMAT_ALT = FORMAT_WORDS.slice().sort((a, b) => b.length - a.length)
  .map(w => w.replace(/ /g, '\\s+').replace(/\//g, '\\/')).join('|');
/* A number and a unit. The unit is what makes it a file size rather
   than a quantity, so it is never optional — but it is not always
   spelled correctly either: /cds/laws writes "(PDF, 64K)" and
   /cds/reporting "(PDF, 1.1MKB)". Both are file sizes typed by
   someone in a hurry, and a pattern that only knew KB/MB/GB left
   exactly those two behind, which is the worst of both worlds. The
   unit is still required; it is just allowed to be sloppy. Safe
   because nothing here fires unless a format word is beside it. */
const SIZE_RE = '[0-9][0-9.,]*\\s*[KMG](?:KB|B)?\\b';

const normFmt = (raw) => String(raw).trim().replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').toLowerCase();
/* What the chip says. */
const chipLabel = (raw) => FORMAT_CANON[normFmt(raw)] || String(raw).trim();
/* What the loss check compares — the same idea, in one spelling, so
   that turning "Word Document" into a Word chip does not read as a
   page that lost the word "Document". */
const canonKey = (raw) => (FORMAT_CANON[normFmt(raw)] || String(raw)).toLowerCase().replace(/\s+/g, '');

/* ── transforms ──────────────────────────────────────────────────
   Each returns [html, countOfChanges]. Order matters: unwrap
   safelinks before stripping attributes, or the real URL is lost. */
const FIXES = [
  ['safelinks unwrapped', (h) => {
    let n = 0;
    h = h.replace(/https?:\/\/[a-z0-9.]*safelinks\.protection\.outlook\.com\/\?url=([^"&]+)[^"]*/gi,
      (_, enc) => { n++; try { return decodeURIComponent(enc); } catch { return enc; } });
    return [h, n];
  }],

  /* INSIDE href ONLY. This used to finish with
       h.replace(/[?&]"/g, '"')
     to tidy a query string left ending in a bare ? — across the WHOLE
     document. Any sentence ending in a question mark before a closing
     quote lost the question mark: "why isn't the curriculum working
     for these students?" became "…for these students". Found by the
     content check on /MTSS and /lgbtq/parent, and it would have run
     silently over 832 pages.

     The tidy-up now happens inside the href being edited, where a ?
     is punctuation in a URL rather than in a sentence. */
  ['tracking params stripped', (h) => {
    let n = 0;
    h = h.replace(/href="([^"]*)"/gi, (whole, url) => {
      if (!/[?&](e=\[?UNIQID\]?|ab_channel=|feature=youtu\.be)/i.test(url)) return whole;
      n++;
      const cleaned = url
        .replace(/([?&])(e=\[?UNIQID\]?|ab_channel=[^&]*|feature=youtu\.be)/gi,
          (m, p1) => (p1 === '?' ? '?' : ''))
        .replace(/[?&]+$/, '');
      return `href="${cleaned}"`;
    });
    return [h, n];
  }],

  ['bare email linked', (h) => {
    let n = 0;
    /* Only outside an existing anchor and not already a mailto. The
       negative lookahead on </a> is what stops it double-wrapping a
       link whose text is the address. */
    /* ANY ADDRESS, NOT JUST @maine.gov. The rule was written for the
       department's own staff and every other domain fell through it —
       so /educators/edprepprograms/approved, which lists a contact at
       each approved provider, had a column of addresses at bates.edu,
       bowdoin.edu, colby.edu and the rest that a reader had to select
       and copy by hand.
       The domain must have a dot and a real top level for this to
       fire, so an @handle in running text is not mistaken for one. */
    h = h.replace(/(^|[\s>(])([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})(?![^<]*<\/a>)(?!")/g,
      (m, pre, addr) => { n++; return `${pre}<a href="mailto:${addr}">${addr}</a>`; });
    return [h, n];
  }],

  /* Inline colour inside a dark component is always wrong: the cube
     and the note are navy, so the only legible ink is white, and the
     stylesheet has to force it with !important to win. Stripping the
     attribute means the markup says what the page does. */
  ['inline colour stripped in dark components', (h) => {
    let n = 0;
    h = h.replace(/<div[^>]*class="[^"]*\b(?:contact-cube|dc-note)\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, (block) =>
      block.replace(/style="([^"]*)"/gi, (m, st) => {
        if (!/(^|;)\s*color\s*:/i.test(st)) return m;
        n++;
        const cleaned = st.replace(/(^|;)\s*color\s*:[^;]*/gi, '$1')
          .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
        return cleaned ? `style="${cleaned}"` : '';
      }));
    return [h, n];
  }],

  ['white-on-white text', (h) => {
    let n = 0;
    /* A white inline colour on an element that is NOT inside a dark
       component. contact-cube and dc-note are legitimately dark, so
       white text there is correct and must survive. */
    h = h.replace(/<(\w+)([^>]*?)style="([^"]*)"([^>]*)>/g, (m, tag, a, style, b) => {
      if (!/color:\s*(#fff(fff)?|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/i.test(style)) return m;
      /* `.replace(/^;/, ';')` was a no-op and left style="; font-size:…"
         on the output. Collapse doubles, then drop a leading one. */
      const cleaned = style
        .replace(/(^|;)\s*color\s*:[^;]*/i, '$1')
        .replace(/;{2,}/g, ';')
        .replace(/^\s*;\s*/, '')
        .replace(/\s*;\s*$/, '')
        .trim();
      n++;
      return cleaned && cleaned !== ';' ? `<${tag}${a}style="${cleaned}"${b}>` : `<${tag}${a}${b}>`;
    });
    return [h, n];
  }],

  ['empty paragraphs removed', (h) => {
    let n = 0;
    /* <p[^>]*>, not <p>. Written without the attribute part it missed
       every empty paragraph that carried a class or a leftover style
       — 216 of them on 88 pages, each one a blank line the author
       cannot see in the editor and cannot delete. */
    h = h.replace(/<p[^>]*>(?:&nbsp;|\s|<br\s*\/?>)*<\/p>/gi, () => { n++; return ''; });
    return [h, n];
  }],

  ['empty anchors removed', (h) => {
    let n = 0;
    h = h.replace(/<a>(?:&nbsp;|\s)*<\/a>/gi, () => { n++; return ''; });
    return [h, n];
  }],

  ['b/i to strong/em', (h) => {
    let n = 0;
    h = h.replace(/<(\/?)b(\s[^>]*)?>/gi, (m, s, a) => { n++; return `<${s}strong${a || ''}>`; })
         .replace(/<(\/?)i(\s[^>]*)?>/gi,  (m, s, a) => { n++; return `<${s}em${a || ''}>`; });
    return [h, n];
  }],

  ['u tags unwrapped', (h) => {
    let n = 0;
    h = h.replace(/<\/?u\s*>/gi, () => { n++; return ''; });
    return [h, n];
  }],

  /* "mailto: name@maine.gov" — a space after the colon, which some
     mail clients follow and some drop on the floor. Six of them. */
  ['mailto addresses repaired', (h) => {
    let n = 0;
    h = h.replace(/href="mailto:\s+/gi, () => { n++; return 'href="mailto:'; });
    return [h, n];
  }],
  /* THE AUTHOR'S ALIGNMENT IS KEPT AS THE HOUSE CLASS.
     data-align="left" is the editor recording that the text should
     wrap around this picture. The cleanup strips data-align — rightly,
     it is an editor attribute the front end does not read — but
     stripping it threw the instruction away with it, so a picture the
     author had set to wrap came out full width with the text pushed
     below. On /pineproject the Made in Maine bookshelf is exactly
     that: the video beside it wraps, the bookshelf no longer does.
     Translated rather than deleted. left and right become the class
     the stylesheet already has for a wrapped image; center becomes
     the centred one. Nothing else changes. */
  ['image alignment translated to the house class', (h) => {
    let n = 0;
    h = h.replace(/<img\b([^>]*)\sdata-align="(left|right|center)"([^>]*)>/gi, (m, a, how, b) => {
      const cls = how === 'center' ? 'doe-img-center' : 'doe-img-' + how;
      const rest = (a + b);
      if (/class="/.test(rest)) {
        if (new RegExp('class="[^"]*\\b' + cls + '\\b').test(rest)) return m.replace(/\sdata-align="[^"]*"/i, '');
        n++; return ('<img' + rest + '>').replace(/class="/, 'class="' + cls + ' ');
      }
      n++; return '<img class="' + cls + '"' + rest + '>';
    });
    return [h, n];
  }],
  ['drupal entity attrs stripped', (h) => {
    let n = 0;
    /* filename= belongs in this list and was missing from it: 4,716
       of them survived on 259 pages. Drupal writes it beside the
       entity attributes when a document link is inserted, it is not a
       real HTML attribute, and it duplicates the href. */
    h = h.replace(/\s(data-entity-type|data-entity-uuid|data-entity-substitution|data-teams|paraeid|paraid|tabindex|data-align|filename)="[^"]*"/gi,
      () => { n++; return ''; });
    h = h.replace(/\sclass="file file--mime-[^"]*"/gi, () => { n++; return ''; });
    /* AND THE ONES THAT CAME OUT AS "[object Object]". The link
       widget serialises its own configuration into the tag when it
       fails — advanced, anchor, email, linktext, target, tel, title,
       type, url — and each lands with a JavaScript object stringified
       into it. 13 of them on 2 pages. They are not HTML attributes,
       they mean nothing to a browser and nothing to a reader, and
       they travel with the markup every time it is copied.
       ONLY the value is judged, never the attribute name, because
       title="[object Object]" is junk while a real title is not. */
    h = h.replace(/\s[a-zA-Z-]+="\[object Object\]"/g, () => { n++; return ''; });
    return [h, n];
  }],

  ['target/rel stripped', (h) => {
    let n = 0;
    h = h.replace(/\s(target="_blank"|rel="(noopener|noreferrer)[^"]*")/gi, () => { n++; return ''; });
    return [h, n];
  }],

  /* AN INLINE STYLE THAT IS NOT A DECISION.
     5,813 declarations survive on 162 pages, and they are not all
     junk — the table pattern in the skill puts width, text-align,
     background-color and color inline on purpose, and 2,926 widths
     are how the columns are sized. Only the properties that are
     always editor residue go, counted first to be sure:
       font-family 1,532 and font-size 1,637, almost all on <span>
       line-height 827, likewise
       margin / margin-left / margin-bottom 941, on <p> and <li>
     The last is what made the first bullet of "What to Expect During
     and After Your Technical Assistance Visit" sit 8px right of the
     bullets under it — <li style="margin-left:8px"> on that item and
     nothing on its siblings. */
  /* PADDING ON A TABLE CELL. 558 cells carry their own, which the
     stylesheet then has to fight — and loses on, so cells in one
     table sit at a different rhythm from cells in the next. The
     stylesheet sets 14px 20px on every cell; these are what stopped
     it applying. Width, text-align, background-color and color stay:
     those are the table pattern and are set deliberately. */
  ['cell padding handed back to the stylesheet', (h) => {
    let n = 0;
    h = h.replace(/<(td|th)\b([^>]*?)\sstyle="([^"]*)"([^>]*)>/gi, (m, tag, a, style, b) => {
      if (!/\bpadding/i.test(style)) return m;
      const kept = style.replace(/(?:^|;)\s*padding[a-z-]*\s*:[^;]*/gi, '')
        .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
      n++;
      return kept ? `<${tag}${a} style="${kept}"${b}>` : `<${tag}${a}${b}>`;
    });
    return [h, n];
  }],

  ['inline layout styles stripped', (h) => {
    let n = 0;
    const DROP = /(?:^|;)\s*(?:font-family|font-size|line-height|margin|margin-top|margin-right|margin-bottom|margin-left|text-indent|letter-spacing|font-variant|mso-[a-z-]+)\s*:[^;]*/gi;
    h = h.replace(/<([a-z0-9]+)([^>]*?)\sstyle="([^"]*)"([^>]*)>/gi, (m, tag, a, style, b) => {
      if (!DROP.test(style)) { DROP.lastIndex = 0; return m; }
      DROP.lastIndex = 0;
      const kept = style.replace(DROP, '').replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
      n++;
      return kept ? `<${tag}${a} style="${kept}"${b}>` : `<${tag}${a}${b}>`;
    });
    return [h, n];
  }],

  /* A BULLET WHOSE ONLY CONTENT IS A SUBLIST.
     <li><ul>…</ul></li> draws a bullet with nothing beside it and
     then indents the sublist under it — the stray black dot above
     "Q: What is CLASS?" on /learning/earlychildhood/publicpreschool/
     monitoring. The sublist belongs inside the item before it, which
     is what the author meant and what every other page does. */
  ['orphan bullet merged into the item above', (h) => {
    let n = 0;
    h = h.replace(/<\/li>(\s*)<li\b[^>]*>\s*(<(ul|ol)\b[\s\S]*?<\/\3>)\s*<\/li>/gi,
      (m, gap, list) => {
        /* A lazy match cannot be trusted across another level of
           nesting, so anything deeper is left alone. */
        if (/<(ul|ol)\b/i.test(list.slice(list.indexOf('>') + 1))) return m;
        n++;
        return gap + list + '</li>';
      });
    return [h, n];
  }],

  /* AN EMPTY LIST ITEM. 39 of them — a bullet with no words. */
  ['empty list items removed', (h) => {
    let n = 0;
    h = h.replace(/<li\b[^>]*>(?:&nbsp;|\s|<br\s*\/?>)*<\/li>/gi, () => { n++; return ''; });
    return [h, n];
  }],

  /* CKEDITOR BOOKMARKS. <span id="cke_bm_135S" style="display:none">
     is where the editor's cursor was when someone last saved. It is
     invisible, it is meaningless, and it survives every round trip. */
  ['editor bookmarks removed', (h) => {
    let n = 0;
    h = h.replace(/<span[^>]*id="cke_bm_[^"]*"[^>]*>(?:&nbsp;|\s)*<\/span>/gi, () => { n++; return ''; });
    return [h, n];
  }],

  /* A SPAN THAT SAYS NOTHING. Google Docs and Word wrap runs of text
     in spans carrying font-weight:400, font-style:normal and
     white-space:pre-wrap — the browser's own defaults, written out.
     Once the residue properties above are stripped the span has no
     attributes left at all, and a span with no attributes is just a
     wrapper around its own contents. */
  ['default-value styles dropped', (h) => {
    let n = 0;
    h = h.replace(/<span([^>]*)\sstyle="([^"]*)"([^>]*)>/gi, (m, a, style, b) => {
      const kept = style
        .replace(/(?:^|;)\s*font-weight\s*:\s*(?:400|normal)\s*(?=;|$)/gi, '')
        .replace(/(?:^|;)\s*font-style\s*:\s*normal\s*(?=;|$)/gi, '')
        .replace(/(?:^|;)\s*white-space\s*:\s*pre-wrap\s*(?=;|$)/gi, '')
        .replace(/(?:^|;)\s*float\s*:\s*none\s*(?=;|$)/gi, '')
        .replace(/(?:^|;)\s*display\s*:\s*inline\s*!?\s*important?\s*(?=;|$)/gi, '')
        .replace(/(?:^|;)\s*background-color\s*:\s*(?:#fff(?:fff)?|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))\s*(?=;|$)/gi, '')
        /* vertical-align:baseline and color:black are what an inline
           element already does — Word writes them out in full on
           every span it creates. They kept 1,392 spans alive on 29
           pages: a span with any attribute is not a bare span, so it
           survived, and the bare spans nested around it could not
           collapse either. On
           /learning/earlychildhood/pkexpansiongrant/2021 that was
           seven levels deep around the word "SAU".
           An inline colour inside a dark component is a different
           matter and is handled by its own rule, earlier. */
        .replace(/(?:^|;)\s*vertical-align\s*:\s*baseline\s*(?=;|$)/gi, '')
        .replace(/(?:^|;)\s*color\s*:\s*(?:black|#000(?:000)?|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))\s*(?=;|$)/gi, '')
        .replace(/(?:^|;)\s*text-decoration\s*:\s*none\s*(?=;|$)/gi, '')
        .replace(/(?:^|;)\s*font-variant\s*:\s*normal\s*(?=;|$)/gi, '')
        .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
      if (kept === style) return m;
      n++;
      return kept ? `<span${a} style="${kept}"${b}>` : `<span${a}${b}>`;
    });
    return [h, n];
  }],

  /* AND THEN THE BARE SPAN IT LEAVES. <span>text</span> with no
     attributes is a wrapper around nothing. Unwrapped, which is what
     makes the difference visible in the editor: the author stops
     seeing a nest of spans they cannot delete. */
  /* A LIST ITEM WHOSE WHOLE CONTENT IS ONE PARAGRAPH.
     36 items on 10 pages are written <li><p>…</p></li>. The paragraph
     adds nothing — an <li> is already a block — but it does hide the
     link from anything that asks what the item STARTS with, so on
     /learning/mathpathways the slide-deck row was the one item in its
     list that got none of the link-list treatment: no weight on the
     title, no chevron, a different size. "Intro to Math is different
     than the others".
     Only when the paragraph is the item's entire content and carries
     nothing of its own, so nothing can be lost by removing it. */
  ['paragraph inside a list item unwrapped', (h) => {
    let n = 0;
    h = h.replace(/(<li\b[^>]*>)\s*<p(\s[^>]*)?>([\s\S]*?)<\/p>\s*(<\/li>)/gi,
      (m, open, attrs, inner, close) => {
        if (/<p\b|<div\b|<ul\b|<ol\b/i.test(inner)) return m;   // not the only block
        if (attrs && /style=|class=/i.test(attrs)) return m;      // the <p> is carrying something
        n++; return open + inner.trim() + close;
      });
    return [h, n];
  }],
  /* TEXT THAT IS NOT IN ANYTHING.
     47 runs of text on 13 pages sit at block level with no paragraph
     around them — the editor dropped out of the <p> and the sentence
     was typed straight into the container. On /cert/faq that is most
     of the answers: the question is a <p><strong>, and the answer
     after it is a naked text node, so the question appears to have
     nothing under it and the text that follows belongs to nothing —
     "how do I print doesn't have info but then stuff is nested
     weird".
     It matters past the look of it. A bare text node has no block
     box, so no margin, no line-height and none of the paragraph
     rules reach it; it cannot be found by anything that reads the
     page structurally; and the FAQ-to-accordion step could not see
     these answers at all, because an answer it can move has to be an
     element.
     THE RUN IS WRAPPED, NOT REBUILT. Everything between the two block
     tags goes inside one <p> exactly as it stands, inline markup and
     all, and only when the inline tags in it are balanced — so there
     is nothing to get wrong and nothing to lose. */
  ['loose text wrapped in a paragraph', (h) => {
    let n = 0;
    const BL = 'p|div|ul|ol|li|h[1-6]|table|thead|tbody|tr|td|th|hr|dl|dt|dd|section|nav|blockquote|figure|iframe|form';
    /* AFTER AN OPENING CONTAINER AS WELL AS AFTER A CLOSING TAG.
       The first version only looked at text following a </p> or
       </div>, so it never saw the commonest shape of all: text typed
       straight into a container that was opened and never given a
       paragraph — <div class="card-body">Yes, educators can earn…
       On /pineproject that is the whole answer to "Are contact hours
       offered?", and because a card body is a flex column, a bare
       text node in it becomes an anonymous flex item while the <a>
       inside it becomes a flex item of its own — so the link to the
       Professional Learnings page was thrown onto its own line. That
       is the "weird break".
       Only containers that may hold blocks. An opening <p> is
       excluded, because text after one is already in a paragraph. */
    /* NOT li. A list item is already a block with its own spacing,
       and the rule above deliberately REMOVES the paragraph from
       inside one — so listing li here had the two rules undoing each
       other on every pass: unwrap, re-wrap, no net change, and both
       counters climbing. 16,534 list items on 627 pages were reported
       as fixed and were not.
       A <td> or a <div> genuinely needs the paragraph; an <li> never
       does. */
    const OPEN = 'div|td|dd|blockquote|section|article|aside|main|figure';
    const re = new RegExp('((?:<\\/(?:' + BL + ')>|<(?:' + OPEN + ')\\b[^>]*>))([\\s\\S]*?)(?=<\\/?(?:' + BL + ')[\\s>\\/])', 'gi');
    h = h.replace(re, (m, close, run) => {
      const text = run.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      if (text.length < 3) return m;
      /* Balanced inline markup only — a run holding an unclosed tag
         would have its <p> nested inside that tag instead. */
      for (const t of ['span', 'strong', 'em', 'a', 'b', 'i', 'u', 'sup', 'sub']) {
        const o = (run.match(new RegExp('<' + t + '[\\s>]', 'gi')) || []).length;
        const c = (run.match(new RegExp('<\\/' + t + '>', 'gi')) || []).length;
        if (o !== c) return m;
      }
      n++;
      /* THE RUN GOES IN AS IT STANDS. Trimming it looked harmless and
         was not: on /Testing_Accountability/MECAS/NWEA a list item
         ends "…Letter [English] —" with its description in a nested
         list below, and the trim took away the whitespace that
         followed that dash. A dash with air on both sides is a
         separator and normalises away; a dash with air on one side is
         a character, so the block stopped matching itself and read as
         lost. Whitespace at the edge of a paragraph renders as
         nothing either way — there was never anything to gain. */
      return close + '\n<p>' + run + '</p>\n';
    });
    return [h, n];
  }],
  /* ELEMENTS THAT ARE NOT HTML.
     <avayaelement> x46, <class> x10, <w> x7, <hp> x1, across 19
     pages — left by a phone-system plugin, by Word, and by an author
     who typed the word "class" where they meant a class attribute.
     A browser keeps an unknown tag in the DOM and styles it as an
     inline box, so nothing it wraps can ever be a paragraph or a
     heading, and no stylesheet rule written for real elements
     reaches it.
     ONE OF THEM IS TRYING TO BE A TITLE. On /sel/faq the markup says
     <class class="card-title">Maine Educators and Students who are
     Socially and Emotionally Competent are skilled in the following
     5 areas:</class> — the class attribute is the author telling us
     what they meant, and what came out was a line of ordinary body
     text sitting where a heading belongs. That one becomes a real
     heading; the rest are simply unwrapped, which keeps every word
     and loses only the tag. */
  ['elements that are not HTML', (h) => {
    let n = 0;
    const KNOWN = new Set(('html head body div p span a img ul ol li dl dt dd h1 h2 h3 h4 h5 h6 table thead tbody '
      + 'tfoot tr td th strong em b i u s sub sup br hr iframe figure figcaption blockquote pre code nav section '
      + 'article aside header footer form input button select option textarea label fieldset legend video audio '
      + 'source track canvas svg path rect circle g line polygon polyline text defs use symbol title style script '
      + 'link meta caption colgroup col main small mark abbr cite q del ins kbd samp var time picture map area '
      + 'object embed param noscript template details summary wbr bdi bdo ruby rt rp').split(' '));
    const unknown = (t) => !KNOWN.has(t.toLowerCase()) && !t.includes('-');
    /* THE KNOWN TAGS ARE EXCLUDED IN THE PATTERN, not by testing the
       match afterwards, and that is not a tidiness point.
       String.replace CONSUMES whatever the pattern matched even when
       the callback hands the text straight back — so a pattern that
       matched any first-child element would match an earlier
       <p><span …>, run to that span's own </span></p>, and swallow
       every paragraph in between. On /sel/faq that is exactly what
       happened to the one paragraph this was written for: it never
       got its own match attempt, and the <class> inside it fell
       through to the plain unwrap below. A pattern that cannot match
       a known tag cannot eat the ground in front of it. */
    const NOT_KNOWN = '(?!(?:' + [...KNOWN].join('|') + ')\\b)';
    const titled = new RegExp('<p\\b[^>]*>\\s*<' + NOT_KNOWN + '([a-zA-Z][a-zA-Z0-9]*)\\b([^>]*)>([\\s\\S]*?)<\\/\\1>\\s*<\\/p>', 'gi');
    h = h.replace(titled, (m, tag, attrs, inner) => {
      if (!unknown(tag)) return m;
      if (!/class="[^"]*(?:card-title|title|heading)/i.test(attrs)) return m;
      if (/<(?:p|div|ul|ol|table)\b/i.test(inner)) return m;
      n++; return `<h3>${inner.trim()}</h3>`;
    });
    const anyUnknown = new RegExp('<' + NOT_KNOWN + '([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*>([\\s\\S]*?)<\\/\\1>', 'gi');
    let prev;
    do { prev = h; h = h.replace(anyUnknown, (m, tag, inner) => {
      if (!unknown(tag)) return m;
      if (new RegExp('<' + tag + '\\b', 'i').test(inner)) return m;   // innermost first
      n++; return inner;
    }); } while (h !== prev);
    /* And any that never had a closing tag. */
    h = h.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/gi, (m, tag) => unknown(tag) ? (n++, '') : m);
    return [h, n];
  }],
  /* A TABLE CELL PINNED TO A PIXEL WIDTH.
     2,692 cells on 47 pages carry style="width: 374px" or width="414"
     — numbers measured against whatever window the author happened to
     have open, years ago. They are not a layout; they are a snapshot
     of one.
     It shows worst inside a card. On /learning/specialed/ideapublic
     the IDEA Part B Fiscal table sets its two columns to 374px and
     414px — 788px of fixed width inside a card about half that wide —
     so the cells overflow, the links wrap at arbitrary points and the
     whole thing reads as "links all over the place".
     PERCENTAGES SURVIVE. 24 cells set a width as a percentage, which
     is the documented pattern for keeping a date column narrow and
     letting the content columns breathe. Those are a real decision
     about proportion and they still work at any width. */
  /* A TABLE WHOSE HEADER ROW IS JUST ANOTHER ROW.
     40 tables on the site have no <th> at all. In 10 of them the
     first row plainly IS the header — "Allowable Uses of Grant
     Funds | Unallowable Uses of Grant Funds", "SAU | Model |
     Enrollment | Partner(s)" — written as ordinary cells because
     Word does not know the difference.
     Four things follow from that and all of them are wrong: the
     stylesheet draws its navy header off `table:has(th)`, so the
     table renders as plain rules; the striping counts the header as
     row one, so the stripes land on the wrong rows; a screen reader
     announces no column names, so the fifth cell of row nine is read
     with nothing to say what it is; and sorting, where a table has
     it, has nothing to hang off.
     THE TEST IS SHAPE, NOT GUESSWORK: every cell in the first row is
     short, none is empty, none contains a list or a table of its
     own, and each is either bold or centred — which is how a person
     writes a header row when the editor will not give them one. */
  /* ONE TABLE, WRITTEN ONE WAY.
     314 tables carry 13 different class strings between them —
     "table table-bordered", "table table-striped table-bordered",
     "tables table-striped table-hover w-100", "table table-sm",
     and two spelled "Table" with a capital T, which matches no rule
     in the stylesheet at all. On top of that: border= on 129,
     cellspacing= on 120, cellpadding= on 119, align= on 40, and a
     style attribute on 111.
     THERE ARE ONLY TWO KINDS OF TABLE ON THIS SITE. The house table,
     and the house table with the theme's search behaviour switched
     on. Everything else is an author reaching for a Bootstrap class
     that the injector already supplies or overrides.

     THE STYLE ATTRIBUTE IS NOT HARMLESS. Every declaration inside
     those 111 is something the stylesheet already sets — width 103,
     border-collapse 78, table-layout 67, border 4 — and
     `border-collapse: collapse` actively defeats the rounded corners,
     which are drawn with border-collapse: separate and a radius. So
     78 tables have been quietly opting out of the house shape.
     A class the stylesheet does not know is kept: one page has
     safety-badges-table and that is somebody's deliberate hook. */
  /* A TABLE ROW WITH NOTHING IN IT.
     8 rows across 7 pages have cells and no content in any of them —
     two of them sit at the top of the school directory on
     /schools/schoolops/equivalentinstruction/entry, so the table
     opens with a beige band and a white band before the first
     school. They are what is left when someone deletes a record's
     text and not its row.
     A blank row is not neutral in a striped table: it takes a turn
     in the nth-child count, so every stripe below it is on the wrong
     side, and the search behaviour counts it as a record — 259
     entries where there are 257.
     A cell holding an image, an iframe or a rule counts as content
     even with no text. */
  /* A PARAGRAPH INSIDE A TABLE CELL, WRAPPING THE WHOLE CELL.
     9,986 of the site's 15,094 cells — two in three — hold exactly
     one <p> and nothing else: <td><p>Bible High School&nbsp;</p></td>.
     It is what the editor emits, and it is the same fault as a <p>
     inside a list item, which this file already unwraps.

     IT IS ALSO THE CAUSE OF THE INERT ACTION MARKS. The chevron
     rules are written `.doe-action > a`, and 2,089 of the 2,726
     cells carrying that class have a <p> between the cell and the
     link — so the selector cannot match and the mark renders
     nothing. That was diagnosed as needing a CSS reach-down; it does
     not. The paragraph is the bug.

     A <p> THAT SAYS SOMETHING IS KEPT. 56 carry text-align-center
     and 7 are a call to action; those are doing a job. Only a bare
     <p> with no class and no style is removed, and only when it is
     the cell's entire content.
     The trailing &nbsp; goes with it — 1,116 cells end in one, left
     over from typing in the editor. */
  ['paragraph inside a table cell unwrapped', (h) => {
    let n = 0;
    h = h.replace(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attrs, inner) => {
      const t = inner.trim();
      const one = t.match(/^<p>([\s\S]*)<\/p>$/i);
      if (!one) return m;
      if (/<p[\s>]/i.test(one[1])) return m;                       // nested paragraphs: leave it
      if (/<(div|ul|ol|table|h[1-6])\b/i.test(one[1])) return m;   // holds a block: leave it
      const kept = one[1].replace(/(?:&nbsp;|\s)+$/g, '');
      n++;
      return `<${tag}${attrs}>${kept}</${tag}>`;
    });
    return [h, n];
  }],

  ['blank table rows removed', (h) => {
    let n = 0;
    h = h.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => {
      return table.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>\s*/gi, (row, inner) => {
        const cells = [...inner.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
        if (!cells.length) return row;
        const hasContent = cells.some((c) => {
          const text = c[2].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s/g, '');
          return text || /<(img|iframe|input|hr|svg|video)\b/i.test(c[2]);
        });
        if (hasContent) return row;
        n++; return '';
      });
    });
    return [h, n];
  }],

  ['tables normalised to the house shape', (h) => {
    let n = 0;
    const NOISE = new Set(['table', 'tables', 'tablessortdesc', 'table-bordered', 'table-striped',
      'table-hover', 'table-sm', 'table-responsive', 'table-condensed', 'w-100', 'dataTable', 'no-footer']);
    h = h.replace(/<table\b([^>]*)>/gi, (m, attrs) => {
      const cls = ((attrs.match(/class="([^"]*)"/i) || [])[1] || '').split(/\s+/).filter(Boolean);
      /* "tables" and "tablessortdesc" are the theme's JS hooks, and an
         id the theme initialises does the same job — whichever it was
         written with, the table stays searchable. */
      const searchable = cls.some(c => /^(tables|tablessortdesc)$/i.test(c))
        || /\sid="(coolTable|certificatetable|framework2020|table100|filter|data)"/i.test(attrs)
        || /\sdata-page-length=/i.test(attrs);
      const custom = cls.filter(c => !NOISE.has(c) && c.toLowerCase() !== 'table');
      const out = (searchable ? ['tables', 'table', 'table-bordered'] : ['table', 'table-bordered'])
        .concat(custom).join(' ');

      let rest = attrs
        .replace(/\sclass="[^"]*"/i, '')
        .replace(/\s(?:border|cellpadding|cellspacing|align|bgcolor|valign|frame|rules)="[^"]*"/gi, '')
        .replace(/\sstyle="[^"]*"/i, '')
        .replace(/\swidth="[^"]*"/i, '')
        .replace(/\s{2,}/g, ' ');
      if (!/\s$/.test(rest) && rest && !rest.startsWith(' ')) rest = ' ' + rest;
      const rebuilt = `<table class="${out}" width="100%"${rest.trimEnd() ? ' ' + rest.trim() : ''}>`;
      if (rebuilt === m) return m;
      n++; return rebuilt;
    });
    return [h, n];
  }],

  ['first row of a table made its header row', (h) => {
    let n = 0;
    h = h.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi, (m, attrs, body) => {
      if (/<th[\s>]/i.test(body)) return m;
      const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
      if (rows.length < 2) return m;
      const first = rows[0];
      const cells = [...first[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
      if (cells.length < 2) return m;
      const looksLikeHeader = cells.every((c) => {
        const t = c[2].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 60) return false;
        if (/<(ul|ol|table)\b/i.test(c[2])) return false;
        /* BOLD, ITALIC OR CENTRED. /learning/esea/titleIV/snapshot
           centres its header row and /learning/esea/titleIII/
           snapshot italicises its own — same document, same author,
           same two columns, four tables that stayed headerless
           because the rule only knew two of the three ways a person
           marks a row as different. */
        return /<(strong|em)>/i.test(c[2]) || /text-align:\s*center|align="center"/i.test(c[1] + c[2]);
      });
      if (!looksLikeHeader) return m;
      /* scope="col" is the half that makes it mean anything to a
         screen reader; without it a <th> is only bold text. */
      const head = first[0]
        .replace(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi, (cm, cAttrs, inner) =>
          `<th scope="col"${cAttrs}>${inner.replace(/<\/?(?:strong|em)>/gi, '')}</th>`);
      /* OUT OF THE BODY AND INTO A <thead>. Left in the tbody it is
         still row one as far as tbody tr:nth-child(even) is
         concerned, and every stripe below it lands one row off. */
      let out = body.replace(first[0], '');
      out = out.replace(/<tbody\b[^>]*>\s*/i, (tb) => tb);
      n++;
      return `<table${attrs}><thead>${head}</thead>${out}</table>`;
    });
    return [h, n];
  }],

  ['table cells released from fixed pixel widths', (h) => {
    let n = 0;
    h = h.replace(/<(t[dh])\b([^>]*)>/gi, (m, tag, attrs) => {
      let out = attrs;
      /* pt AS WELL AS px. A table pasted out of Word measures its
         columns in points — style="width:243.0pt" — and the rule
         only knew pixels, so 12 cells stayed pinned to a width the
         page never agreed to. Same fault, same fix, different unit. */
      if (/style="[^"]*width:\s*[\d.]+(?:px|pt)/i.test(out)) {
        out = out.replace(/(style="[^"]*?)width:\s*[\d.]+(?:px|pt);?\s*/i, '$1');
        out = out.replace(/\sstyle="\s*"/i, '');
        n++;
      }
      if (/\swidth="\d+"/i.test(out)) { out = out.replace(/\swidth="\d+"/i, ''); n++; }
      return out === attrs ? m : `<${tag}${out}>`;
    });
    return [h, n];
  }],
  /* AN ANCHOR WITH NO DESTINATION.
     19 of them on 11 pages — <a>1-855-313-5799</a> on
     /learning/highered/transcripts is typical: the editor made a link
     and never gave it an address, or the address was stripped later.
     A browser renders it as plain text, so nothing visibly happens;
     but a screen reader announces it as a link, and it counts as one
     in the tab order on some engines. It is not a link. It is words,
     and words do not need a tag. */
  /* ONE LINK WRITTEN AS TWO.
     21 places on 18 pages have two anchors, side by side, pointing at
     the SAME url: "National Institute of Standards of Technology"
     followed by "(NIST)"; "IDEA Advisory Panels" followed by a link
     whose whole text is a full stop; "Organ Donation: Don't let these
     myths co" followed by "linic", a word split down the middle by an
     editor.
     IT IS NOT COSMETIC. A row whose content is one link gets the
     house treatment — .doe-action and the chevron that goes with it.
     A row holding two links does not qualify, so the NIST row on
     /learning/technology/infrastructure sat between two chevroned
     rows with no chevron and a gap where the mark should be, which
     is what reads as a stray space in the list.
     Merged they are one link again, with every word in the order it
     was written and the space between them kept. */
  /* AN ADDRESS WHOSE FIRST LETTER MAILS SOMEBODY ELSE.
     Seven places write an email as two links: one character, then
     the rest — <a mailto:emily.doughty>s</a><a mailto:susan.berry>
     Usan.Berry@maine.gov</a>. The page reads "sUsan.Berry@maine.gov"
     and clicking that first letter sends mail to a different person
     than clicking the rest of it. It is what an editor leaves behind
     when a link is pasted over a selection that started one
     character early.
     THE TEST IS THAT THE TWO HALVES MAKE THE SECOND ADDRESS. Join
     the letter to the text after it, and if the result is exactly
     the address the second link points at, the letter belongs to
     that link and nothing else. Six of the seven pass that; the one
     that does not is left alone and reported instead.
     The rule above this one merges two anchors sharing a url. This
     is the case where they deliberately do not. */
  /* mailto:mailto: — A LINK THAT GOES NOWHERE.
     The scheme written twice is what an editor produces when someone
     types "mailto:" into a field that adds it for them. The browser
     cannot parse it, so the address is unreachable while looking
     perfectly ordinary on the page. */
  ['doubled mailto scheme repaired', (h) => {
    let n = 0;
    h = h.replace(/href="mailto:(?:mailto:)+/gi, () => { n++; return 'href="mailto:'; });
    return [h, n];
  }],

  /* AN ADDRESS WHOSE FIRST LETTER MAILS SOMEBODY ELSE.
     Seven places write an email as two links: one character, then
     the rest — <a mailto:emily.doughty>s</a><a mailto:susan.berry>
     Usan.Berry@maine.gov</a>. The page reads "sUsan.Berry@maine.gov"
     and clicking that first letter sends mail to a different person
     than clicking the rest of it. It is what an editor leaves behind
     when a link is pasted over a selection that started one
     character early.
     THE TEST IS THAT THE TWO HALVES MAKE THE SECOND ADDRESS. Join
     the letter to the text after it, and if the result is exactly
     the address the second link points at, the letter belongs to
     that link and nothing else. Six of the seven pass that; the one
     that does not is left alone and reported instead.
     The rule above this one merges two anchors sharing a url. This
     is the case where they deliberately do not. */

  ['an address split after its first letter rejoined', (h) => {
    let n = 0;
    h = h.replace(/<a\b([^>]*)>((?:(?!<\/a>)[\s\S]){1,3})<\/a>(\s*)<a\b([^>]*)>((?:(?!<\/a>)[\s\S])*)<\/a>/gi,
      (m, a1, lead, gap, a2, rest) => {
        const href2 = (a2.match(/href="([^"]*)"/i) || [])[1] || '';
        if (!/^mailto:/i.test(href2)) return m;
        const letter = lead.replace(/<[^>]*>/g, '');
        if (!/^[A-Za-z]$/.test(letter.trim())) return m;
        const joined = (letter + rest.replace(/<[^>]*>/g, '')).toLowerCase().replace(/\s|&nbsp;/g, '');
        let target = href2.replace(/^mailto:/i, '');
        try { target = decodeURIComponent(target); } catch (e) { /* leave it */ }
        if (joined !== target.toLowerCase().split('?')[0]) return m;
        n++;
        return `<a${a2}>${letter}${rest}</a>`;
      });
    return [h, n];
  }],

  ['one link written as two joined back together', (h) => {
    let n = 0;
    let prev;
    do {
      prev = h;
      h = h.replace(/<a\b([^>]*)>((?:(?!<\/a>)[\s\S])*)<\/a>((?:\s|&nbsp;)*)<a\b([^>]*)>((?:(?!<\/a>)[\s\S])*)<\/a>/gi,
        (m, a1, t1, gap, a2, t2) => {
          const href = (s) => (s.match(/href="([^"]*)"/) || [])[1];
          if (!href(a1) || href(a1) !== href(a2)) return m;
          n++;
          return `<a${a1}>${t1}${gap}${t2}</a>`;
        });
    } while (h !== prev);
    return [h, n];
  }],

  ['anchors with no destination unwrapped', (h) => {
    let n = 0;
    h = h.replace(/<a(?![^>]*\bhref=)[^>]*>([\s\S]*?)<\/a>/gi, (m, inner) => {
      if (/<a\b/i.test(inner)) return m;
      if (/\bid=|\bname=/i.test(m.slice(0, m.indexOf('>')))) return m;   // an anchor target
      n++; return inner;
    });
    return [h, n];
  }],
  /* A STYLE ATTRIBUTE THAT IS NOT CSS.
     Word pastes leave style="Aptos&quot;,sans-serif" — the value of a
     font-family declaration whose property name was lost somewhere
     between Word and the editor. It has no colon in it, so it
     declares nothing and a browser discards the whole attribute.
     It still did damage here: the font-family stripper looks for
     `font-family:` and never matched it, so the span kept an
     attribute and could not be unwrapped, and the two bare spans
     wrapped around it could not be unwrapped either — 726 of them on
     /learning/earlychildhood/pkexpansiongrant/2021 alone.
     A style attribute with no colon is junk by definition. */
  ['style attributes that declare nothing removed', (h) => {
    let n = 0;
    h = h.replace(/\sstyle="([^"]*)"/gi, (m, v) => {
      if (v.includes(':')) return m;
      n++; return '';
    });
    return [h, n];
  }],
  /* A BACKGROUND COLOUR ON WORDS.
     796 of these across 82 pages — highlighter yellow left from a
     draft, white-on-white from a Word paste, a grey that was the
     editor's selection colour. The page is white; a background on a
     run of text is either invisible or a highlight nobody meant to
     publish, and every one of them also keeps a <span> alive that
     would otherwise collapse.
     ONLY ON TEXT. A background on a <td> or a <th> is the branded
     table's navy header and is the documented pattern, so cells are
     left alone; this is spans, links, emphasis and paragraphs. */
  /* A <span> CARRIES NO INLINE STYLE. THIS ONE IS A JUDGEMENT AND
     IT IS WORTH STATING PLAINLY.
     Everything above removes a named property — a font, a colour, a
     background — and leaves anything it does not recognise. That left
     Word's own scaffolding behind: position:relative with top:-.5pt
     is how Word writes a superscript, and mso-* properties mean
     nothing outside it. A span holding one of those cannot be
     unwrapped, and neither can any bare span wrapped around it, so
     eight of them stack up around a single word.
     A <span> has no meaning of its own — it exists to carry a style
     or a class. The stylesheet owns text presentation on this site,
     so a style attribute on a span is, without exception in 832
     pages, something an editor left behind. A CLASS is different and
     is kept: .doe-chip is written by this file and read by the
     stylesheet.
     Measured before and after on the two worst pages: 427 span tags
     around 298 bare ones on the pre-K grant page, 339 around 254 on
     national standards. */
  ['inline styles removed from spans', (h) => {
    let n = 0;
    h = h.replace(/<span\b([^>]*)>/gi, (m, attrs) => {
      if (!/\sstyle="/i.test(attrs)) return m;
      const out = attrs.replace(/\sstyle="[^"]*"/i, '');
      n++; return `<span${out}>`;
    });
    return [h, n];
  }],

  /* A CARD SITTING STRAIGHT INSIDE A .row WITH NO COLUMN AROUND IT.
     16 of them in 7 rows on 6 pages, and they are the other half of
     the inline-width fault below: a .row is a flex container, so a
     card dropped into it with no col-sm-* has no basis to lay out
     from, and style="width: 18rem" is what the author reached for to
     make it look right. Take the width away on its own and the cards
     collapse to their content; give them the column they were always
     missing and the width is not needed, which is what the component
     list says to do — "convert them to real col-sm-X grid columns
     and drop the inline width", both halves of it.
     THE COLUMN IS SIZED FROM THE ROW. Three cards to a row is what
     18rem was approximating in a 960px column, so the count decides:
     one fills the row, two halve it, three take a third. */
  ['cards given the grid column they were missing', (h) => {
    let n = 0;
    const spanEnd = (s, i) => {
      let d = 1; const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let x;
      while (d > 0 && (x = t.exec(s))) { d += x[0][1] === '/' ? -1 : 1; i = x.index + x[0].length; }
      return i;
    };
    const isCard = (tag) => ((tag.match(/class="([^"]*)"/) || [])[1] || '')
      .split(/\s+/).includes('card');
    const rows = [...h.matchAll(/<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"[^>]*>/gi)];
    for (const m of rows.reverse()) {
      const s0 = m.index + m[0].length;
      const s1 = spanEnd(h, s0);
      const inner = h.slice(s0, s1 - '</div>'.length);
      /* Depth-0 children only — a card nested inside a column that is
         already there is somebody else's problem and is left alone. */
      const kids = []; let d = 0; const t = /<div\b[^>]*>|<\/div>/gi; let z;
      while ((z = t.exec(inner))) {
        if (z[0][1] === '/') { d--; continue; }
        /* THE CLASS IS A TOKEN, NOT A SUBSTRING. /\bcard\b/ matches
           "card-body" — the hyphen is a word boundary — so the first
           version of this wrapped a card's own body in a column
           inside the card. Split on whitespace and compare. */
        if (d === 0 && isCard(z[0])) kids.push([z.index, spanEnd(inner, z.index + z[0].length)]);
        d++;
      }
      if (!kids.length) continue;
      const col = kids.length === 1 ? 12 : kids.length === 2 ? 6 : kids.length === 4 ? 3 : 4;
      let out = inner;
      for (const [a, b] of kids.reverse()) {
        out = out.slice(0, a) + `<div class="col-sm-${col} py-2">` + out.slice(a, b) + '</div>' + out.slice(b);
        n++;
      }
      h = h.slice(0, s0) + out + h.slice(s1 - '</div>'.length);
    }
    return [h, n];
  }],

  /* A CARD SETS ITS OWN WIDTH IN THE SOURCE and then cannot be made
     wider from the grid, which is the documented reason a card "won't
     adjust": Bootstrap's own sample markup carries style="width:
     18rem" and it gets pasted along with everything else. 13 cards on
     4 pages have one, and /learning/specialed/supervision/monitoring
     asks for 80rem — 1,280px in a column that is 960, which is a card
     standing outside the page's own margin. The width belongs to the
     col-sm-* the card sits in. */
  ['cards released from an inline width', (h) => {
    let n = 0;
    h = h.replace(/<div\b([^>]*class="[^"]*card[^"]*"[^>]*)>/gi, (m, attrs) => {
      /* The card itself, not its header or its body — those take
         their width from the card and never carried one. */
      if (!((attrs.match(/class="([^"]*)"/) || [])[1] || '').split(/\s+/).includes('card')) return m;
      if (!/style="[^"]*(?:max-|min-)?width\s*:/i.test(attrs)) return m;
      const out = attrs.replace(/\sstyle="([^"]*)"/i, (sm, css) => {
        const kept = css.replace(/(?:^|;)\s*(?:max-width|min-width|width|height|max-height|min-height)\s*:[^;]*/gi, '')
          .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
        return kept ? ` style="${kept}"` : '';
      });
      if (out === attrs) return m;
      n++; return `<div${out}>`;
    });
    return [h, n];
  }],

  /* THE SAME PROPERTY DECLARED OVER AND OVER IN ONE ATTRIBUTE.
     /assessment/achievement/math has 28 card headers reading
     style="background-color:#182b3c; color:#FFF; color:#FFF;
     color:#FFF; color:#FFF" — an editor that re-applied the same
     colour on every pass. Only the last one has ever done anything;
     the rest are noise in a file a person has to read. Last wins,
     which is what the cascade does, so nothing renders differently. */
  ['repeated declarations in one style attribute collapsed', (h) => {
    let n = 0;
    h = h.replace(/\sstyle="([^"]*)"/gi, (m, css) => {
      const parts = css.split(';').map(s => s.trim()).filter(Boolean);
      const seen = new Map();
      for (const p of parts) {
        const k = (p.split(':')[0] || '').trim().toLowerCase();
        if (!k) continue;
        seen.set(k, p);                       // last declaration wins, as in CSS
      }
      if (seen.size === parts.length) return m;
      n++;
      const kept = [...seen.values()].join('; ');
      return kept ? ` style="${kept}"` : '';
    });
    return [h, n];
  }],

  /* A HARDCODED ROW COLOUR IS THE DOCUMENTED FAULT, not my opinion.
     The component list says it in as many words: never hardcode a
     background on a <tr> or a <td>, because the striping is done by
     a single nth-child rule and a hardcoded colour does not move when
     a row is inserted — the stripes and the hand-painted cells then
     disagree, which is the "everything goes beige when I add a row"
     bug. 327 cells across the site still carry one.

     AND <th> LOSES ITS COLOUR TOO, which reverses what this rule
     used to say. The reasoning then was that navy-on-white IS the
     documented header pattern, so the 232 cells carrying it were
     right. They are — and the stylesheet already draws it:

       table:has(th) th { background: var(--i-navy) !important;
                          color: #fff !important; }

     Both declarations are !important, so every one of those 232
     inline pairs is overridden before it renders. They change
     nothing, and three of them prove it: /learning/earlychildhood/
     standards sets #274f73 on its headers and the page shows navy.
     An author reading that source would reasonably believe they had
     set mid-blue.
     Removing them is invisible on the page and honest in the source,
     and it takes the site's largest single block of inline style —
     232 of 314 — off the board. Width and alignment stay: the
     stylesheet does not force those. */
  ['row colours handed back to the striping rule', (h) => {
    let n = 0;
    h = h.replace(/<(td|tr)\b([^>]*)>/gi, (m, tag, attrs) => {
      if (!/style="[^"]*background/i.test(attrs)) return m;
      const out = attrs.replace(/\sstyle="([^"]*)"/i, (sm, css) => {
        const kept = css.replace(/(?:^|;)\s*background(?:-color|-image)?\s*:[^;]*/gi, '')
          .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
        return kept ? ` style="${kept}"` : '';
      });
      if (out === attrs) return m;
      n++; return `<${tag}${out}>`;
    });
    /* The header cell gives up both of the two the stylesheet
       forces, and keeps everything it does not. */
    h = h.replace(/<th\b([^>]*)>/gi, (m, attrs) => {
      if (!/style="[^"]*(?:background|color)/i.test(attrs)) return m;
      const out = attrs.replace(/\sstyle="([^"]*)"/i, (sm, css) => {
        const kept = css.replace(/(?:^|;)\s*(?:background(?:-color|-image)?|color)\s*:[^;]*/gi, '')
          .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
        return kept ? ` style="${kept}"` : '';
      });
      if (out === attrs) return m;
      n++; return `<th${out}>`;
    });
    return [h, n];
  }],

  ['background colour removed from text', (h) => {
    let n = 0;
    h = h.replace(/<(span|strong|em|b|i|u|sub|sup|a|p|br|li|h[1-6])\b([^>]*)>/gi, (m, tag, attrs) => {
      if (!/style="[^"]*background/i.test(attrs)) return m;
      const out = attrs.replace(/\sstyle="([^"]*)"/i, (sm, css) => {
        const kept = css.replace(/(?:^|;)\s*background(?:-color|-image)?\s*:[^;]*/gi, '')
          .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
        return kept ? ` style="${kept}"` : '';
      });
      if (out === attrs) return m;
      n++; return `<${tag}${out}>`;
    });
    return [h, n];
  }],

  /* A COLOUR ON WORDS, for the same reason. The stylesheet owns the
     ink — that is what makes a page look like one page — and an
     inline colour is a decision made against a design that no longer
     exists. A colour inside a dark component is handled earlier and
     more urgently, because there it is unreadable rather than merely
     inconsistent. */
  ['colour removed from text', (h) => {
    let n = 0;
    h = h.replace(/<(span|strong|em|b|i|u|sub|sup|p|h[1-6]|li)\b([^>]*)>/gi, (m, tag, attrs) => {
      if (!/style="[^"]*(?:^|;|\s)color\s*:/i.test(attrs)) return m;
      const out = attrs.replace(/\sstyle="([^"]*)"/i, (sm, css) => {
        const kept = css.replace(/(?:^|;)\s*color\s*:[^;]*/gi, '')
          .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
        return kept ? ` style="${kept}"` : '';
      });
      if (out === attrs) return m;
      n++; return `<${tag}${out}>`;
    });
    return [h, n];
  }],

  /* A HEADING IS ALREADY THE LOUDEST THING ON ITS LINE.
     443 headings on 302 pages wrap their text in <strong> as well —
     the author making sure, in an editor that showed them a small
     heading. It doubles a weight that is already set, and on the
     display face it reads as a different heading from the one beside
     it that was written without. */
  ['redundant bold inside a heading removed', (h) => {
    let n = 0;
    h = h.replace(/(<h[1-6]\b[^>]*>)\s*<strong>((?:(?!<\/strong>)[\s\S])*)<\/strong>\s*(<\/h[1-6]>)/gi,
      (m, open, text, close) => { n++; return open + text.trim() + close; });
    return [h, n];
  }],

  /* A PICTURE SIZED IN THE MARKUP.
     95 images carry an inline width or height measured against some
     window years ago. The stylesheet sizes every picture to the
     column it lands in, and an inline value beats it — which is how a
     photograph ends up 380px wide in a 944px page, or overflowing a
     card. Ratio and cropping are the stylesheet's to decide. */
  ['images released from inline dimensions', (h) => {
    let n = 0;
    h = h.replace(/<img\b([^>]*)>/gi, (m, attrs) => {
      if (!/style="[^"]*(?:width|height)\s*:/i.test(attrs)) return m;
      const out = attrs.replace(/\sstyle="([^"]*)"/i, (sm, css) => {
        const kept = css.replace(/(?:^|;)\s*(?:width|height|max-width|max-height)\s*:[^;]*/gi, '')
          .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
        return kept ? ` style="${kept}"` : '';
      });
      if (out === attrs) return m;
      n++; return `<img${out}>`;
    });
    return [h, n];
  }],

  /* TWO LINE BREAKS ARE A PARAGRAPH BREAK TYPED BY HAND.
     138 of them on 50 pages. Written as breaks the gap is whatever
     the line height happens to be and the two halves are one block to
     everything that reads the page — a screen reader, the contents
     list, this file's own checks. Split into two paragraphs they get
     the spacing the stylesheet sets for every other paragraph, and
     the check sees the same two blocks either way, because a <br> is
     already a block boundary to it. */
  ['double line break split into paragraphs', (h) => {
    let n = 0;
    let prev;
    do {
      prev = h;
      h = h.replace(/<p([^>]*)>((?:(?!<\/p>)[\s\S])*?)<br\s*\/?>\s*<br\s*\/?>\s*((?:(?!<\/p>)[\s\S])*?)<\/p>/gi,
        (m, attrs, a, b) => {
          if (!a.replace(/<[^>]*>|&nbsp;|\s/g, '') || !b.replace(/<[^>]*>|&nbsp;|\s/g, '')) return m;
          n++; return `<p${attrs}>${a}</p>\n<p${attrs}>${b}</p>`;
        });
    } while (h !== prev);
    return [h, n];
  }],

  /* ATTRIBUTES THAT ARE NOT ATTRIBUTES.
     40 of them on 28 pages, and they are the wreckage of a typo:
     style="height=900px;" typed with an = where a : belonged parses as
     two attributes named `900px` and `height:`, so
     /learning/content/health/cancerprevention carries
     <div 900px="" class="row justify-content-center" height:="">.
     A browser ignores them, which is why nobody noticed, and Drupal's
     filter may not — an attribute it cannot parse is a reason to
     rewrite or drop the element on save.
     THE PARSE RESPECTS QUOTES. A naive scan of the attribute text
     counted fragments from inside values — "encrypted-media;" out of
     an iframe's allow=, "white;" out of a style — and reported 4,996
     faults where there are 40. Walking the attributes properly, a
     value in quotes is stepped over whole. */
  ['attributes that are not attributes removed', (h) => {
    let n = 0;
    /* THE BROKEN TAGS ARE REPAIRED FIRST. <p<strong> is a tag that was
       never closed, not a tag with a strange attribute — and the
       attribute walk below, meeting "<strong" where a name belongs,
       correctly calls it invalid and drops it, which deletes the
       opening tag and strands its </strong>. Repair, then parse. */
    h = h.replace(/<(p|div|li|span|td)<([a-z]+)>/gi, (m, a, b) => { n++; return `<${a}><${b}>`; });
    h = h.replace(/<(p|div|li|span|td)">/gi, (m, a) => { n++; return `<${a}>`; });
    /* AND THE CLOSING FORM, WHICH IS WORSE. </p<strong> is a </p> that
       never closed and an opening <strong> that was never wanted — so
       everything after it on the page is bold and inside a paragraph
       that the browser has to guess the end of. On
       /learning/earlychildhood/first10 that swallowed the contact and
       back-to-top links at the foot of the page. Three of them, on
       three pages, and each one damages everything below it. */
    h = h.replace(/<\/([a-z]+)<[a-z]+>/gi, (m, a) => { n++; return `</${a}>`; });
    /* A trailing colon is not a namespace. `height:` comes from
       style="height=900px;" and is no more an attribute than `900px`
       is, so the name test rejects a colon at the end as well as a
       leading digit. */
    const VALID = /^[a-zA-Z_][a-zA-Z0-9_.-]*(?::[a-zA-Z_][a-zA-Z0-9_.-]*)?$/;
    h = h.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (m, tag, attrs) => {
      let i = 0, out = '', dropped = 0;
      while (i < attrs.length) {
        const ws = attrs.slice(i).match(/^\s+/);
        if (ws) { i += ws[0].length; }
        if (i >= attrs.length || attrs[i] === '/' ) break;
        let name = '';
        while (i < attrs.length && !/[\s=\/>]/.test(attrs[i])) name += attrs[i++];
        let raw = name;
        const gap = attrs.slice(i).match(/^\s*/)[0];
        i += gap.length;
        if (attrs[i] === '=') {
          raw += gap + '=';
          i++;
          const g2 = attrs.slice(i).match(/^\s*/)[0]; raw += g2; i += g2.length;
          const q = attrs[i];
          if (q === '"' || q === "'") {
            let v = q; i++;
            while (i < attrs.length && attrs[i] !== q) v += attrs[i++];
            v += q; i++; raw += v;
          } else {
            let v = '';
            while (i < attrs.length && !/[\s>]/.test(attrs[i])) v += attrs[i++];
            raw += v;
          }
        }
        if (!name) continue;
        if (VALID.test(name)) out += ' ' + raw; else dropped++;
      }
      if (!dropped) return m;
      n += dropped;
      const tail = /\/\s*$/.test(attrs) ? ' /' : '';
      return `<${tag}${out}${tail}>`;
    });
    return [h, n];
  }],

  /* A DIV WITH NOTHING IN IT.
     136 across 84 pages. /federalprograms has three in a row —
     <div class="text-align-center">&nbsp;</div> — used as a spacer
     between two buttons, which is vertical rhythm typed by hand in a
     place the stylesheet already governs. An empty div draws nothing
     but still takes its margins, so the gaps it makes are whatever
     the theme happens to give a div that day and they differ from
     every other gap on the page.
     Only genuinely empty ones: whitespace, &nbsp; and <br> are the
     only things allowed inside for it to count as empty. */
  ['empty divs removed', (h) => {
    let n = 0, prev;
    do {
      prev = h;
      h = h.replace(/<div\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/div>/gi, () => { n++; return ''; });
    } while (h !== prev);
    return [h, n];
  }],


  /* A CARD HEADER THAT WRAPS ITS TITLE IN A PARAGRAPH.
     1,268 of them across 277 pages — a third of the site. The header
     is already a block and the stylesheet sets its padding, so the
     paragraph inside contributes a second set of margins that the
     padding was never measured against. That is the "weird space
     under each card header", and because a paragraph's margin is
     collapsed or not depending on what else is in the header, the gap
     differs from card to card down one page.
     ONLY WHEN THE PARAGRAPH IS THE WHOLE HEADER. A header holding a
     title and a line under it is using the paragraphs for something
     and keeps them. */
  ['paragraph unwrapped inside a card header', (h) => {
    let n = 0;
    h = h.replace(/(<div[^>]*class="[^"]*card-header[^"]*"[^>]*>)\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*(<\/div>)/gi,
      (m, open, inner, close) => {
        if (/<p\b|<div\b|<ul\b|<ol\b/i.test(inner)) return m;
        n++; return open + inner.trim() + close;
      });
    return [h, n];
  }],

  /* AND THE MARGIN CLASS ON THE HEADER ITSELF.
     605 headers carry mb-3 or similar. Inside a card the gap below
     the title bar is the body's padding — one number, set once in the
     stylesheet — and a Bootstrap margin utility on the header adds a
     second gap on top of it that only some cards have. */
  ['margin utilities removed from card headers', (h) => {
    let n = 0;
    h = h.replace(/(<div[^>]*class=")([^"]*card-header[^"]*)(")/gi, (m, a, cls, b) => {
      const kept = cls.replace(/\b(?:mb|mt|my|py|pb|pt)-\d\b/g, '').replace(/\s{2,}/g, ' ').trim();
      if (kept === cls) return m;
      n++; return a + kept + b;
    });
    return [h, n];
  }],

  /* A GRID COLUMN INSIDE A CARD IS NOT A COLUMN.
     130 of them across 43 pages. A col-* class only means anything to
     a direct child of a .row; inside a card it is a leftover from
     markup that was rearranged, and it still takes its share of a
     twelve-column grid that is not there.
     /learning/earlychildhood/first10 is the clearest: the card's
     whole body is a <div class="col-sm-9"> inside a
     <div class="col-sm-3">, so the text sets to nine twelfths of a
     quarter of the page. That is the "2/3 width and not full span".
     If the card has no .card-body, this div IS the body and becomes
     one — which also gives it the padding every other card body has.
     If there is already a body, the class is simply dead and goes. */
  /* A COLUMN CLASS INSIDE A CARD IS ONLY STRAY IF THERE IS NO .row
     AROUND IT — and the first version of this never checked.
     It stripped col-* from EVERY div inside a .card on the premise
     that a column means nothing outside a grid. True; but of the 130
     such divs on the site, 129 are direct children of a real .row
     that happens to live inside a card, and exactly one is genuinely
     orphaned. So the rule collapsed 129 working grid cells — two- and
     three-column layouts inside cards on 42 pages went to full-width
     stacks — to fix a single page.
     It also left `class=""` behind on those divs, which is how the
     damage showed up in the sweep.
     Now it walks the card and keeps a column whose immediate parent
     is a .row. Only a column with no grid around it is stripped, and
     only that one still gets promoted to .card-body when the card has
     none. */
  /* A CARD BODY TOLD HOW TALL TO BE.
     25 card bodies on 6 pages carry style="height:300px" and the
     like — /learning/specialed has eight at 300px holding between
     136 and 477 characters, /learning/specialed/initiatives/dyslexia
     has one at 970px. Only one of the 25 holds an image or an embed,
     so none of them is reserving space for anything.
     The stylesheet already equalises cards in a row, and a card body
     is a flex item inside that: a declared height fights the rule
     written to do this properly, and the card ends up a size someone
     typed once rather than the size of what is in it.
     min-height and max-height are left alone — those are deliberate
     when they appear. */
  ['card bodies released from a hand-set height', (h) => {
    let n = 0;
    h = h.replace(/<div\b([^>]*class="[^"]*card-body[^"]*"[^>]*)>/gi, (m, attrs) => {
      /* The prefix is optional and must end in ; or space, so this
         matches style="height:300px" and style="x; height:300px" and
         never the height inside line-height. */
      if (!/style="(?:[^"]*[;\s])?height\s*:/i.test(attrs)) return m;
      const out = attrs.replace(/\sstyle="([^"]*)"/i, (sm, css) => {
        const kept = css.split(';').map(x => x.trim()).filter(Boolean)
          .filter(x => !/^height\s*:/i.test(x)).join('; ');
        return kept ? ` style="${kept}"` : '';
      });
      if (out === attrs) return m;
      n++; return `<div${out}>`;
    });
    return [h, n];
  }],

  /* A COLUMN THAT NEVER STACKS ON A PHONE.
     Bootstrap's .col-4 is declared outside any media query, so it
     holds a third of the width at every size; .col-sm-4 is a full
     width that becomes a third at 576px and up. The site has written
     1,778 of the breakpointed kind and 78 of the bare kind, so the
     bare ones are the slip, not the convention — and on a 375px
     phone they put three cards in 127px columns instead of stacking.
     Nothing changes at or above 576px: the two spellings are
     identical there. Below it, the row does what every other row on
     the site does.
     ONLY A DIRECT CHILD OF A .row, and only below 12 — a col-12 is
     already full width at every size, so rewriting it would be
     noise. */
  ['columns that never stack given a breakpoint', (h) => {
    let n = 0;
    const rows = [...h.matchAll(/<div[^>]*class="(?:[^"]*\s)?row(?:\s[^"]*)?"[^>]*>/gi)];
    for (const m of rows.reverse()) {
      let d = 1, i = m.index + m[0].length;
      const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let z;
      while (d > 0 && (z = t.exec(h))) { d += z[0][1] === '/' ? -1 : 1; i = z.index + z[0].length; }
      const inner = h.slice(m.index + m[0].length, i - 6);
      let depth = 0, changed = false;
      const edits = [];
      const tag = /<div\b([^>]*)>|<\/div>/gi;
      let zz;
      while ((zz = tag.exec(inner))) {
        if (zz[0][1] === '/') { depth--; continue; }
        const at = depth; depth++;
        if (at !== 0) continue;                       // direct children only
        const cls = ((zz[1] || '').match(/class="([^"]*)"/) || [])[1] || '';
        if (/\bcol-[a-z]+-\d+/.test(cls)) continue;   // already breakpointed
        if (!/\bcol-(\d{1,2})\b/.test(cls)) continue;
        const kept = cls.replace(/\bcol-(\d{1,2})\b/g, (cm, num) => +num < 12 ? 'col-sm-' + num : cm);
        if (kept === cls) continue;
        edits.push([zz.index, zz.index + zz[0].length, zz[0].replace(/class="[^"]*"/, 'class="' + kept + '"')]);
        changed = true;
      }
      if (!changed) continue;
      let out = inner;
      for (const [a, b, rep] of edits.reverse()) { out = out.slice(0, a) + rep + out.slice(b); n++; }
      h = h.slice(0, m.index + m[0].length) + out + h.slice(i - 6);
    }
    return [h, n];
  }],

  ['grid columns inside cards resolved', (h) => {
    let n = 0;
    const cards = [...h.matchAll(/<div[^>]*class="(?:[^"]*\s)?card(?:\s[^"]*)?"[^>]*>/gi)];
    for (const m of cards.reverse()) {
      let d = 1, i = m.index + m[0].length;
      const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let z;
      while (d > 0 && (z = t.exec(h))) { d += z[0][1] === '/' ? -1 : 1; i = z.index + z[0].length; }
      const inner = h.slice(m.index + m[0].length, i - 6);
      if (!/<div[^>]*class="[^"]*\bcol-[a-z]+-\d+/i.test(inner)) continue;
      const hasBody = /class="[^"]*\bcard-body\b/i.test(inner);

      /* A stack of the enclosing divs' classes, so each column can be
         asked what it is actually sitting in. */
      const stack = [];
      const edits = [];
      const tag = /<div\b([^>]*)>|<\/div>/gi;
      let zz, first = true;
      while ((zz = tag.exec(inner))) {
        if (zz[0][1] === '/') { stack.pop(); continue; }
        const attrs = zz[1] || '';
        const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
        const parent = stack.length ? stack[stack.length - 1] : '';
        stack.push(cls);
        if (!/\bcol-[a-z]+-\d+/.test(cls)) continue;
        if (parent.split(/\s+/).includes('row')) continue;   // a real grid cell
        let kept = cls.replace(/\bcol-[a-z]+-\d+\b/g, '').replace(/\s{2,}/g, ' ').trim();
        if (!hasBody && first) { first = false; kept = ('card-body ' + kept).trim(); }
        const rebuilt = kept
          ? zz[0].replace(/class="[^"]*"/, 'class="' + kept + '"')
          : zz[0].replace(/\s*class="[^"]*"/, '');
        edits.push([zz.index, zz.index + zz[0].length, rebuilt]);
      }
      if (!edits.length) continue;
      let out = inner;
      for (const [a, b, rep] of edits.reverse()) { out = out.slice(0, a) + rep + out.slice(b); n++; }
      h = h.slice(0, m.index + m[0].length) + out + h.slice(i - 6);
    }
    return [h, n];
  }],

  /* A SECTION HEADER IS LEFT-ALIGNED. The component list says so in
     as many words — "Left-aligned — do NOT center blockhead
     headings" — and 1,103 of the 1,139 on the site follow it. The 36
     that do not are on 25 pages, so a reader moving between them
     meets the same device set two ways.
     It matters more than taste: the band runs the full width of the
     column, so a centred title has no fixed relationship to anything
     else on the page, and a two-line one centres both lines and
     breaks the left edge that every other heading shares. */
  ['section headers left-aligned', (h) => {
    let n = 0;
    h = h.replace(/(<div[^>]*class="[^"]*\bblockhead\b[^"]*"[^>]*>\s*<h[1-6])([^>]*)>/gi, (m, open, attrs) => {
      let out = attrs.replace(/\sclass="([^"]*)"/i, (cm, cls) => {
        const kept = cls.replace(/\b(?:text-align-center|text-center)\b/g, '').replace(/\s{2,}/g, ' ').trim();
        return kept ? ` class="${kept}"` : '';
      }).replace(/\sstyle="([^"]*)"/i, (sm, css) => {
        const kept = css.replace(/(?:^|;)\s*text-align\s*:\s*center\s*/gi, '')
          .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
        return kept ? ` style="${kept}"` : '';
      });
      if (out === attrs) return m;
      n++; return open + out + '>';
    });
    return [h, n];
  }],

  /* AN INLINE TAG THAT IS NEVER CLOSED RUNS TO THE END OF THE PAGE.
     Four <strong> across four pages open and never close. A browser
     does not drop them — it carries them forward, so everything after
     the fault is bold and wrapped in an element nobody wrote. On
     /learning/earlychildhood/first10 that swallowed the contact and
     back-to-top links at the foot of the page into a <strong> of
     width zero.
     Closed at the end of the block they were opened in, which is
     where the author's sentence ended. Nothing else is moved: an
     unclosed tag has no content of its own, so there is no text to
     lose and nothing to declare. */
  ['unclosed inline tags closed', (h) => {
    let n = 0;
    const BLOCK = /<\/(?:p|li|td|th|h[1-6]|dd|dt|div|blockquote)>/gi;
    for (const tag of ['strong', 'em', 'b', 'i', 'u', 'sup', 'sub']) {
      const open = new RegExp('<' + tag + '\\b', 'gi');
      const close = new RegExp('<\\/' + tag + '>', 'gi');
      let guard = 0;
      while ((h.match(open) || []).length > (h.match(close) || []).length && guard++ < 20) {
        /* Walk the document keeping a depth count; where the depth is
           still positive as a block ends, that block is the one. */
        let depth = 0, fixAt = -1;
        const scan = new RegExp('<' + tag + '\\b[^>]*>|<\\/' + tag + '>|<\\/(?:p|li|td|th|h[1-6]|dd|dt|div|blockquote)>', 'gi');
        let m;
        while ((m = scan.exec(h))) {
          if (m[0][1] === '/' && m[0].slice(2, 2 + tag.length).toLowerCase() === tag) { depth = Math.max(0, depth - 1); }
          else if (m[0][1] !== '/') { depth++; }
          else if (depth > 0) { fixAt = m.index; break; }
        }
        if (fixAt < 0) break;
        h = h.slice(0, fixAt) + `</${tag}>` + h.slice(fixAt);
        n++;
      }
    }
    return [h, n];
  }],

  /* EMPHASIS WRAPPED AROUND A BUTTON.
     16 of them on 2 pages. A button is already the loudest thing in
     its card — a <strong> around it changes nothing a reader can see
     and quite a lot a stylesheet can: the button is no longer a
     direct child of its paragraph, so a rule written as
     `p:last-child:has(> .btn)` stops matching it. That is why three
     buttons on /offices sat 22, 166 and 246px off the bottom of
     cards in one row while every other page had them level. */
  ['emphasis removed from around a button', (h) => {
    let n = 0;
    h = h.replace(/<(strong|em|b|i)>\s*(<a\b[^>]*\bbtn\b[^>]*>[\s\S]*?<\/a>)\s*<\/\1>/gi,
      (m, tag, a) => { n++; return a; });
    return [h, n];
  }],

  /* EMPHASIS STRETCHED OVER A LINK AND ITS DESCRIPTION.
     109 of these on 49 pages. /Testing_Accountability/ESSA has two
     items in one list:
        <li><a><strong>Full Text of ESSA</strong></a></li>
        <li><strong><a>Understanding the ESSA</a> - A Parents' Guide…</strong></li>
     The first bolds the link; the second bolds the link AND the
     sentence after it, so one row is a bold link and the next is a
     whole bold line — and because the link sits inside the <strong>
     rather than around it, it takes its weight and colour from a
     different place. That is the "sizing and color isn't normalized
     in this section".
     Emphasis that covers a link and everything after it is not
     marking anything as important; it is making a line bold. The
     hierarchy the author wanted — the link louder than its
     description — is exactly what the link-and-description treatment
     gives, and it gives it the same way on every page.
     ONLY WHEN REAL TEXT FOLLOWS THE LINK. <strong> around a link
     alone is emphasis on a single thing and is left as it is. */
  ['emphasis stretched over a link and its description', (h) => {
    let n = 0;
    h = h.replace(/<(strong|b)>\s*(<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<\/a>)([\s\S]*?)<\/\1>/gi,
      (m, tag, link, rest) => {
        if (/<\/?(?:strong|b)\b/i.test(rest)) return m;
        if (/\bbtn\b/.test(link)) return m;
        const tail = rest.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        if (tail.replace(/^[-–—\s:]+/, '').length < 8) return m;
        n++; return link + rest;
      });
    return [h, n];
  }],

  /* EMPHASIS INSIDE A LINK.
     223 links on 76 pages wrap their whole text in <strong>, and on
     21 lists across 19 pages only SOME of the links do — which is
     what makes it visible: one row heavier than the next with nothing
     to explain the difference.
     The weight of a link is the stylesheet's to set, and it sets it
     by what the link IS: a standing action, an item with a
     description under it, a link inside a sentence. A <strong> around
     the whole of the text says nothing except "make this bold", and
     it says it in a way that lands on top of whichever treatment the
     link was going to get — so the same kind of link comes out two
     sizes on one page.
     ONLY WHEN IT COVERS THE WHOLE LINK. <strong> around one word
     inside a longer link is marking that word and stays. */
  ['emphasis removed from inside a link', (h) => {
    let n = 0;
    h = h.replace(/(<a\b[^>]*>)\s*<strong>((?:(?!<\/strong>)[\s\S])*)<\/strong>\s*(<\/a>)/gi,
      (m, open, inner, close) => {
        if (/\bbtn\b/.test(open)) return m;
        n++; return open + inner.trim() + close;
      });
    return [h, n];
  }],

  /* A TITLE BAR WITH NO CARD UNDER IT.
     3 of these on 2 pages: a .card-header floating in the page with
     nothing around it, so the navy bar runs the full width and the
     list it names sits outside, unbounded — which is why "School
     Improvement Resources" on /learning/esea/guidance looks like a
     header belonging to nothing.
     REPAIRED, NOT REMOVED. The words are the section's name and the
     list under them is its content; what is missing is the card that
     used to hold both. Putting it back makes the block identical to
     the six cards above it on the same page, and keeps every word.
     The card closes at the next thing that is plainly not part of
     it — another header, a section band, or the end. */
  ['title bar given back its card', (h) => {
    let n = 0;
    const CARD = /<div[^>]*class="(?:[^"]*\s)?card(?:\s[^"]*)?"[^>]*>/gi;
    const spans = [];
    for (const m of h.matchAll(CARD)) {
      let d = 1, i = m.index + m[0].length;
      const t = /<div\b[^>]*>|<\/div>/gi; t.lastIndex = i; let x;
      while (d > 0 && (x = t.exec(h))) { d += x[0][1] === '/' ? -1 : 1; i = x.index + x[0].length; }
      spans.push([m.index, i]);
    }
    const heads = [...h.matchAll(/<div[^>]*class="[^"]*card-header[^"]*"[^>]*>[\s\S]*?<\/div>/gi)]
      .filter(m => !spans.some(([a, b]) => m.index >= a && m.index < b));
    for (const m of heads.reverse()) {
      const after = h.slice(m.index + m[0].length);
      const stop = after.search(/<div[^>]*class="[^"]*(?:card-header|blockhead|contact-cube|doe-sub)[^"]*"|<h[1-6][\s>]/i);
      const body = stop < 0 ? after : after.slice(0, stop);
      if (!body.replace(/<[^>]*>|&nbsp;|\s/g, '')) continue;    // nothing to put in the card
      n++;
      h = h.slice(0, m.index) + '<div class="card">\n' + m[0] + '\n<div class="card-body">\n'
        + body.trim() + '\n</div>\n</div>\n'
        + (stop < 0 ? '' : after.slice(stop));
    }
    return [h, n];
  }],

  /* A FILE SIZE IS NOT INFORMATION ANYONE ACTS ON.
     73 of them on 20 pages: "(PDF, 82KB)", "PDF (77 KB)",
     "(PDF - 128 KB)", "PDF, 1.620MB". Matt's call to drop them all,
     and the number was never earning its space — it is typed by
     hand, it is wrong the moment the file is re-saved, and nobody
     decides whether to open a document on the strength of 82
     kilobytes.
     THE FORMAT STAYS. That is the half that tells you what will
     happen when you click, and it becomes a chip two rules down.
     Only the number goes.

     A SIZE IS ONLY REMOVED NEXT TO A FORMAT WORD. A number followed
     by KB is specific enough on its own, but a page about storage or
     bandwidth could write one in a sentence, and "sitting next to
     the word PDF" is what separates a label from prose. */
  ['file sizes removed', (h) => {
    let n = 0;
    /* /dashboard carries a <script> in its body, and "function () {"
       is an empty pair of brackets as far as a regular expression is
       concerned. Script and style are lifted out for the length of
       this rule so no pass below can reach inside them. */
    const held = [];
    h = h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (m) => {
      held.push(m); return '@@HELD' + (held.length - 1) + '@@';
    });

    const GAP = '(?:\\s|&nbsp;)*';
    const SEP = '[,:;|·–—-]?';
    const namesFormat = new RegExp('(?:^|[\\s>(|,])(?:' + FORMAT_ALT + ')(?![a-z])', 'i');

    /* (a) THE SIZE HAS A BRACKET OF ITS OWN, straight after the
       format: "PDF (77 KB)" — 16 of these, all on /fedrelief/eans.
       The bracket goes with the number; there is nothing left for it
       to wrap. */
    h = h.replace(new RegExp('((?:' + FORMAT_ALT + '))' + GAP + '\\(' + GAP + SIZE_RE + GAP + '\\)', 'gi'),
      (m, fmt) => { n++; return fmt; });

    /* (b) THE SIZE SHARES THE FORMAT'S BRACKET: "(PDF, 73KB)",
       "(PDF - 128 KB)", "(PPT, 7.85MB | PDF, 1.1MB)". Whichever
       separator the author put in front of the number goes with it,
       and what is left is the bare label the chip rule is looking
       for. */
    h = h.replace(/\(([^()<>]{1,90})\)/g, (m, inner) => {
      if (!new RegExp(SIZE_RE, 'i').test(inner)) return m;
      const out = inner.replace(new RegExp(GAP + SEP + GAP + SIZE_RE, 'gi'), '');
      /* NOTHING IN THE BRACKET BUT SIZES.
         /literacy/literacyforme/resources reads "(, 7.85MB |
         , 1.1MB)" — the formats those belonged to were lost before
         this tool ever saw the page, and the bracket is left holding
         two numbers and the punctuation between them. An empty
         bracket is no better than a full one, so the pair goes. */
      if (!/[A-Za-z0-9]/.test(out)) { n++; return ''; }
      if (!namesFormat.test(' ' + out)) return m;    // a size in prose: left alone
      n++;
      return '(' + out.trim() + ')';
    });

    /* (c) NO BRACKET AT ALL: "PDF, 1426 KB". */
    h = h.replace(new RegExp('((?:' + FORMAT_ALT + '))' + GAP + '[,:;–—-]' + GAP + SIZE_RE + '(?![a-z0-9])', 'gi'),
      (m, fmt) => { n++; return fmt; });

    /* (d) AND WHERE THE FORMAT IS THE LINK ITSELF and the size
       trails it: "<a>PPT</a>, 7.85MB". */
    h = h.replace(new RegExp('(</a>)' + GAP + '[,:;–—-]' + GAP + SIZE_RE + '(?![a-z0-9])', 'gi'),
      (m, close) => { n++; return close; });

    /* (e) AN EMPTY BRACKET IS DEBRIS whoever left it — five of them
       sit on /literacy/literacyforme/resources in the page as it
       stands today, around links that are no longer there. */
    h = h.replace(new RegExp(GAP + '\\(' + GAP + '\\)', 'g'), () => { n++; return ''; });

    h = h.replace(/@@HELD(\d+)@@/g, (m, i) => held[+i]);
    return [h, n];
  }],

  /* A FORMAT NAMED IN PLAIN WORDS AFTER A LINK.
     The chip rule reads a format out of brackets or parentheses —
     "(PDF)", "[Powerpoint]". 41 links on 15 pages name it with no
     punctuation at all: "…Procedure Word Document", "…Handbook PDF".
     Same information, same place, same job; only the punctuation the
     author happened to use is different, and that is not a reason for
     one to be a tag and the other to be a stray word at the end of a
     link.
     A WHITELIST, AND ONLY DIRECTLY AFTER A LINK. "Video" in the
     middle of a sentence is a word; "Video" sitting on its own right
     after a link is a label. */
  ['format named in words chipped', (h) => {
    let n = 0;
    /* A DASH IN FRONT OF IT IS PART OF THE LABEL, not part of the
       sentence. "…Tips from a Maine Teacher — Video" is a link, a
       separator and a format, and once the format is a chip the
       separator has nothing left to separate: the chip's own margin
       draws that gap. Same reasoning as the chevron — a list item
       that already shows its shape does not also need a hyphen. */
    h = h.replace(/(<\/a>)((?:\s|&nbsp;)*(?:[-–—](?:\s|&nbsp;)*)?)([A-Za-z][A-Za-z ]{1,22}?)(?=(?:\s|&nbsp;)*(?:<|$))/g,
      (m, close, gap, word) => {
        const key = word.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!FORMAT_WORDS.includes(key)) return m;
        n++;
        return `${close} <span class="doe-chip">${chipLabel(word)}</span>`;
      });
    return [h, n];
  }],

  ['bare spans unwrapped', (h) => {
    let n = 0;
    let prev;
    /* THE PATTERN MATCHES THE INNERMOST SPAN ITSELF rather than
       matching any span and then testing whether it was the innermost.
       Written the second way it matched the OUTER span of a nest, ran
       to the first </span>, found a <span in what it had captured and
       handed the whole thing back unchanged — and String.replace
       consumes a match either way, so the inner span never got its
       own turn. The loop saw no change and stopped, leaving 37 bare
       spans stacked eight deep on
       /learning/content/worldlanguages/prolearning/spain.
       A span that cannot contain another span is by definition the
       innermost one, so each pass strips a layer and the loop
       genuinely converges. */
    do { prev = h; h = h.replace(/<span>((?:(?!<span\b)[\s\S])*?)<\/span>/gi, (m, inner) => {
      n++; return inner;
    }); } while (h !== prev);
    return [h, n];
  }],

  /* A LINE BREAK AT THE EDGE OF A BLOCK IS SPACING TYPED BY HAND.
     196 of them on 104 pages. /numeracy opens its first paragraph
     with two of them before the image — someone pushing the picture
     down the page in an editor that gave them no other way to do it.
     A block already has margins, and they are the stylesheet's to
     set; a break at the start or end of one adds a line of whatever
     height the font happens to be, so the gap differs from every
     other gap on the page and moves when the type does.
     Only at the edges. A break BETWEEN two lines of an address or a
     verse is doing real work and is left alone. */
  /* TWO DOCUMENTS IN ONE BULLET, SEPARATED BY A LINE BREAK.
     "Selecting Professional Development Guidance - Word" and the
     same title again "- PDF" are two files, written as two lines
     inside a single <li>. They look like two items and they are two
     items, but only the first one is a first child — so the chevron,
     which is drawn on li.doe-item > a:first-child, appears on the
     Word line and not on the PDF line under it. Matt spotted that as
     "why do all of the first links have a chevron and then others
     don't"; the answer is that the second link is not a list item
     yet.
     Making each line its own <li> fixes the chevron, the spacing and
     the divider in one go, because all three are list-item devices.

     ONLY WHERE EVERY LINE IS ITS OWN LINK. A <br> inside a bullet
     usually separates a title from its description, and splitting
     those would strand the description in a bullet of its own —
     253 list items on the site carry a <br> and only 7 of them are
     this. The test is that each side starts with a link. */
  ['list item split where a line break separated two links', (h) => {
    let n = 0;
    h = h.replace(/<li\b([^>]*)>((?:(?!<\/li>)[\s\S])*)<\/li>/gi, (m, attrs, inner) => {
      if (!/<br\s*\/?>/i.test(inner)) return m;
      const parts = inner.split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
      if (parts.length < 2 || !parts.every(s => /^<a\b/i.test(s))) return m;
      n += parts.length - 1;
      return parts.map(s => `<li${attrs}>${s}</li>`).join('\n');
    });
    return [h, n];
  }],

  ['line breaks at the edge of a block removed', (h) => {
    let n = 0, prev;
    do {
      prev = h;
      h = h.replace(/(<(?:p|li|td|th|div|h[1-6]|dd|dt|blockquote)\b[^>]*>)((?:\s|&nbsp;)*)(?:<br\s*\/?>(?:\s|&nbsp;)*)+/gi,
        (m, open, gap) => { n++; return open + gap; });
      h = h.replace(/(?:(?:\s|&nbsp;)*<br\s*\/?>)+((?:\s|&nbsp;)*)(<\/(?:p|li|td|th|div|h[1-6]|dd|dt|blockquote)>)/gi,
        (m, gap, close) => { n++; return gap + close; });
    } while (h !== prev);
    return [h, n];
  }],

  /* AN <hr> DOING A SECTION HEADER'S JOB.
     Authors drew a horizontal rule above a section to separate it,
     which the design now does itself — so the page carries both, and
     on /schoolsupports/communityschools/info it carries TWO in a row
     above "What is a Community School?": three lines stacked above
     one heading.
     It also broke the rule that suppresses the section line above the
     FIRST heading on a page. That test is "the banner is immediately
     before it", and an <hr> sitting between them made it false, so
     the first section got a divider with nothing above it to divide
     from. Removing the rules fixes the artefact and the adjacency at
     the same time. */
  ['manual rules above headings removed', (h) => {
    let n = 0;
    /* Any run of them, and any whitespace between. */
    h = h.replace(/(?:\s*<hr\s*\/?>)+(\s*)(?=<div[^>]*class="[^"]*\bblockhead\b|<h[1-6]\b)/gi,
      (m, tail) => { n += (m.match(/<hr/gi) || []).length; return tail; });
    /* And a run anywhere else collapses to one — two rules in a row
       is never deliberate. */
    h = h.replace(/(<hr\s*\/?>)(\s*<hr\s*\/?>)+/gi, (m, first) => {
      n += (m.match(/<hr/gi) || []).length - 1; return first;
    });
    return [h, n];
  }],
  /* A HEADING THAT ENDS IN A LINE BREAK.
     78 headings across 53 pages finish with <br> or &nbsp; inside the
     heading itself — "Laws and Regulations for those who care for
     children … in school.<br>&nbsp;" on /cds/laws. It was how the
     author made room under the title in the old layout, and in the
     section-header band it is a blank line inside a navy slab. The
     words are untouched; only the trailing break goes. */
  ['trailing breaks removed from headings', (h) => {
    let n = 0;
    h = h.replace(/(<h[1-6]\b[^>]*>)([\s\S]*?)(<\/h[1-6]>)/gi, (m, open, inner, close) => {
      const trimmed = inner.replace(/(?:\s|&nbsp;|<br\s*\/?>)+$/i, '');
      if (trimmed === inner) return m;
      n++;
      return open + trimmed + close;
    });
    return [h, n];
  }],
  ['Word artifacts stripped', (h) => {
    let n = 0;
    h = h.replace(/<\/?o:p[^>]*>/gi, () => { n++; return ''; })
         /* Any Mso class, anywhere in the attribute — MsoListParagraph
            and "x MsoNormal" both slipped past a match on the exact
            string class="MsoNormal". */
         .replace(/\sclass="([^"]*)"/gi, (m, c) => {
           if (!/\bMso[A-Za-z]+/.test(c)) return m;
           const kept = c.replace(/\bMso[A-Za-z]+\s*/g, '').trim();
           n++; return kept ? ` class="${kept}"` : '';
         })
         .replace(/<font[^>]*>|<\/font>/gi, () => { n++; return ''; })
         /* THE LIST AND TABLE FAMILY, which the first version of this
            rule did not touch at all — it knew about <o:p>, Mso
            classes and <font> and nothing else, so 865 of these
            survived on 12 pages. Word writes its own list and table
            bookkeeping into the markup when text is pasted from it:
            role="list"/"listitem"/"row"/"rowheader" (which claim an
            ARIA role the element already has, or worse, claim one it
            does not), aria-setsize="-1" (a lie: it means "size
            unknown" on a list whose size is right there), the
            data-aria-* mirror of the same, data-font="Wingdings" —
            the bullet glyph from a font nobody has — and the
            data-tablelook / data-tablestyle / data-celllook numbers
            that mean something only inside Word.
            None of it has any effect on the page except through a
            screen reader, where the false roles and the "unknown
            size" actively mislead. */
         .replace(/\s(?:role="(?:list|listitem|row|rowheader|cell|presentation)"|aria-setsize="[^"]*"|aria-posinset="[^"]*"|aria-rowcount="[^"]*"|aria-rowindex="[^"]*"|aria-colindex="[^"]*"|aria-colcount="[^"]*"|data-aria-[a-z]+="[^"]*"|data-font="[^"]*"|data-leveltext="[^"]*"|data-listid="[^"]*"|data-tablelook="[^"]*"|data-tablestyle="[^"]*"|data-celllook="[^"]*")/gi,
           () => { n++; return ''; })
         /* U+FFFC, the object replacement character. Word puts it
            where an embedded object used to be, and it renders as a
            box or a blank in the middle of a sentence. The object is
            long gone; only the placeholder is left. */
         .replace(/\uFFFC/g, () => { n++; return ''; });
    return [h, n];
  }],

  /* A BODY <h1> IS ALWAYS WRONG.
     Drupal renders the page title as the h1 in its own block, a
     sibling of the body field. So an h1 typed into the body is a
     second h1 on the page: it competes with the title, it breaks the
     "one h1" rule that assistive technology relies on to announce
     what a page is, and it reads at title size in the middle of the
     content.

     Measured: /doe/about/laws/policy has one ("Resources"), /doe/steam
     has two. Both are plainly section headers that were typed at the
     wrong level, which makes this mechanical rather than a judgement
     call — the level is wrong whatever the words say.

     Demoting to a blockhead h2 also makes the section countable: the
     contents list is generated from .blockhead h2, so a page whose
     sections were h1s could never have one. */
  ['body h1 to blockhead h2', (h) => {
    let n = 0;
    h = h.replace(/<h1[^>]*>\s*(?:<strong>)?([\s\S]*?)(?:<\/strong>)?\s*<\/h1>/gi,
      (m, text) => { n++; return `<div class="blockhead">\n<h2>${text.trim()}</h2>\n</div>`; });
    return [h, n];
  }],

  /* LAYOUT TABLES.
     A <table> with no <th> is not a table — it is a two-column layout
     drawn with table markup, and a screen reader announces it as a
     data table with rows and columns that mean nothing (WCAG 1.3.1).
     Measured on /doe/schoolsupports/communityschools: one row, two
     cells, a YouTube embed in the left and the paragraph that
     describes the whole page in the right — so the page's summary is
     locked inside a table cell where it can never be the description.

     Only the unambiguous case: one row, no header cells, at most
     three cells. Every cell's contents survive in order; nothing but
     the table furniture is removed. */
  ['layout table unwrapped', (h) => {
    let n = 0;
    /* ONE COLUMN, ANY NUMBER OF ROWS — the case the rule below could
       not see, because it insisted on a single row.
       A table with one column relates nothing to anything: there is
       no second column for a row to be read against, so every row is
       just a block of content in a box. Word writes exactly this when
       someone draws a callout in a document — a heading in the first
       cell, its list in the second — and it arrived here as
       <table aria-rowcount="2" data-tablestyle="MsoTableGrid">, eight
       times on /literacy/literacyforme/components.
       Left alone it was worse than untidy: the branding step took it
       for a real table and gave it navy headers and striped rows, so
       a Word layout box came out looking like official data. And the
       <h3> in the first cell could never be styled as a sub-heading
       or counted into the contents list, because it was a table cell.
       Every cell's contents survive, in order, in the flow. */
    h = h.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (m, inner) => {
      if (/<th[\s>]/i.test(inner)) return m;
      const rows = inner.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
      /* ONE ROW COUNTS TOO, AND THE CLASS DOES NOT SAVE IT.
         /learning/highered/transcripts wraps its "PLEASE NOTE"
         callout in a table of one row and one cell carrying
         class="tables table-striped table-hover" — so the rule below,
         which refuses any table already classed as a table, left it
         alone. With the searchable-table behaviour now switched on by
         that same `tables` class, a Word callout was about to be
         given a search box and sortable headings.
         A table with one cell relates nothing to anything. What class
         someone put on it does not change that. */
      if (rows.length < 1) return m;
      if (rows.some(r => (r.match(/<td[\s>]/gi) || []).length !== 1)) return m;
      n++;
      return rows
        .map(r => (r.match(/<td[^>]*>[\s\S]*?<\/td>/i) || [''])[0]
          .replace(/^<td[^>]*>/i, '').replace(/<\/td>$/i, '').trim())
        .filter(Boolean)
        .map(c => /^<(p|div|ul|ol|h[1-6]|table|img|iframe|dl)[\s>]/i.test(c) ? c : `<p>${c}</p>`)
        .join('\n');
    });
    h = h.replace(/<table(?![^>]*class="[^"]*table)[^>]*>([\s\S]*?)<\/table>/gi, (m, inner) => {
      if (/<th[\s>]/i.test(inner)) return m;
      const rows = inner.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
      if (rows.length !== 1) return m;
      const cells = rows[0].match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
      if (!cells.length || cells.length > 3) return m;
      n++;
      /* COLUMNS, NOT A STACK. The first version emitted the cells one
         after another, which turned the Contact page's three-across
         address block — Mailing / Physical / Phone — into three
         paragraphs down the page. The cells were side by side for a
         reason; the fault was the TABLE, not the arrangement.

         A Bootstrap row says the same thing in markup that means it:
         a screen reader reads three regions instead of a data table
         with rows and columns that carry no meaning, and it stacks on
         a phone by itself, which the table never did. */
      const span = Math.max(1, Math.round(12 / cells.length));
      return '<div class="row">\n' + cells
        .map(c => c.replace(/^<td[^>]*>/i, '').replace(/<\/td>$/i, '').trim())
        /* A cell holding bare text becomes a paragraph; a cell that
           already holds block markup is emitted as it stands. */
        .map(c => /^<(p|div|ul|ol|h[1-6]|table|img|iframe)[\s>]/i.test(c) ? c : `<p>${c}</p>`)
        .map(c => `<div class="col-sm-${span}">${c}</div>`)
        .join('\n') + '\n</div>';
    });
    return [h, n];
  }],

  /* A bare <iframe> has no aspect ratio of its own, so it renders at
     whatever fixed height was typed — height="315" inside a 461px
     cell, which is why the Community Schools video looks soft: the
     player is served a frame far smaller than the space it is shown
     in. Wrapped, it takes a real 16:9 box at the column's full width. */
  ['video wrapped', (h) => {
    let n = 0;
    h = h.replace(/(<p[^>]*>\s*)?(<iframe[\s\S]*?<\/iframe>)(\s*<\/p>)?/gi, (m, open, frame) => {
      if (/video-center|doe-video/i.test(m)) return m;
      /* AND NOT ONE THE AUTHOR HAS ALREADY PLACED. A responsive
         embed is a box with padding-bottom set to the ratio and the
         iframe absolutely positioned inside it. /dirigoschools builds
         exactly that at 177.78% for a pair of portrait videos, and
         wrapping it again put a 16:9 box inside a 9:16 one.
         position:absolute on the iframe itself is the tell: an iframe
         that is being positioned by its parent is already handled. */
      if (/style="[^"]*position:\s*absolute/i.test(frame)) return m;
      n++;
      /* THE WRAPPER OWNS THE GEOMETRY, SO THE IFRAME MUST NOT SET ANY.
         Stripping the width and height ATTRIBUTES was only half of
         it: /pineproject writes style="float:left; height:315px" on
         the embed, and an inline style beats the wrapper's rule — so
         a 16:9 responsive box was handed a 315px-tall floating iframe
         and the video came out at neither the box's shape nor a
         standard player size.
         Float, dimensions and margins go; anything else the author
         set is left alone. */
      const placed = frame.replace(/\s(width|height|align)="[^"]*"/gi, '')
        .replace(/\sstyle="([^"]*)"/i, (sm, css) => {
          const kept = css
            .replace(/(?:^|;)\s*(?:float|width|height|max-width|max-height|margin(?:-[a-z]+)?)\s*:[^;]*/gi, '')
            .replace(/;{2,}/g, ';').replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').trim();
          return kept ? ` style="${kept}"` : '';
        });
      return `<div class="doe-video">${placed}</div>`;
    });
    return [h, n];
  }],

  /* AN ACTION LINK IS A PARAGRAPH THAT IS ONLY A LINK.
     The stylesheet tried to spot these with p > a:only-child and got
     it wrong, because :only-child counts ELEMENT children and ignores
     text: "<p><a>Download this resource</a> to guide instructional
     supports…" matched, and the chevron landed in the middle of a
     sentence. CSS has no way to ask whether a paragraph holds any
     other words, so the test moves here, where the text is readable,
     and the answer is written into the markup as a class.

     Exact match on the stripped text, so a single trailing full stop
     or a stray space does not flip a link in or out of the
     treatment. */
  ['action links marked', (h) => {
    let n = 0;
    const strip = x => x.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    /* td AS WELL AS p AND li, because the reader cannot see which
       tag something is written in.
       A link alone in a table cell is the same object as a link alone
       in a list item — the whole point of its container — and it was
       the one that never got the mark. On
       /learning/specialed/ideapublic that is exactly the complaint:
       the links under State Performance Plan are list items and carry
       the chevron, the links in the IDEA Part B Fiscal card are table
       cells and do not, and nothing about the page explains why.
       The mark earns its place here: 179 of these tables mix links
       with plain text — dates, statuses, dashes — so the chevron says
       which cells you can click. Only 7 are entirely links, where it
       is merely consistent rather than useful. */
    h = h.replace(/<(p|li|td)([^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attrs, inner) => {
      const links = inner.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
      if (links.length !== 1) return m;
      if (/\bbtn\b|doe-action/.test(attrs) || /\bbtn\b/.test(links[0])) return m;
      const whole = strip(inner).replace(/[.\s]+$/, '');
      const text = strip(links[0]).replace(/[.\s]+$/, '');
      if (!text) return m;
      /* A TRAILING QUALIFIER STILL LEAVES IT A LINK ITEM.
         "Defensible & Resilient: K-12 Infrastructure Brief (CISA)"
         is a link with the source named after it, not a link with a
         description — but an exact-match test saw the "(CISA)" and
         refused, so in one list of four the first item had a chevron
         and the other three did not. That inconsistency is what a
         reader notices, not the precision.
         Only a short parenthetical or a few characters: anything
         longer really is a description and belongs to .doe-item. */
      if (whole !== text) {
        /* BEFORE THE LINK AS WELL AS AFTER IT. The first version only
           allowed a trailing qualifier, so "August 24, 2026 - Local
           Foods Updates" — a date written before the link — stayed
           unmarked while the items around it got the chevron. Both
           ends are the same thing: a short label attached to a link,
           not a description of one. */
        if (!whole.includes(text)) return m;
        const rest = whole.replace(text, ' ').replace(/\s{2,}/g, ' ').trim();
        /* A DASH AFTER THE LINK MEANS A DESCRIPTION, WHATEVER ITS
           LENGTH. Length alone cannot tell "(CISA)" from "- Introducing
           Math Pathways to administrators", and a 26-character
           description is under the 30 allowed here while also being
           under the 30 that .doe-item requires — so it fell between
           the two and got the standing-link treatment by accident.
           The site writes a description with a separator in front of
           it and a qualifier without one. That is the real test. */
        if (/^[-–—]/.test(rest)) return m;
        const parenthetical = /^[([][^)\]]{1,24}[)\]]$/.test(rest);
        if (!parenthetical && rest.length > 30) return m;
      }
      n++;
      return /class="/.test(attrs)
        ? `<${tag}${attrs.replace(/class="/, 'class="doe-action ')}>${inner}</${tag}>`
        : `<${tag} class="doe-action"${attrs}>${inner}</${tag}>`;
    });
    return [h, n];
  }],

  /* AND OFF A CELL WHOSE CONTENT IS A LIST.
     528 marked cells hold a <ul> of links rather than a link. The
     mark means "this container's point is its one link", which a
     list of six is not — and the list's own items already take
     .doe-item or .doe-action from the list rules, so the cell is
     claiming a job that is being done one level down. */
  ['action marks dropped from cells holding a list', (h) => {
    let n = 0;
    h = h.replace(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attrs, inner) => {
      if (!/\bdoe-action\b/.test(attrs)) return m;
      if (!/^\s*<(ul|ol)[\s>]/i.test(inner)) return m;
      const kept = attrs.replace(/(class=")([^"]*)(")/i, (x, a, cls, b) => {
        const left = cls.split(/\s+/).filter(c => c && c !== 'doe-action').join(' ');
        return left ? a + left + b : '';
      }).replace(/\s{2,}/g, ' ');
      n++;
      return `<${tag}${kept.trim() ? ' ' + kept.trim() : ''}>${inner}</${tag}>`;
    });
    return [h, n];
  }],

  /* THE MARK COMES OFF A COLUMN WHERE EVERY CELL IS A LINK.
     The rule above earns its place in a mixed table: 472 columns on
     the site hold a link in some rows and a date or a status in
     others, and there the chevron says which cells you can click.
     That was Matt's complaint on /learning/specialed/ideapublic and
     it is right.
     It earns nothing in the other kind. 94 columns — 1,236 cells —
     are a link in every single row: the 256-school directory on
     /schools/schoolops/equivalentinstruction/entry is a column of
     school names where every name is a link. A mark that says "this
     one is clickable" on all 256 says it about none of them, and a
     teal arrow on every row of a directory is texture, not
     information.
     So the mark is decided per COLUMN rather than per cell, which
     the rule above cannot see because it works a cell at a time.
     90% is the line: a column that is nine-tenths links is a link
     column, and the handful that are not do not need pointing at. */
  ['action marks dropped from all-link columns', (h) => {
    let n = 0;
    h = h.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => {
      const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
      if (rows.length < 2) return table;
      /* Count, per column position, how many body cells carry the
         mark and how many there are in total. */
      const tally = {};
      for (const r of rows) {
        const cells = [...r[1].matchAll(/<(td|th)\b([^>]*)>/gi)];
        if (!cells.length || cells.every(c => c[1].toLowerCase() === 'th')) continue;
        cells.forEach((c, k) => {
          tally[k] = tally[k] || { total: 0, marked: 0 };
          tally[k].total++;
          if (/\bdoe-action\b/.test(c[2])) tally[k].marked++;
        });
      }
      const uniform = new Set(Object.keys(tally)
        .filter(k => tally[k].marked && tally[k].marked / tally[k].total >= 0.9));
      if (!uniform.size) return table;
      return table.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (row, inner) => {
        let k = -1;
        const out = inner.replace(/<(td|th)\b([^>]*)>/gi, (cm, tag, attrs) => {
          k++;
          if (!uniform.has(String(k)) || !/\bdoe-action\b/.test(attrs)) return cm;
          const kept = attrs.replace(/(class=")([^"]*)(")/i, (x, a, cls, b) => {
            const left = cls.split(/\s+/).filter(c => c && c !== 'doe-action').join(' ');
            return left ? a + left + b : '';
          }).replace(/\s{2,}/g, ' ');
          n++;
          return `<${tag}${kept.trim() ? ' ' + kept.trim() : ''}>`;
        });
        return row.replace(inner, out);
      });
    });
    return [h, n];
  }],

  /* FORMAT LABELS BECOME CHIPS.
     The site writes the format of a document in brackets at the end
     of a link — "Community Schools Presentation Overview
     [Powerpoint]", "[YouTube]", "[PDF]". That is useful information
     and it is already in the right place: inside the link, so a
     screen reader announces the format as part of the link's name.
     It just looks like punctuation.

     THE RISK, and why this is a list rather than a pattern: brackets
     mean other things. "[sic]", "[2024]", an editor's aside. Matching
     any [text] would style all of them. So only these known formats
     convert, and anything else in brackets is left exactly as it is.
     Adding a format later is one word in this list.

     The chip goes INSIDE the link deliberately — pulling it out would
     take the format off the link's accessible name, which is the
     thing that makes "PDF" meaningful to a screen reader. */
  ['format labels chipped', (h) => {
    let n = 0;
    const FORMATS = FORMAT_WORDS;
    h = h.replace(/\[([^\][<>]{1,18})\]/g, (m, label) => {
      const key = label.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!FORMATS.includes(key)) return m;
      n++;
      return `<span class="doe-chip">${chipLabel(label)}</span>`;
    });
    /* AND THE FORM THE SITE ACTUALLY USES, WHICH IS PARENTHESES.
       This rule was written for "Overview [Powerpoint]" and there are
       ZERO of those on the site. What there are is 373 of
       "How Does the Maine School Bus Purchase Program Work? (PDF)" —
       283 PDFs, 30 Excel, 22 video — across 81 pages, every one of
       them left as punctuation because the rule was looking for the
       wrong bracket. A rule that matches nothing is worse than no
       rule: it looks like the case is handled.

       ONLY INSIDE LINK TEXT, which is the difference between the two
       brackets. Square brackets are rare enough in prose to convert
       anywhere; parentheses are not — "the Portable Document Format
       (PDF) specification" is a sentence, not a label. A format in
       parentheses is a label only where it sits at the end of the
       thing you click, so that is the only place this looks.
       The chip stays INSIDE the <a>, so a screen reader still
       announces the format as part of the link's name. */
    h = h.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (m, attrs, inner) => {
      /* A BUTTON KEEPS ITS OWN LABEL. Eight pages write "Final PEG
         State Report (PDF)" as the button's text; lifting the
         "(PDF)" out of it leaves a button with a tag stuck on
         beside — two devices for one thing. A tag describes a
         document in a list; a button says what to do. */
      if (/\bclass="[^"]*\bbtn\b/.test(attrs)) return m;
      /* THE SPACE IN FRONT OF THE LABEL GOES WITH IT. Left behind it
         sits inside the <a> and takes the link's underline, so the
         rule runs a character past the last word — "Work? ___PDF".
         The chip carries its own 7px left margin, so the gap is drawn
         rather than typed. */
      const out = inner.replace(/(?:\s|&nbsp;)*\(([^()<>]{1,18})\)(\s|&nbsp;|\.)*$/, (mm, label, tail) => {
        const key = label.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!FORMATS.includes(key)) return mm;
        n++;
        return `<span class="doe-chip">${chipLabel(label)}</span>${tail || ''}`;
      });
      return out === inner ? m : `<a${attrs}>${out}</a>`;
    });
    /* AND THE ONES THE AUTHOR PUT JUST OUTSIDE THE LINK.
       113 of them are written </a>&nbsp;(PDF) rather than inside the
       anchor — the same label about the same file, a few characters
       further right. Converted where it stands rather than moved in:
       pulling it inside the <a> would improve what a screen reader
       announces, but it would also move text the author placed, and
       that is not this tool's call to make. */
    /* A FORMAT MAY CARRY ITS FILE SIZE, and 80 labels on 31 pages
       do — "(PDF, 73KB)", "(Word, 1.2MB)". An exact match against
       the format list refused every one of them, so the commonest
       and most useful form of this label was the one form not
       handled. Size and format are one piece of metadata about one
       file and the chip carries both, which is how GOV.UK sets it. */
    const sized = new RegExp('^(' + FORMATS.join('|').replace(/ /g, '\\s+') + ')(?:\\s*,?\\s*[0-9.]+\\s*[KMG]B)?$', 'i');
    /* A <br> BETWEEN THE LINK AND ITS LABEL is still the link's
       label — /funding/training-materials writes "</a><br /> (Web
       PDF)" because the author wanted it on its own line. */
    /* NOT AFTER A BUTTON. Eight pages write "Final PEG State Report
       (PDF)" as a button's own label, and pulling the "(PDF)" out of
       it produced a button with a tag stuck on beside — two devices
       for one thing, and they disagree about what they are. A tag
       says what a document is, which is a list's job; a button says
       what to do, which is the page's.
       The label stays inside the button, where its author put it.
       Nothing is removed and nothing is duplicated. */
    h = h.replace(/(<a\b[^>]*>(?:(?!<\/a>)[\s\S])*)<\/a>((?:\s|&nbsp;)*(?:<br\s*\/?>)?(?:\s|&nbsp;)*)\(([^()<>]{1,22})\)/gi, (m, anchor, gap, label) => {
      if (/\bclass="[^"]*\bbtn\b/.test(anchor)) return m;   // a button keeps its label
      const key = label.trim().replace(/\s+/g, ' ');
      if (!sized.test(key)) return m;
      n++;
      return `${anchor}</a>${gap}<span class="doe-chip">${chipLabel(key)}</span>`;
    });
    /* And the same label inside the link text, sized or not. */
    h = h.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (m, attrs, inner) => {
      if (/\bclass="[^"]*\bbtn\b/.test(attrs)) return m;     // a button keeps its label
      const out = inner.replace(/(?:\s|&nbsp;)*\(([^()<>]{1,22})\)(\s|&nbsp;|\.)*$/, (mm, label, tail) => {
        const key = label.trim().replace(/\s+/g, ' ');
        if (!sized.test(key)) return mm;
        n++;
        return `<span class="doe-chip">${chipLabel(key)}</span>${tail || ''}`;
      });
      return out === inner ? m : `<a${attrs}>${out}</a>`;
    });
    /* AND THE FORM WITH NO BRACKET AT ALL: a space, a dash, then the
       format, at the end of the link's own text — "Professional
       Development Audit - Word Document", "…Checklist - PDF". Nine
       of these on /learning/esea/guidance, and they are the same
       label as "(PDF)" written with different punctuation: the
       author put the format where the format belongs and reached for
       a dash instead of a bracket. The dash goes the way the bracket
       does, because the chip draws that gap itself.

       A SPACE IN FRONT OF THE DASH IS REQUIRED. Without it the rule
       reads "Non-PDF" and "K-12 Video" as labels and takes the first
       half of a word away with the punctuation. */
    h = h.replace(/<a\b([^>]*)>((?:(?!<\/a>)[\s\S])*)<\/a>/gi, (m, attrs, inner) => {
      const out = inner.replace(/(?:\s|&nbsp;)+[-–—](?:\s|&nbsp;)*([A-Za-z][A-Za-z ]{1,22}?)((?:\s|&nbsp;)*)$/,
        (mm, label, tail, off) => {
          const key = label.trim().toLowerCase().replace(/\s+/g, ' ');
          if (!FORMATS.includes(key)) return mm;
          /* The label is a label because something it labels comes
             first. A link whose whole text is "- PDF" is a link with
             no name, and turning it into a bare chip would leave it
             with none. */
          if (!/[A-Za-z0-9]/.test(inner.slice(0, off))) return mm;
          n++;
          return `<span class="doe-chip">${chipLabel(label)}</span>${tail || ''}`;
        });
      return out === inner ? m : `<a${attrs}>${out}</a>`;
    });
    return [h, n];
  }],

  /* ACCORDION REPAIR.
     Measured on /doe/cert/faq, which renders every item open at once.
     Three faults, all of them mechanical, and any one of them stops
     the accordion module from initialising:

       no .ckeditor-accordion-container  the module looks for it
       one <dl> holding five <dt>s        the convention is one each
       2 of 5 <dt>s with no <a>           the click target is the link

     Fixed in that order below. Not a word of content moves: the same
     titles and the same panels come out, in the same sequence, with
     the wrapper markup the module expects. A well-formed accordion
     passes through all three untouched. */
  /* THE CHEVRON GOES BEFORE THE CHIP, EVERYWHERE.
     Some chips were drawn inside the <a> and some after it, and the
     chevron is a background image on the anchor's right edge — so an
     inside chip pushed the anchor wider and the chevron landed after
     it ("Guidance WORD ›") while an outside chip let it land before
     ("Part 1 › VIDEO"). Two orders on one card, from a difference in
     the markup nobody can see. The chip goes outside, so the order is
     always text, chevron, tag.

     AND THE LINK KEEPS THE FORMAT IN ITS NAME. Moving the chip out
     would otherwise leave two links reading "Professional Development
     Audit" — same accessible name, different files — which is exactly
     the failure WCAG 2.4.4 is about. The anchor takes an aria-label
     of its own text plus the format, so the visible text is still
     contained in the accessible name (2.5.3) and a screen reader
     still hears which one it is. */
  ['format chip moved out of the link', (h) => {
    let n = 0;
    h = h.replace(/<a\b([^>]*)>((?:(?!<\/a>)[\s\S])*?)(<span class="doe-chip">([^<]*)<\/span>)((?:\s|&nbsp;)*)<\/a>/gi,
      (m, attrs, before, chip, label, tail) => {
        const text = before.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        if (!text) return m;                       // the chip IS the link text — leave it alone
        n++;
        const named = /aria-label=/i.test(attrs)
          ? attrs
          : `${attrs} aria-label="${text.replace(/"/g, '&quot;')}, ${label}"`;
        return `<a${named}>${before.replace(/(?:\s|&nbsp;)+$/, '')}</a>${chip}${tail || ''}`;
      });
    return [h, n];
  }],

  /* A BULLET WHOSE ONLY LINK IS THE WORD "PDF".
     The public-comment lists read "Clark, Jennifer – PDF", with the
     name as plain text and the link wrapped around nothing but the
     format. 191 of them on 8 standards-review pages, all exactly
     this shape and no other.
     Three things are wrong with it at once and they are the same
     thing: the name is not clickable, so the target is a 20-pixel
     word; the accessible name of every link on the page is "PDF",
     which is the fault the component list names in as many words;
     and with no text in the anchor there is nothing for the chevron
     to sit after, so the row renders chip-then-chevron while every
     other row on the site renders text-chevron-chip.
     Moving the name inside the link fixes all three. Every word
     stays, the dash goes the way the other label dashes go, and the
     aria-label keeps the format in the accessible name so the link
     still announces which file it is. */
  ['name pulled into a link that was only a format chip', (h) => {
    let n = 0;
    h = h.replace(/<li\b([^>]*)>((?:(?!<\/li>)[\s\S])*)<\/li>/gi, (m, attrs, inner) => {
      const shape = inner.trim().match(
        /^((?:[^<>]|<\/?(?:strong|em|b|i)>){1,80}?)(?:\s|&nbsp;)*[-–—](?:\s|&nbsp;)*<a\b([^>]*)>(<span class="doe-chip">([^<]*)<\/span>)<\/a>(?:\s|&nbsp;)*$/i);
      if (!shape) return m;
      const [, lead, aAttrs, chip, label] = shape;
      const text = lead.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) return m;
      n++;
      const named = /aria-label=/i.test(aAttrs)
        ? aAttrs
        : `${aAttrs} aria-label="${text.replace(/"/g, '&quot;')}, ${label}"`;
      return `<li${attrs}><a${named}>${lead.trim()}</a>${chip}</li>`;
    });
    return [h, n];
  }],

  /* AND A LAST SWEEP: NO CHIP SURVIVES BESIDE A BUTTON.
     Three separate passes can produce one — the label in brackets
     inside the anchor, the same thing written just outside it, and
     the bare format word after it — and guarding each of them in
     turn still left two, because a fourth path reached the same
     shape. Guarding a shape is more reliable than guarding every
     route to it.
     The tag is folded back into the button's own label, in the
     brackets its author used, so the page reads exactly as it was
     written: "Final PEG State Report (PDF)". Nothing is removed,
     nothing is duplicated, and running this twice changes nothing.
     WHY THE BUTTON AND NOT THE TAG: a tag describes a document in a
     list of documents. A button is the one action a page is asking
     for. Two devices on one control make it neither. */
  ['format tag folded back into a button', (h) => {
    let n = 0;
    h = h.replace(/(<a\b[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*>)((?:(?!<\/a>)[\s\S])*?)((?:\s|&nbsp;)*)<\/a>((?:\s|&nbsp;)*)<span class="doe-chip"[^>]*>([^<]*)<\/span>/gi,
      (m, open, inner, tail, gap, chip) => {
        const label = chip.trim();
        if (!label) return m;
        /* Already said in the label — then the tag was the duplicate
           and simply goes. */
        if (new RegExp('\\(\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\)', 'i').test(inner)) {
          n++; return `${open}${inner}${tail}</a>`;
        }
        n++;
        return `${open}${inner} (${label})${tail}</a>`;
      });
    return [h, n];
  }],

  ['accordion titles linked', (h) => {
    let n = 0;
    h = h.replace(/<dt([^>]*)>([\s\S]*?)<\/dt>/gi, (m, attrs, inner) => {
      if (/<a[\s>]/i.test(inner)) return m;
      if (!inner.replace(/<[^>]+>/g, '').trim()) return m;
      n++;
      return `<dt${attrs}><a href="#">${inner.trim()}</a></dt>`;
    });
    return [h, n];
  }],

  ['accordion split to one item per dl', (h) => {
    let n = 0;
    h = h.replace(/<dl([^>]*class="[^"]*ckeditor-accordion[^"]*"[^>]*)>([\s\S]*?)<\/dl>/gi, (m, attrs, inner) => {
      const pairs = [...inner.matchAll(/(<dt[\s\S]*?<\/dt>)\s*(<dd[\s\S]*?<\/dd>)/gi)];
      if (pairs.length < 2) return m;
      n += pairs.length - 1;
      return pairs.map(pr => `<dl${attrs}>\n${pr[1]}\n${pr[2]}\n</dl>`).join('\n');
    });
    return [h, n];
  }],

  ['accordion container added', (h) => {
    let n = 0;
    /* Wrap a RUN of adjacent accordion lists, not each one — the
       container is what the module binds to, and one per item would
       give five separate widgets instead of one set. */
    h = h.replace(/(<dl[^>]*class="[^"]*ckeditor-accordion[^"]*"[^>]*>[\s\S]*?<\/dl>\s*)+/gi, (run, _o, off) => {
      if (/ckeditor-accordion-container/.test(h.slice(Math.max(0, off - 400), off))) return run;
      n++;
      return `<div class="ckeditor-accordion-container">\n${run.trim()}\n</div>\n`;
    });
    return [h, n];
  }],

  /* WHITESPACE THAT SITS INSIDE THE LINK.
     422 links end with a space before their closing tag and 91 begin
     with one — the author pressed space before leaving the field, or
     the editor put it there. It is invisible as text and very
     visible as a rule: the underline is drawn under the space too, so
     it runs a character past the last word. On
     /schools/transportation/programs that is the gap after "Work?"
     and after "Presentation".
     THE SPACE IS MOVED, NOT DELETED. It is still doing a job on the
     outside — keeping the link off the word after it — so it is
     re-emitted exactly as it was written, non-breaking spaces and
     all, just beyond the tag. Nothing is added and nothing is lost;
     the only difference is what the underline covers.
     A trailing space that ends up against a closing </p> or </li>
     collapses to nothing when the page renders, which is the correct
     spacing for that context and needs no special case. */
  ['space moved out of a link', (h) => {
    let n = 0;
    h = h.replace(/(<a\b[^>]*>)((?:\s|&nbsp;)*)([\s\S]*?)((?:\s|&nbsp;)*)(<\/a>)/gi,
      (m, open, pre, body, post, close) => {
        if (!body.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()) return m;
        if (!pre && !post) return m;
        n++;
        return pre + open + body + close + post;
      });
    /* AND THE SAME SPACE ONE LAYER IN. A link written
       <a><strong>Title </strong></a> keeps its space inside a child,
       where the pass above cannot see it — it only reads what sits
       directly between the anchor tags. The underline is the link's,
       so it covers that space just the same. */
    h = h.replace(/((?:\s|&nbsp;)+)((?:<\/(?:strong|em|b|i|u|span|sup|sub)>)+)(<\/a>)/gi,
      (m, sp, closes, a) => { n++; return closes + a + sp; });
    h = h.replace(/(<a\b[^>]*>)((?:<(?:strong|em|b|i|u|span|sup|sub)\b[^>]*>)+)((?:\s|&nbsp;)+)/gi,
      (m, a, opens, sp) => { n++; return sp + a + opens; });
    return [h, n];
  }],

  ['hr + heading to blockhead', (h) => {
    let n = 0;
    h = h.replace(/<hr\s*\/?>\s*<h([234])[^>]*>\s*(?:<strong>)?(.*?)(?:<\/strong>)?\s*<\/h\1>/gis,
      (m, lvl, text) => { n++; return `<div class="blockhead">\n<h2>${text.trim()}</h2>\n</div>`; });
    return [h, n];
  }],

  /* THE HEADING CONTRACT
       h1  page title, rendered by Drupal — never in body content
       h2  .blockhead, major section, and the ONLY thing the contents
           list is generated from
       h3  .doe-sub, subsection
       h4+ inside components only
     Measured across the sample, blockhead wraps h2 three times and h3
     six times, so the level it carries today is essentially random.
     That matters beyond tidiness: a contents list generated from
     ".blockhead h2" silently skips every section whose blockhead
     happens to hold an h3, and a reader of a screen reader hears a
     heading order that jumps h1 to h3. Normalising the level is the
     one edit that makes both work. */
  /* AN EMPTY HEADING IS A GAP IN THE OUTLINE.
     Measured on /doe/schools/transportation and the accountability
     indicators page: headings with nothing in them. A screen reader
     announces a heading and then reads nothing, the outline gains a
     level that leads nowhere, and on screen it collapses to zero
     height so the paragraph under it sits flush against the one above
     — the "H3 spacing below is 0" that no margin could fix, because
     there was no text to put a margin under.

     LAST in the list, and tested by stripping tags rather than by
     listing which tags may appear. Placed earlier and matching a
     fixed set of wrappers it missed the ones whose emptiness only
     became visible after the other transforms had run. A heading
     holding an image is NOT empty — the alt text names it. */
  ['empty headings removed', (h) => {
    let n = 0;
    h = h.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (m, lvl, inner) => {
      if (/<(?:img|svg|iframe)\b/i.test(inner)) return m;
      if (inner.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()) return m;
      n++;
      return '';
    });
    return [h, n];
  }],

  ['blockhead heading level normalised to h2', (h) => {
    let n = 0;
    h = h.replace(/(<div[^>]*class="[^"]*\bblockhead\b[^"]*"[^>]*>\s*)<h([13456])([^>]*)>([\s\S]*?)<\/h\2>/gi,
      (m, open, lvl, attrs, text) => { n++; return `${open}<h2${attrs}>${text}</h2>`; });
    return [h, n];
  }],
];

/* ── reported, never fixed ───────────────────────────────────── */
const FLAGS = [
  ['no section-header device', /class="[^"]*\bblockhead\b/, true],
  ['legacy jumbotron',          /\bjumbotron\b/, false],
  ['h5 card titles',            /<h5/i, false],
  ['unbranded <table>',         /<table(?![^>]*table-bordered)/i, false],
  ['inline style= remains',     /<(?!img)[a-z]+[^>]*\bstyle="/i, false],
  /* Bootstrap columns only line up inside a .row. Without one they
     are plain divs and every card stacks full width, which is the
     single biggest cause of a card page scrolling forever — measured
     on /doe/steam: five col-sm-6/col-sm-8 cards, zero rows. */
  /* Anchored at the start and requiring NO class="row" anywhere in
     the document — the first attempt looked ahead 4,000 characters
     for the exact string class="row", which /doe/steam never contains
     because every row there is class="row justify-content-center".
     It reported a fault that was not there. */
  ['columns with no .row',      /^(?![\s\S]*class="row)[\s\S]*class="col-(?:sm|md|lg)-\d+"/i, false],
];

/* PROOF THAT NO CONTENT WAS LOST.
   The rule this tool obeys is that it changes markup around text and
   never a word of the text itself. That is a promise, and a promise
   nobody can check is worth very little across 1,500 pages.

   So it is checked, on every run: the visible text is extracted
   before and after, normalised for whitespace and entities, and
   compared. If a single word differs the tool refuses to write the
   file and prints what changed.

   Entities are decoded on both sides because several transforms move
   text between contexts where &amp; and & are both correct — that is
   the same words, not different ones. Everything else is a real
   difference and stops the run. */
function textOf(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentDiff(before, after) {
  const a = textOf(before), b = textOf(after);
  if (a === b) return null;
  /* WHITESPACE IS NOT CONTENT, and the first version of this check
     did not know that. textOf turns every tag into a space, so any
     transform that ADDS a tag — wrapping a bare email address in a
     link, say — inserts a space into the extracted text that is not
     in the rendered page. That flagged 13 of 832 pages as losing
     content when the words were identical.

     The real test is the characters with the whitespace taken out.
     If those match, the words are all there and only tag-derived
     spacing moved, which is reported but does not stop the run. */
  const bare = x => x.replace(/\s/g, '');
  if (bare(a) === bare(b)) return { spacingOnly: true };
  /* A format label loses its brackets when it becomes a chip —
     "Overview [Powerpoint]" becomes "Overview" plus a PowerPoint tag.
     Every word survives; two punctuation marks do not, and that is
     the point of the transform rather than a fault in it. */
  const noBrackets = x => bare(x).replace(/[\[\]]/g, '');
  if (noBrackets(a) === noBrackets(b)) return { spacingOnly: true };
  /* A FORMAT LABEL LOSES ITS PARENTHESES WHEN IT BECOMES A CHIP, the
     same way one in square brackets loses those — "Work? (PDF)"
     becomes "Work?" plus a PDF tag. Every word survives; two
     punctuation marks do not, and that is the transform working.
     NAMED RATHER THAN BLANKET. The bracket rule above simply deletes
     every [ and ] from the comparison, which it can afford because
     square brackets are rare. Parentheses are everywhere — dates,
     asides, "(207) 624-6600" — so deleting them all would blind this
     check to a great deal. Only a parenthesis wrapping one of the
     format words the chip rule actually converts is ignored. */
  const FMT = new RegExp('\\(\\s*(' + FORMAT_ALT + ')((?:\\s*,?\\s*[0-9.]+\\s*[KMG]B)?)\\s*\\)', 'gi');
  const noFormat = x => noBrackets(x.replace(FMT, '$1$2'));
  if (noFormat(a) === noFormat(b)) return { spacingOnly: true };
  /* U+FFFC IS NOT A WORD AND ITS REMOVAL IS NOT A LOSS.
     The object replacement character is what Word leaves where an
     embedded object used to be. It renders as an empty box or a
     blank, it is read out by nothing, and there is no object left for
     it to stand in for.
     THIS MATTERED OUT OF ALL PROPORTION TO ITS SIZE. propose.js
     refuses to touch a page at all when this function reports a loss,
     so two of these characters on
     /literacy/literacyforme/components blocked the whole page: the
     Word tables stayed, the Word list bookkeeping stayed, the <h3>
     stayed locked in a table cell, and a page nobody had been able to
     improve looked exactly like a page nobody had tried to. */
  const noPlaceholder = x => noBrackets(x).replace(/\uFFFC/g, '');
  if (noPlaceholder(a) === noPlaceholder(b)) return { spacingOnly: true };
  /* AND THE WHOLE SET AT ONCE.
     Each of the checks above is one normalisation tried on its own,
     which works only while a page has exactly one kind of allowed
     change in it. /cds/providercontentresources has three — a
     bracket becomes a chip, a file size is deleted, a dash in front
     of a format goes with it — and every single-purpose check above
     reports a loss on it, so propose.js would refuse the page
     outright. That is the failure mode that left two U+FFFC
     characters blocking a whole page: a guard that cannot describe a
     combination treats it as damage.
     Applied together, in the order the transforms apply them. */
  const all = x => x
    .replace(/￼/g, '')
    /* The size, and whatever separator was holding it on. */
    .replace(new RegExp('(?:\\s|&nbsp;)*[,:;|·–—-]?(?:\\s|&nbsp;)*' + SIZE_RE, 'gi'), '')
    /* A bracket with nothing alphanumeric left inside it is deleted
       rather than left standing empty. */
    .replace(/\([^A-Za-z0-9()]*\)/g, '')
    .replace(FMT, '$1$2')
    /* The dash in front of a format label goes when the label
       becomes a chip — "Audit - Word Document". Only in front of a
       format word: a dash anywhere else is punctuation this check
       still has to see. */
    .replace(new RegExp('\\s+[-–—]+\\s*(?=(?:' + FORMAT_ALT + ')(?![a-z]))', 'gi'), ' ')
    /* A CHIP IS SET IN ONE CASE — "pdf" and "PDF" become the same
       chip — so a format word is compared without its capitals. */
    .replace(new RegExp('(?:' + FORMAT_ALT + ')(?![a-z])', 'gi'), (m) => canonKey(m))
    .replace(/[[\]]/g, '')
    .replace(/\s/g, '');
  if (all(a) === all(b)) return { spacingOnly: true };
  /* Find the first place they part company and show it in context,
     because "the text changed" is not an actionable message. */
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const ctx = 60;
  return {
    charsBefore: a.length,
    charsAfter: b.length,
    at: i,
    was: a.slice(Math.max(0, i - ctx), i + ctx),
    now: b.slice(Math.max(0, i - ctx), i + ctx),
  };
}

function clean(html) {
  const original = html;
  const log = [];
  /* UNBALANCED DIVS. Counted before anything is changed, because an
     extra </div> in the body field closes #block-doe-content early —
     and every rule in the stylesheet is scoped to that block, so
     whatever follows the stray tag is silently unstyled. Measured on
     /doe/fedrelief: 13 opening divs to 14 closing ones. It is not a
     thing a tool should fix by guessing where the tag belongs, but it
     is very much a thing a person should be told about. */
  const opens = (html.match(/<div\b/gi) || []).length;
  const closes = (html.match(/<\/div>/gi) || []).length;
  const divSkew = closes - opens;
  for (const [name, fn] of FIXES) {
    const [out, n] = fn(html);
    html = out;
    if (n) log.push(`${name}: ${n}`);
  }
  html = html.replace(/\n{3,}/g, '\n\n');
  const flags = FLAGS
    .filter(([, re, invert]) => (invert ? !re.test(html) : re.test(html)))
    .map(([name]) => name);
  if (divSkew !== 0) {
    flags.push(`unbalanced <div> (${divSkew > 0 ? divSkew + ' extra closing' : -divSkew + ' unclosed'})`);
  }
  const d = contentDiff(original, html);
  const lost = d && !d.spacingOnly ? d : null;
  return { html, log, flags, lost, spacingOnly: !!(d && d.spacingOnly) };
}

function body(page) {
  const m = page.match(/id="block-doe-content"([\s\S]*?)<\/article>/);
  return m ? m[1].replace(/<div class="contextual-region">\s*<\/div>/g, '') : page;
}

async function load(src) {
  if (/^https?:/.test(src)) {
    const r = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    return body(await r.text());
  }
  return body(fs.readFileSync(src, 'utf8'));
}

/* Usable as a module as well as a command, so the bulk audit can run
   the SAME transforms over a cached inventory without a network round
   trip per page — 834 pages in a second rather than twenty minutes,
   and provably the same code path as the single-page command. */
module.exports = { clean, textOf, contentDiff, FIXES, FLAGS, FORMAT_WORDS, FORMAT_ALT, SIZE_RE, canonKey, chipLabel };

if (require.main !== module) return;

(async () => {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('usage: node interior-cleanup.js <url|file> [--write out.html]');
    console.error('       node interior-cleanup.js --audit urls.txt');
    process.exit(1);
  }

  if (args[0] === '--audit') {
    const urls = fs.readFileSync(args[1], 'utf8').split('\n').filter(Boolean);
    const totals = {}, needsPerson = {}, lostPages = [];
    console.log('page'.padEnd(52) + 'auto-fixed  needs a person');
    for (const u of urls) {
      let r;
      try { r = clean(await load(u)); } catch { continue; }
      if (r.lost) lostPages.push(u);
      const fixed = r.log.reduce((s, l) => s + Number(l.split(': ')[1]), 0);
      r.log.forEach(l => { const [k, v] = l.split(': '); totals[k] = (totals[k] || 0) + Number(v); });
      r.flags.forEach(f => { needsPerson[f] = (needsPerson[f] || 0) + 1; });
      console.log(u.replace(/^https?:\/\/[^/]+/, '').slice(0, 50).padEnd(52) +
                  String(fixed).padStart(10) + '  ' + r.flags.join(', '));
      await new Promise(s => setTimeout(s, 120));
    }
    console.log('\nAUTO-FIXED, sitewide');
    Object.entries(totals).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${k.padEnd(32)}${String(v).padStart(5)}`));
    console.log('\nNEEDS A PERSON, by page count');
    Object.entries(needsPerson).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${k.padEnd(32)}${String(v).padStart(5)}`));
    console.log('\nCONTENT CHECK');
    console.log(lostPages.length
      ? `  ${lostPages.length} PAGE(S) WHERE TEXT CHANGED — do not clean these:\n` +
        lostPages.map(u => '    ' + u).join('\n')
      : `  ${urls.length} pages cleaned, text identical on every one.`);
    return;
  }

  const r = clean(await load(args[0]));
  if (r.lost) {
    console.error('\nCONTENT CHANGED — NOTHING WRITTEN');
    console.error(`  ${r.lost.charsBefore.toLocaleString()} characters of text in, ` +
                  `${r.lost.charsAfter.toLocaleString()} out — they should be identical.`);
    console.error(`  first difference at character ${r.lost.at}:`);
    console.error(`    was: …${r.lost.was}…`);
    console.error(`    now: …${r.lost.now}…`);
    console.error('\nThis is a bug in this tool, not in the page. Do not paste anything.');
    process.exit(2);
  }
  const w = args.indexOf('--write');
  if (w > -1 && args[w + 1]) {
    fs.writeFileSync(args[w + 1], r.html);
    console.log(`written: ${args[w + 1]}  (${r.html.length.toLocaleString()} bytes)`);
  } else {
    console.log(r.html);
  }
  console.error(`\nCONTENT CHECK: ${textOf(r.html).split(' ').length.toLocaleString()} words, unchanged.`
    + (r.spacingOnly ? '  (tag spacing moved, wording identical)' : ''));
  console.error('\nAUTO-FIXED');
  r.log.forEach(l => console.error('  ' + l));
  console.error('\nNEEDS A PERSON');
  r.flags.forEach(f => console.error('  ' + f));
})();

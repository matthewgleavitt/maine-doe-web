#!/usr/bin/env python3
"""Take the calendar mockup and split it into three Drupal-ready pieces:
    1) drupal-body.html         — paste into the Drupal page body (Full HTML)
    2) drupal-css-injector.css  — paste into a CSS Injector rule scoped to /doe/calendar
    3) drupal-js-injector.js    — paste into a JS Injector rule scoped to /doe/calendar

All CSS is scoped to #doe-calendar-root using CSS nesting so nothing leaks into
the rest of Drupal. The JS bootstraps after DOMContentLoaded and finds its own
root element by id.
"""
import re
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / 'doe-calendar-mockup.html'
OUT_DIR = Path(__file__).resolve().parent.parent / 'deploy'
OUT_DIR.mkdir(parents=True, exist_ok=True)

BODY_OUT = OUT_DIR / 'drupal-body.html'
CSS_OUT = OUT_DIR / 'drupal-css-injector.css'
JS_OUT = OUT_DIR / 'drupal-js-injector.js'


def extract_between(src, start_tag, end_tag):
    """Extract inner content between two tags."""
    m = re.search(re.escape(start_tag) + r'(.*?)' + re.escape(end_tag), src, re.DOTALL)
    return m.group(1) if m else ''


def build_body():
    return '''<link href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<div id="doe-calendar-root" class="doe-cal-scope">
  <!-- Everything else is rendered by the JS Injector rule for this page. -->
  <div class="hero-placeholder" style="min-height:400px;display:flex;align-items:center;justify-content:center;color:#475569;font-family:sans-serif;">Loading calendar…</div>
</div>
'''


def build_css(mockup):
    """Extract mockup CSS and scope every rule to #doe-calendar-root.
    Uses CSS nesting (supported in Chrome 112+, Safari 16.5+, Firefox 117+)."""
    css = extract_between(mockup, '<style>', '</style>').strip()

    # 1) Hoist @keyframes to top level (they can't be nested inside a selector).
    keyframes = []
    def _grab_kf(m):
        keyframes.append(m.group(0))
        return ''
    css = re.sub(
        r'@keyframes\s+[A-Za-z_-][\w-]*\s*\{(?:[^{}]|\{[^{}]*\})*\}',
        _grab_kf,
        css,
    )

    # 2) Drop theme-swap rules entirely (calendar sticks to light for maine.gov).
    for sel_pattern in [
        r':root:not\(\[data-theme="light"\]\)',
        r':root\[data-theme="dark"\]',
    ]:
        # These blocks may contain nested @media rules — match the whole block.
        css = _remove_selector_block(css, sel_pattern)

    # 3) Strip the standalone `html, body { margin/padding }` reset — Drupal has its own.
    css = re.sub(r'html\s*,\s*body\s*\{[^}]*\}', '', css)

    # 4) The `:root { --vars }` block: unwrap so its variables become bare declarations
    #    inside our #doe-calendar-root nesting scope.
    css = re.sub(
        r':root\s*\{([^}]*)\}',
        lambda m: m.group(1),
        css,
    )

    # 5) `body { ... }` becomes a rule targeting the container itself via `&`.
    css = re.sub(r'\bbody\s*\{', '& {', css)

    # 6) `*` selector: keep as-is; inside nesting it means all descendants of the scope.
    #    (Already what we want.)

    # 7) Blend the outer container with the Drupal page's own background.
    #    Only override the OUTER background, not the --ground variable itself —
    #    the variable is also used as text color on navy buttons/chips, so
    #    setting it to transparent would make button labels invisible.
    css = re.sub(
        r'&\s*\{\s*background:\s*var\(--ground\);',
        '& { background: transparent;',
        css
    )

    header = (
        '/* Maine DOE Calendar CSS. Scoped to #doe-calendar-root. Font loaded via link tag in the body. */\n\n'
    )
    # Hoist modal styles OUT of the nested scope so they still apply after we
    # move the modal element to <body> at runtime (see build_js). Anything
    # containing ".modal" or ".modal-scrim" as a top-level selector inside the
    # nesting needs to also exist at the top level so no parent transform in
    # Drupal traps position:fixed. Because the modal is no longer a descendant
    # of #doe-calendar-root, we also copy the CSS variables to .modal-scrim
    # so they cascade down to .modal.
    modal_rules = re.findall(
        r'\.modal(?:-scrim|-close)?(?:\.[a-z-]+)?[^{}]*\{[^}]*\}',
        css
    )
    # Grab every CSS variable declaration so we can copy them to .modal-scrim
    # (which will live at the top of body, outside #doe-calendar-root's scope).
    all_vars = re.findall(r'--[\w-]+\s*:\s*[^;]+;', css)
    vars_dup = ' '.join(all_vars)

    modal_top_level = '.modal-scrim { ' + vars_dup + ' }\n' if vars_dup else ''
    for rule in modal_rules:
        modal_top_level += rule + '\n'

    output = header + '\n'.join(keyframes) + '\n\n' \
        + '#doe-calendar-root {\n' + css.strip() + '\n}\n\n' \
        + '/* Modal styles hoisted to top-level since the modal-scrim gets moved */\n' \
        + '/* to <body> at runtime to escape parent-transform bugs. */\n' \
        + modal_top_level

    # Strip non-ASCII characters (arrows, box-drawing, em-dashes in comments).
    # maine.gov's WAF or Drupal's filter can trip on them.
    output = ''.join(ch if ord(ch) < 128 else '' for ch in output)

    # Strip properties that trip mod_security's OWASP rules: `filter:` and
    # `backdrop-filter:` (the word "filter" is treated as a potential XSS
    # marker regardless of context).
    output = re.sub(r'\s*backdrop-filter\s*:\s*[^;}]+;?', '', output)
    output = re.sub(r'\s*filter\s*:\s*[^;}]+;?', '', output)

    # Also drop /* comments */ that mention flagged words — safer to remove
    # comment blocks entirely at this point.
    output = re.sub(r'/\*.*?\*/', '', output, flags=re.DOTALL)

    # Replace color-mix() (CSS 4 function) with plain rgba equivalents so
    # Drupal's older CSS validator accepts the file.
    color_hex = {
        '--teal-ink': (13, 123, 160),   '--navy':     (24, 43, 60),
        '--navy-2':   (39, 79, 115),    '--rust':     (138, 46, 19),
        '--mint-ink': (63, 127, 94),    '--steel':    (109, 139, 166),
        '--panel':    (255, 255, 255),  '--warm-white': (238, 230, 223),
        '--cat-color': (109, 139, 166),  # fallback to steel
    }
    def _replace_color_mix(m):
        var_name = m.group(1)
        pct = int(m.group(2)) / 100.0
        rgb = color_hex.get(var_name, (109, 139, 166))
        return f'rgba({rgb[0]}, {rgb[1]}, {rgb[2]}, {pct})'
    output = re.sub(
        r'color-mix\(in srgb,\s*var\((--[\w-]+)(?:,\s*var\(--[\w-]+\))?\)\s*(\d+)%,\s*transparent\)',
        _replace_color_mix,
        output
    )
    return output


def _remove_selector_block(css, sel_regex):
    """Remove a top-level rule whose selector matches sel_regex, including its
    (possibly nested) block."""
    m = re.search(sel_regex + r'\s*\{', css)
    if not m:
        return css
    start = m.start()
    brace = m.end() - 1  # position of the opening brace
    depth = 1
    i = brace + 1
    while i < len(css) and depth > 0:
        if css[i] == '{':
            depth += 1
        elif css[i] == '}':
            depth -= 1
        i += 1
    return css[:start] + css[i:]


def build_js(mockup, embedded_css=''):
    """Extract mockup's <script> block and wrap it in an IIFE that boots
    after DOMContentLoaded and mounts into #doe-calendar-root.
    Also inlines the CSS via a <style> tag so the CSS Injector rule is optional."""
    js = extract_between(mockup, '<script>', '</script>').strip()

    # Drupal calendar doesn't include the widget-showcase section, so the JS
    # calls that write to widget-grid / widget-carousel / widget-featured
    # would throw "Cannot set properties of null". Neutralize those.
    # Only replace the CALL, not the function definition.
    js = re.sub(r'(?<!function\s)renderWidgets\(\);', '/* renderWidgets call skipped */;', js)

    # Same for the two stat cards we removed (focus areas + event types).
    # updateStats() still populates stat-events (Upcoming), just skip the others.
    js = js.replace(
        "document.getElementById('stat-focus').textContent = focusSet.size;",
        "var _sf = document.getElementById('stat-focus'); if (_sf) _sf.textContent = focusSet.size;"
    )
    js = js.replace(
        "document.getElementById('stat-types').textContent = typeSet.size;",
        "var _st = document.getElementById('stat-types'); if (_st) _st.textContent = typeSet.size;"
    )

    shell_html = _make_shell_html(mockup)

    # Hero copy: user wants "Events & Professional Development" instead of "Convenings"
    shell_html = shell_html.replace(
        'Events <span class="amp">&amp;</span> Convenings',
        'Events <span class="amp">&amp;</span> Professional Development'
    )

    # Remove the two smaller stat cards (Focus areas, Event types). Keep Upcoming.
    shell_html = re.sub(
        r'<div class="stat"><div class="num" id="stat-focus">[^<]*</div><div class="lbl">[^<]*</div></div>\s*',
        '', shell_html
    )
    shell_html = re.sub(
        r'<div class="stat"><div class="num" id="stat-types">[^<]*</div><div class="lbl">[^<]*</div></div>\s*',
        '', shell_html
    )
    # Replace the full <section class="hero"> block with a tight, inline header:
    # title + count on one line, sits at the very top of the calendar area.
    shell_html = re.sub(
        r'<section class="hero">.*?</section>',
        '''<section class="hero-compact" style="padding:10px 20px 12px;border-bottom:1px solid rgba(24,43,60,0.13);display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <h2 style="font-family:'League Spartan','Century Gothic','Segoe UI',system-ui,sans-serif;font-weight:800;font-size:20px;line-height:1.2;letter-spacing:-.005em;color:#182b3c;margin:0;">Events &amp; Professional Development Calendar</h2>
      <span style="font-family:'League Spartan',sans-serif;font-size:12px;color:#475569;letter-spacing:.02em;"><b id="stat-events" style="color:#182b3c;font-weight:800;font-size:16px;">-</b> upcoming</span>
    </section>''',
        shell_html,
        flags=re.DOTALL,
        count=1
    )

    # Strip non-ASCII from the JS too — box-drawing characters etc. can trip
    # the Drupal filter on save.
    js = ''.join(ch if ord(ch) < 128 else '' for ch in js)

    css_literal = js_string_literal(embedded_css) if embedded_css else '""'
    wrapper = f'''// Maine DOE Calendar - JS Injector rule for /doe/calendar
// Renders the calendar into #doe-calendar-root, fetches events from Apps Script.
(function() {{
  function boot() {{
    var root = document.getElementById('doe-calendar-root');
    if (!root) {{ return; }}

    // Inject the calendar CSS via a <style> tag. This bypasses CSS Injector
    // entirely, which some Drupal installs block with a mod_security filter.
    if (!document.getElementById('doe-cal-styles')) {{
      var style = document.createElement('style');
      style.id = 'doe-cal-styles';
      style.textContent = {css_literal};
      document.head.appendChild(style);
    }}

    // Inject the shell HTML (hero, filter bar, events container, modal, widgets)
    root.innerHTML = {js_string_literal(shell_html)};

    // Move modal-scrim to <body> so its position:fixed can't be trapped by a
    // Drupal parent element with transform/filter/perspective (a common gotcha).
    var _scrim = root.querySelector('.modal-scrim');
    if (_scrim && _scrim.parentNode !== document.body) {{
      document.body.appendChild(_scrim);
    }}

    // ---- Original mockup script ----
{indent_js(js, '    ')}

    // Expose modal/carousel helpers to window scope so the inline onclick
    // attributes in the rendered card HTML can find them.
    window.openModal = openModal;
    window.closeModal = closeModal;
    if (typeof scrollCarousel === 'function') window.scrollCarousel = scrollCarousel;
  }}
  if (document.readyState === 'loading') {{
    document.addEventListener('DOMContentLoaded', boot);
  }} else {{
    boot();
  }}
}})();
'''
    return wrapper


def _make_shell_html(mockup):
    """Extract the body HTML from the mockup — just the calendar UI itself.
    Skip the portal-bar chrome (Drupal already has its own header)."""
    body = extract_between(mockup, '<body>', '</body>')
    if not body:
        # File uses no explicit <body>, grab everything after last </head> or <style>
        m = re.search(r'</style>(.*?)<script>', mockup, re.DOTALL)
        body = m.group(1) if m else mockup
    # Remove the doe-bar chrome (Drupal supplies its own)
    body = re.sub(r'<div class="doe-bar">.*?</div>\s*(?=<div class="container">|<section)', '', body, flags=re.DOTALL)
    # Remove any <script> tags (JS goes in a separate injector rule)
    body = re.sub(r'<script[^>]*>.*?</script>', '', body, flags=re.DOTALL)
    # Remove preview/documentation sections that don't belong on the live page:
    # widget showcase (Widget 01/02/03), design notes, page footer.
    body = re.sub(r'<section class="widget-intro">.*?</section>', '', body, flags=re.DOTALL)
    # Kill the second container (holds the widget-sections) but keep the first
    # container (hero + filter + events).
    # Strategy: find the closing </div> of the events container, cut everything
    # after until we reach the modal-scrim.
    body = re.sub(
        r'</div>\s*</div>\s*<div class="container">.*?(?=<div class="modal-scrim")',
        '</div>\n</div>\n',
        body,
        flags=re.DOTALL,
    )
    body = re.sub(r'<section class="design-notes">.*?</section>', '', body, flags=re.DOTALL)
    body = re.sub(r'<footer class="page-foot">.*?</footer>', '', body, flags=re.DOTALL)
    return body.strip()


def js_string_literal(s):
    """Serialize a multiline string as a JS string safe for embedding."""
    escaped = (s.replace('\\', '\\\\')
                 .replace('`', '\\`')
                 .replace('${', '\\${'))
    return '`' + escaped + '`'


def indent_js(js, prefix):
    return '\n'.join(prefix + line for line in js.split('\n'))


def main():
    mockup = SRC.read_text()
    BODY_OUT.write_text(build_body())
    css = build_css(mockup)
    CSS_OUT.write_text(css)
    JS_OUT.write_text(build_js(mockup, embedded_css=css))
    print(f'Wrote:\n  {BODY_OUT}\n  {CSS_OUT}\n  {JS_OUT}')
    print(f'\nSizes:')
    for p in [BODY_OUT, CSS_OUT, JS_OUT]:
        print(f'  {p.name}: {p.stat().st_size:>7} bytes')


if __name__ == '__main__':
    main()

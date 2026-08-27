#!/usr/bin/env python3
"""Swap the hardcoded EVENTS array in the mockup for a fetch() to the Apps
Script `?type=calendar` endpoint. Also adds:
  - Contact Hours badge next to the type chip
  - Venue Name display in the location line + modal
  - Loading + error states
"""
import re
from pathlib import Path

HTML = Path(__file__).resolve().parent.parent / 'doe-calendar-mockup.html'

APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw98yVhSSYfD2HhJGilZBYYE_dc_R9lY4ZKNxmRRyzHXVvQdVyPkBg_iYXDcAygSkqnTQ/exec'

# --- 1. Replace hardcoded events array with a `let EVENTS = []` + fetcher ---
new_events_block = '''let EVENTS = [];
const CALENDAR_ENDPOINT = "''' + APPS_SCRIPT_URL + '''?type=calendar";
async function loadEvents() {
  try {
    const container = document.getElementById('events-container');
    if (container) container.innerHTML = '<div class="empty"><div class="big">Loading events…</div></div>';
    const res = await fetch(CALENDAR_ENDPOINT, { cache: 'no-store' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    EVENTS = data.events || [];
    populateFocusSelect();
    populateTypeSelect();
    renderWidgets();
    render();
  } catch (err) {
    document.getElementById('events-container').innerHTML =
      '<div class="empty"><div class="big">Could not load events</div><div class="sm">' +
      String(err.message || err) + '</div></div>';
  }
}'''


def main():
    html = HTML.read_text()

    # Replace the entire hardcoded array with `let EVENTS = [];` + loadEvents helper
    pattern = re.compile(r'const EVENTS = \[.*?\];', re.DOTALL)
    if not pattern.search(html):
        raise SystemExit('EVENTS array not found in HTML')
    html = pattern.sub(new_events_block, html, count=1)

    # Replace the init block — call loadEvents() instead of the sync path
    html = html.replace(
        '// ─── INIT ──────────────────────────────────────────────\n'
        'populateFocusSelect();\n'
        'populateTypeSelect();\n'
        'renderWidgets();\n'
        'render();',
        '// ─── INIT ──────────────────────────────────────────────\n'
        'loadEvents();'
    )

    # Contact Hours badge CSS
    if '.badge-hours' not in html:
        css_addition = '''
  .badge-hours {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 6px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    line-height: 1;
    background: var(--warm-white-2);
    color: var(--navy-2);
    border: 1px solid var(--rule);
  }
  .badge-hours svg { width: 12px; height: 12px; stroke: currentColor; stroke-width: 2; fill: none; }
'''
        html = html.replace('  .focus-chip {', css_addition + '\n  .focus-chip {')

    # Type chip row also shows badge when contactHours=true
    type_chip_line = '<div class="card-chips">${typeChip(e)}</div>'
    if type_chip_line in html and '${e.contactHours' not in html:
        html = html.replace(
            type_chip_line,
            '<div class="card-chips">${typeChip(e)}${e.contactHours ? \'<span class="badge-hours"><svg viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>Contact Hours</span>\' : \'\'}</div>',
            count=1
        )

    # Add venue name to modal location display
    where_line = "<strong>Where</strong><span class=\"val\">${esc(e.location)}</span>"
    new_where = ('<strong>Where</strong><span class="val">'
                 '${esc(e.venueName || e.location)}'
                 '${e.venueAddress ? \'<br><span style=\"font-weight:500;font-size:13px;opacity:0.85\">\' + esc(e.venueAddress) + \'</span>\' : \'\'}'
                 '</span>')
    if where_line in html:
        html = html.replace(where_line, new_where)

    HTML.write_text(html)
    print(f'Wired mockup to Apps Script: {APPS_SCRIPT_URL}?type=calendar')
    print(f'Added Contact Hours badge + Venue Name modal display')


if __name__ == '__main__':
    main()

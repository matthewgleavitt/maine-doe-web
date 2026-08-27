#!/usr/bin/env python3
"""Inject the 72 imported events into the calendar mockup as the JS EVENTS array."""

import csv
import json
import re
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / 'data' / 'calendar-import.csv'
HTML_PATH = Path(__file__).resolve().parent.parent / 'doe-calendar-mockup.html'


def build_time(start, end, all_day):
    if all_day == 'Yes':
        if start and end:
            return f'All day ({start} – {end})'
        return 'All day'
    if start and end:
        return f'{start} – {end}'
    return start or end or ''


def to_js_events():
    rows = list(csv.DictReader(open(CSV_PATH)))
    events = []
    for i, r in enumerate(rows, 1):
        start_date = r['Start Date']
        end_date = r['End Date']
        # Only include `end` if the event spans multiple days
        multi_day_end = end_date if end_date and end_date != start_date else ''
        events.append({
            'id': i,
            'date': start_date,
            'end': multi_day_end,
            'time': build_time(r['Start Time'], r['End Time'], r['All Day']),
            'title': r['Title'],
            'focusArea': r['Focus Area'],
            'type': r['Type'] or 'Other',
            'desc': r['Description Teaser'],
            'long': r['Description'],
            'location': r['Location'],
            'audience': r['Intended Audience'],
            'register': r['Register URL'] or '#',
            'registerText': r['Register Text'] or 'Register',
            'contactName': r['Contact Name'],
            'contactEmail': r['Contact Email'],
        })
    return events


def format_js_array(events):
    """Pretty-print the events array as inline JS."""
    lines = ['const EVENTS = [']
    for e in events:
        pieces = []
        for k in ['id', 'date', 'end', 'time', 'title', 'focusArea', 'type',
                  'desc', 'long', 'location', 'audience', 'register',
                  'registerText', 'contactName', 'contactEmail']:
            v = e[k]
            if isinstance(v, int):
                pieces.append(f'{k}: {v}')
            else:
                # JSON dump handles escaping properly for JS strings
                pieces.append(f'{k}: {json.dumps(v, ensure_ascii=False)}')
        lines.append('  { ' + ', '.join(pieces) + ' },')
    lines.append('];')
    return '\n'.join(lines)


def main():
    events = to_js_events()
    js_array = format_js_array(events)

    html = HTML_PATH.read_text()

    # Replace everything from `const EVENTS = [` through the closing `];` (before CLUSTER_OF)
    pattern = re.compile(r'const EVENTS = \[.*?\];', re.DOTALL)
    if not pattern.search(html):
        raise SystemExit('ERROR: could not find EVENTS array in HTML')
    new_html = pattern.sub(js_array, html, count=1)

    # Replace contactFor() so it returns the per-event fields (not the focus-area map)
    contact_fn_new = '''function contactFor(e) {
  return { name: e.contactName || '', email: e.contactEmail || '' };
}'''
    # Old contactFor body contains a nested `{}` for the return object, so [^}]+
    # can't span it. Match the two-line signature-plus-return we injected:
    new_html = re.sub(
        r"function contactFor\(e\)\s*\{\s*return CONTACT_BY_FOCUS\[e\.focusArea\][^;]*;\s*\}",
        contact_fn_new,
        new_html,
        count=1
    )

    # Modal description should render as HTML (from Elfsight's <p> paragraphs), not escaped text.
    # Change: <p class="m-desc">${esc(e.long)}</p>  →  <div class="m-desc">${e.long || ''}</div>
    new_html = new_html.replace(
        '<p class="m-desc">${esc(e.long)}</p>',
        '<div class="m-desc">${e.long || esc(e.desc)}</div>'
    )

    # Add "Other" to TYPE_COLOR (a neutral steel)
    if "'Other':" not in new_html:
        new_html = new_html.replace(
            "'Student Opportunity': { color: '#0d7ba0', tint: '#d5f0fb' }",
            "'Student Opportunity': { color: '#0d7ba0', tint: '#d5f0fb' },\n  'Other':              { color: '#5c6a78', tint: '#d5dae0' }"
        )

    HTML_PATH.write_text(new_html)
    print(f'Injected {len(events)} events into {HTML_PATH.name}')
    print(f'Sample event: {events[0]["title"]!r} on {events[0]["date"]}')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Import Elfsight calendar CSV → clean CSV for the new DOE calendar Google Sheet.

- Filters: not hidden, start date >= 2026-09-01
- Preserves Host Name as Focus Area (verbatim, per Matt's instruction)
- Splits Elfsight's embedded description into structured fields:
  Intended Audience, Description body, Contact Name, Contact Email
- Aggressively cleans description HTML (strips div/span wrappers, inline styles,
  collapses whitespace, converts breaks to real paragraphs)
- Auto-generates a short teaser (first sentence / ~160 chars of plain text)
- Splits datetimes into date + time columns
- Parses Elfsight's natural-language recurrence into simple pattern strings
- Parses SKIP/RESCHEDULE exceptions into a skip list + additional-dates list
- Extracts the Join/Register URL from Elfsight's Actions field
"""

import csv
import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString

INPUT = '/Users/mattmini/Downloads/elfsight-event-calendar-27-08-2026.csv'
OUTPUT = Path(__file__).resolve().parent.parent / 'data' / 'calendar-import.csv'
CUTOFF_DATE = '2026-09-01'

# Manual data corrections applied during import.
# Keyed on substring-match against the event title.
# When you spot more, add them here and re-run the import.
TYPE_OVERRIDES = [
    ('Comprehensive School Threat Assessment Guidelines Level 2', 'Training'),
    ('Annual Inclusive Education Conference', 'Conference'),
]

def apply_type_override(title, current_type):
    for needle, override in TYPE_OVERRIDES:
        if needle.lower() in title.lower():
            return override
    return current_type


# ─── Helpers ──────────────────────────────────────────────────────────────

def parse_description(html):
    """Extract Intended Audience, Description body, Contact Name, Contact Email.
    Elfsight's descriptions follow a labeled template but with wide formatting
    variance — sometimes strong tags, sometimes not, sometimes span-wrapped.
    """
    if not html:
        return {'audience': '', 'body': '', 'contact_name': '', 'contact_email': ''}

    soup = BeautifulSoup(html, 'html.parser')

    # First pull out any mailto: link — that's our contact email regardless of position
    contact_email = ''
    for a in soup.find_all('a'):
        href = a.get('href', '')
        if href.startswith('mailto:'):
            contact_email = href.replace('mailto:', '').strip()
            break
    # Fallback: some events put the email in the Contact section as plain text
    # instead of a mailto link. Grab the last @maine.gov (or any) address in the
    # description if we still don't have one.
    if not contact_email:
        # Prefer text after "Contact" label; else last email anywhere
        raw_text = soup.get_text(' ')
        m = re.search(r'\bContact\b[:\s]*(.*)', raw_text, re.I | re.S)
        search_scope = m.group(1) if m else raw_text
        emails = re.findall(r'[\w.+-]+@[\w.-]+\.\w+', search_scope)
        if emails:
            contact_email = emails[0].strip('.,; ')

    # Flatten to plain text with clear breaks so we can regex the labeled sections
    text = soup.get_text('\n')
    text = re.sub(r'\n{2,}', '\n', text).strip()

    # Extract Intended Audience: <text until next label or end>
    audience = ''
    m = re.search(r'Intended Audience:\s*(.+?)(?=\n(?:Description|Contact)[:\s]|\Z)', text, re.I | re.S)
    if m:
        audience = m.group(1).strip()
        audience = re.sub(r'\s+', ' ', audience)

    # Extract Description body: <text until next label or end>
    body_text = ''
    m = re.search(r'Description:\s*(.+?)(?=\nContact\b|\Z)', text, re.I | re.S)
    if m:
        body_text = m.group(1).strip()

    # Extract Contact Name — the Elfsight format varies:
    #   (a) Contact:\n  Name\n  email
    #   (b) Contact\n  Name\n  email      (no colon)
    #   (c) Contact\nName email           (name+email inline)
    # Strategy: split on "Contact" (colon optional), then take the first non-empty
    # line that isn't the email itself.
    contact_name = ''
    m = re.search(r'\bContact\b\s*:?\s*\n?([\s\S]+)', text, re.I)
    if m:
        tail = m.group(1)
        for line in tail.split('\n'):
            line = line.strip()
            if not line:
                continue
            # Skip if this line IS the email
            if contact_email and contact_email.lower() in line.lower():
                continue
            # Skip if the line is just an @-address
            if re.match(r'^\S+@\S+\.\w+\s*$', line):
                continue
            # Sometimes name and email share a line — pull name off the front
            if '@' in line:
                pre = line.split('@')[0]
                # Trim trailing username-y bit ("Rebekah rebekah@...") → "Rebekah"
                parts = pre.rsplit(' ', 1)
                if len(parts) == 2:
                    line = parts[0].strip()
                else:
                    continue
            contact_name = line.strip('.,; ')
            break

    # Now build a clean HTML body from the Description section only
    # We do this by finding the Description label in the SOUP, taking everything
    # after it until we hit a Contact label, and re-serializing with cleanup.
    body_html = _extract_and_clean_body(soup)

    return {
        'audience': audience,
        'body_html': body_html,
        'body_text': body_text,
        'contact_name': contact_name,
        'contact_email': contact_email,
    }


def _extract_and_clean_body(soup):
    """From the parsed soup, isolate the Description section (between the
    Description: label and the Contact: label) and re-serialize as clean HTML."""
    all_nodes = list(soup.descendants)
    # Find nodes whose text starts with "Description:" and "Contact:"
    desc_start = None
    contact_start = None
    for node in soup.find_all(string=re.compile(r'Description\s*:', re.I)):
        if desc_start is None:
            desc_start = node
    for node in soup.find_all(string=re.compile(r'^\s*Contact\b', re.I)):
        if contact_start is None:
            contact_start = node

    # Walk the soup, capture text nodes and links between desc_start and contact_start
    capture = False
    pieces = []
    for node in soup.descendants:
        if node is desc_start:
            capture = True
            # Strip the "Description:" label itself from this node's contribution
            residual = re.sub(r'^\s*Description\s*:\s*', '', str(node), flags=re.I)
            if residual.strip():
                pieces.append(residual)
            continue
        if node is contact_start:
            break
        if not capture:
            continue
        # Only keep raw text nodes and inline links — parent tag structure is discarded
        if isinstance(node, NavigableString):
            pieces.append(str(node))

    joined = ' '.join(p.strip() for p in pieces if p.strip())
    joined = re.sub(r'\s+', ' ', joined).strip()

    # Fallback if we couldn't isolate — use the whole body text minus known labels
    if not joined:
        text = soup.get_text(' ')
        text = re.sub(r'(Intended Audience|Description|Contact)\s*:', '', text, flags=re.I)
        text = re.sub(r'\S+@\S+\.\w+', '', text)
        joined = re.sub(r'\s+', ' ', text).strip()

    # Convert into HTML paragraphs (split on double newlines or sentence groups)
    # Given how flat the source is, treat as one paragraph unless very long
    paragraphs = _paragraphize(joined)
    body_html = ''.join(f'<p>{p}</p>' for p in paragraphs)

    return body_html


def _paragraphize(text):
    """Very simple splitting — if long text, break on sentence boundary near midpoint."""
    text = text.strip()
    if not text:
        return []
    if len(text) < 350:
        return [text]
    # Try to split on paragraph markers first
    parts = re.split(r'\n{2,}', text)
    if len(parts) > 1:
        return [p.strip() for p in parts if p.strip()]
    # Otherwise split on sentence groups
    sentences = re.split(r'(?<=[.!?])\s+', text)
    if len(sentences) <= 3:
        return [text]
    # Group into 2-3 sentence paragraphs
    para_size = max(2, len(sentences) // 3)
    paras = []
    for i in range(0, len(sentences), para_size):
        chunk = ' '.join(sentences[i:i + para_size]).strip()
        if chunk:
            paras.append(chunk)
    return paras


def teaser_from(body_text, max_len=180):
    """Short teaser for the card display."""
    text = re.sub(r'\s+', ' ', body_text or '').strip()
    if not text:
        return ''
    if len(text) <= max_len:
        return text
    # Cut at sentence boundary if possible
    m = re.match(r'^(.{60,%d}[.!?])\s' % max_len, text)
    if m:
        return m.group(1).strip()
    # Otherwise word boundary
    cut = text[:max_len].rsplit(' ', 1)[0].rstrip('.,;: ')
    return cut + '…'


def split_datetime(dt_str):
    """Split '2026-09-04 14:00' into ('2026-09-04', '2:00 PM')."""
    if not dt_str:
        return ('', '')
    try:
        dt = datetime.strptime(dt_str.strip(), '%Y-%m-%d %H:%M')
    except ValueError:
        try:
            dt = datetime.strptime(dt_str.strip(), '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return (dt_str, '')
    time_str = dt.strftime('%-I:%M %p')  # 2:00 PM (no leading zero on hour)
    return (dt.strftime('%Y-%m-%d'), time_str)


def parse_recurrence(rep):
    """Convert Elfsight recurrence text to our simple pattern language.

    Examples:
      'No Repeat'                              → ''
      'Every second Thursday of the month.'    → 'monthly:2nd-thursday'
      'Every third Wednesday of the month until November 26, 2026 at 10:33 AM.'
                                              → 'monthly:3rd-wednesday'  (+ end date field)
    """
    if not rep or rep.strip().lower() == 'no repeat':
        return ('', '')

    text = rep.strip().lower()
    ordinals = {'first': '1st', 'second': '2nd', 'third': '3rd', 'fourth': '4th', 'fifth': '5th'}
    weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

    pattern = ''
    end_date = ''

    # Look for "every <ordinal> <weekday> of the month"
    m = re.search(r'every\s+(first|second|third|fourth|fifth)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+of\s+the\s+month', text)
    if m:
        pattern = f'monthly:{ordinals[m.group(1)]}-{m.group(2)}'
    else:
        # "every day"
        if 'every day' in text:
            pattern = 'daily'
        # "every <weekday>"
        else:
            m = re.search(r'every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)', text)
            if m:
                pattern = f'weekly:{m.group(1)}'

    # End date: "until <Month> <Day>, <Year>"
    m = re.search(r'until\s+([a-z]+)\s+(\d+),\s+(\d{4})', text)
    if m:
        try:
            month_num = datetime.strptime(m.group(1)[:3].title(), '%b').month
            end_date = f'{m.group(3)}-{month_num:02d}-{int(m.group(2)):02d}'
        except ValueError:
            pass

    return (pattern, end_date)


def parse_exceptions(exc):
    """Parse SKIP/RESCHEDULE lines into skip_dates + additional_dates."""
    if not exc:
        return ([], [])
    skips = []
    adds = []
    for line in exc.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith('SKIP:'):
            m = re.match(r'SKIP:(\d{2})-(\d{2})-(\d{4})\s*', line)
            if m:
                skips.append(f'{m.group(3)}-{m.group(1)}-{m.group(2)}')
        elif line.startswith('RESCHEDULE:'):
            # RESCHEDULE:ORG=02-18-2027 03:30 PM;START=02-25-2027 03:30 PM;END=02-25-2027 04:30 PM
            m_org = re.search(r'ORG=(\d{2})-(\d{2})-(\d{4})', line)
            m_start = re.search(r'START=(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}:\d{2}\s+[AP]M)', line)
            m_end = re.search(r'END=(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}:\d{2}\s+[AP]M)', line)
            if m_org:
                skips.append(f'{m_org.group(3)}-{m_org.group(1)}-{m_org.group(2)}')
            if m_start:
                new_date = f'{m_start.group(3)}-{m_start.group(1)}-{m_start.group(2)}'
                new_start = m_start.group(4)
                new_end = m_end.group(4) if m_end else ''
                adds.append({'date': new_date, 'start': new_start, 'end': new_end})
    return (skips, adds)


def extract_register_url(actions):
    """Actions field is like:
        TYPE:Link;TEXT:Join Here;LINK:https://...;TARGET:_blank;PRIMARY:Yes;VISIBLE:Yes
    Multiple actions can be newline-separated; grab the primary Link."""
    if not actions:
        return ('', '')
    lines = actions.splitlines() if '\n' in actions else [actions]
    primary_url, primary_text = '', ''
    fallback_url, fallback_text = '', ''
    for line in lines:
        line = line.strip()
        if not line or ':' not in line:
            continue
        # Split by ;
        parts = {}
        for kv in line.split(';'):
            if ':' in kv:
                k, _, v = kv.partition(':')
                parts[k.strip().upper()] = v.strip()
        if parts.get('TYPE', '').lower() != 'link':
            continue
        url = parts.get('LINK', '')
        text = parts.get('TEXT', '') or 'Register'
        if not url:
            continue
        if parts.get('PRIMARY', '').lower() == 'yes':
            primary_url, primary_text = url, text
        elif not fallback_url:
            fallback_url, fallback_text = url, text
    return (primary_url or fallback_url, primary_text or fallback_text)


def format_location(venue_name, venue_address):
    """Return a display location string."""
    name = (venue_name or '').strip()
    addr = (venue_address or '').strip()
    if name.lower() == 'virtual event':
        return 'Virtual'
    if name and addr:
        return f'{name} — {addr}'
    return name or addr or ''


# ─── Main ─────────────────────────────────────────────────────────────────

def main():
    with open(INPUT, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    repeat_col = next(c for c in rows[0].keys() if 'Repeat' in c)

    # Filter
    filtered = []
    dropped_hidden = 0
    dropped_old = 0
    for r in rows:
        if r.get('Is Hidden? (Yes/No)') == 'Yes':
            dropped_hidden += 1
            continue
        if r['Start Date and Time'] < CUTOFF_DATE:
            dropped_old += 1
            continue
        filtered.append(r)

    print(f'Total rows:            {len(rows)}')
    print(f'Dropped (hidden):      {dropped_hidden}')
    print(f'Dropped (< {CUTOFF_DATE}): {dropped_old}')
    print(f'Kept:                  {len(filtered)}')
    print()

    out_rows = []
    for i, r in enumerate(filtered):
        parsed = parse_description(r['Description'])
        start_date, start_time = split_datetime(r['Start Date and Time'])
        end_date, end_time = split_datetime(r['End Date and Time'])
        recur_pattern, recur_end = parse_recurrence(r[repeat_col])
        skip_dates, add_dates = parse_exceptions(r['Exceptions'])
        register_url, register_text = extract_register_url(r['Actions'])
        location = format_location(r.get('Venue Name'), r.get('Venue Address'))

        # Prefer parsed contact name/email; fall back to Host fields
        contact_name = parsed['contact_name']
        contact_email = parsed['contact_email'] or r.get('Host Email', '').strip()

        out_rows.append({
            'ID': f'evt_{i+1:04d}',
            'Title': r['Event Name'].strip(),
            'Focus Area': r['Host Name'].strip(),          # Host = Focus Area, verbatim
            'Type': apply_type_override(r['Event Name'], (r['Event Type Name'] or '').strip() or 'Other'),
            'Start Date': start_date,
            'Start Time': start_time,
            'End Date': end_date,
            'End Time': end_time,
            'All Day': 'Yes' if r['All Day Event? (Yes/No)'] == 'Yes' else 'No',
            'Location': location,
            'Venue Address': r.get('Venue Address', '').strip(),
            'Venue Website': r.get('Venue Website', '').strip(),
            'Intended Audience': parsed['audience'],
            'Description Teaser': teaser_from(parsed['body_text'] or parsed['audience']),
            'Description': parsed['body_html'],
            'Contact Name': contact_name,
            'Contact Email': contact_email,
            'Register URL': register_url,
            'Register Text': register_text,
            'Recurrence Pattern': recur_pattern,
            'Recurrence End': recur_end,
            'Exceptions (skip)': ','.join(skip_dates),
            'Additional Dates': json.dumps(add_dates) if add_dates else '',
            'Status': 'Published',
            'Source': 'elfsight-import-2026-08-27',
        })

    # Sort by start date, then start time
    out_rows.sort(key=lambda r: (r['Start Date'], r['Start Time']))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)

    print(f'Wrote {len(out_rows)} clean rows → {OUTPUT}')
    print()

    # Summary
    from collections import Counter
    focus_counts = Counter(r['Focus Area'] for r in out_rows)
    type_counts = Counter(r['Type'] for r in out_rows)
    print(f'Focus areas ({len(focus_counts)}):')
    for k, n in focus_counts.most_common():
        print(f'  {n:3d}  {k}')
    print()
    print(f'Event types ({len(type_counts)}):')
    for k, n in type_counts.most_common():
        print(f'  {n:3d}  {k}')
    print()
    print('Recurring events:')
    for r in out_rows:
        if r['Recurrence Pattern']:
            print(f'  {r["Start Date"]}  {r["Title"][:60]:60s}  pattern={r["Recurrence Pattern"]}  until={r["Recurrence End"] or "(none)"}')
    print()
    missing_contact = [r for r in out_rows if not r['Contact Email']]
    print(f'Events missing contact email: {len(missing_contact)}')
    for r in missing_contact[:5]:
        print(f'  {r["Start Date"]}  {r["Title"][:60]}')


if __name__ == '__main__':
    main()

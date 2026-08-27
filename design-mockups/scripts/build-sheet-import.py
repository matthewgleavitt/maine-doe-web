#!/usr/bin/env python3
"""Take the cleaned calendar-import.csv and reshape it to match the new
EventSubmissions tab column layout exactly. Output is paste-ready into the
sheet: 30 columns, in the same order as the sheet, one event per row.

Also generates a 32-char random Edit Token per event and assigns unique IDs.
"""
import csv
import json
import secrets
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / 'data' / 'calendar-import.csv'
DST = Path(__file__).resolve().parent.parent / 'data' / 'eventsubmissions-import.csv'
HEADER_TXT = Path(__file__).resolve().parent.parent / 'data' / 'sheet-header-row.txt'

# Column layout of the EventSubmissions tab AFTER migration (36 columns, in order).
SHEET_COLUMNS = [
    # Existing (some renamed):
    'Date Submitted',
    'Contact Name',             # was Requestor
    'Contact Email',
    'Focus Area',               # was Area of Focus
    'Title',                    # was Event Title
    'Type',                     # was Event Type
    'Intended Audience',        # was Audience
    'Description',
    'Location Type',
    'Register URL',             # was Registration/Join Link
    'Venue Address',            # was Address
    'Coincides',
    'Special Notes',
    'Status',
    'Calendar URL',
    'Admin Notes',
    # New — data model:
    'Start Date',
    'Start Time',
    'End Date',
    'End Time',
    'All Day',
    'Description Teaser',
    'Register Text',
    'Recurrence Pattern',
    'Recurrence End',
    'Exceptions',
    'Additional Dates',
    'Source',
    'Event ID',
    'Edit Token',
    # New — location + optional extras:
    'Venue Name',
    'Contact Phone',
    'Materials URL',
    'Recording URL',
    'Registration Deadline',
    'Contact Hours',            # Yes/No
]


def infer_location_type(location):
    """Infer Virtual / In-Person / Hybrid from the free-text location string."""
    loc = (location or '').lower()
    if 'hybrid' in loc:
        return 'Hybrid'
    if 'virtual' in loc or 'zoom' in loc or 'teams' in loc or 'online' in loc:
        return 'Virtual'
    if loc:
        return 'In-Person'
    return ''


def main():
    src_rows = list(csv.DictReader(open(SRC)))

    out_rows = []
    for r in src_rows:
        out_rows.append({
            'Date Submitted': '',
            'Contact Name': r['Contact Name'],
            'Contact Email': r['Contact Email'],
            'Focus Area': r['Focus Area'],
            'Title': r['Title'],
            'Type': r['Type'],
            'Intended Audience': r['Intended Audience'],
            'Description': r['Description'],
            'Location Type': infer_location_type(r['Location']),
            'Register URL': r['Register URL'],
            'Venue Address': r['Venue Address'],
            'Coincides': '',
            'Special Notes': '',
            'Status': 'Published',
            'Calendar URL': '',
            'Admin Notes': '',
            'Start Date': r['Start Date'],
            'Start Time': r['Start Time'],
            'End Date': r['End Date'],
            'End Time': r['End Time'],
            'All Day': r['All Day'],
            'Description Teaser': r['Description Teaser'],
            'Register Text': r['Register Text'],
            'Recurrence Pattern': r['Recurrence Pattern'],
            'Recurrence End': r['Recurrence End'],
            'Exceptions': r['Exceptions (skip)'],
            'Additional Dates': r['Additional Dates'],
            'Source': r['Source'],
            'Event ID': r['ID'],
            'Edit Token': secrets.token_hex(16),
            # New optional fields — blank for imports, populated as staff fill in
            'Venue Name': '',
            'Contact Phone': '',
            'Materials URL': '',
            'Recording URL': '',
            'Registration Deadline': '',
            'Contact Hours': 'No',
        })

    with open(DST, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=SHEET_COLUMNS)
        w.writeheader()
        w.writerows(out_rows)

    print(f'Wrote {len(out_rows)} rows → {DST}')

    # Also write a paste-ready tab-delimited header line
    HEADER_TXT.write_text('\t'.join(SHEET_COLUMNS) + '\n')
    print(f'Wrote header row → {HEADER_TXT}')
    print(f'  (paste into Google Sheets A1; tabs auto-split into columns)')
    print(f'  Total columns: {len(SHEET_COLUMNS)}')


if __name__ == '__main__':
    main()

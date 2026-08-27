// =============================================================
// CALENDAR EVENTS - public-facing calendar endpoint
// Paste these functions into Code.gs (or a new .gs file in the project).
// Also update the doGet router - see the ROUTER PATCH block at the bottom.
// =============================================================

/**
 * Public calendar feed. Reads EventSubmissions, expands recurring events,
 * applies exceptions + additional dates, filters past events (ET), and
 * returns a flat JSON list ready for the calendar frontend.
 *
 * URL: ?type=calendar
 */
function getPublishedEvents() {
  var config = getConfig();
  if (!config.sheetId) return { error: 'No sheet configured', events: [] };

  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('EventSubmissions');
  if (!sheet) return { error: 'EventSubmissions tab not found', events: [] };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { events: [] };

  // Header-based column lookup so we survive future column adds.
  var header = data[0].map(function(h) { return String(h).trim(); });
  var idx = {};
  for (var c = 0; c < header.length; c++) idx[header[c]] = c;

  // Required columns
  var required = ['Status', 'Title', 'Focus Area', 'Type', 'Start Date',
                  'Start Time', 'End Date', 'End Time'];
  for (var i = 0; i < required.length; i++) {
    if (typeof idx[required[i]] !== 'number') {
      return { error: 'Missing required column: ' + required[i], events: [] };
    }
  }

  // Current time in ET as a comparable key
  var nowET = Utilities.formatDate(new Date(), 'America/New_York', "yyyy-MM-dd'T'HH:mm");

  var events = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var status = String(row[idx['Status']] || '').trim();
    if (status !== 'Published' && status !== 'Cancelled') continue;
    if (!row[idx['Title']]) continue;

    var base = _rowToEvent(row, idx, status);
    if (!base) continue;

    // Expand into occurrences
    var occurrences = _expandOccurrences(base);
    for (var o = 0; o < occurrences.length; o++) {
      var occ = occurrences[o];
      // Hide if the occurrence's end is in the past AND there's no recording URL
      var endKey = _dateTimeKey(occ.endDate, occ.endTime);
      if (endKey < nowET && !base.recordingUrl) continue;
      events.push(_flatten(base, occ));
    }
  }

  events.sort(function(a, b) {
    return (a.date + a.startTime).localeCompare(b.date + b.startTime);
  });

  return { events: events, count: events.length, generated: nowET };
}


// --- Row -> base event object -------------------------------------------

function _rowToEvent(row, idx, status) {
  function get(name) {
    return (typeof idx[name] === 'number') ? String(row[idx[name]] || '').trim() : '';
  }
  function getBool(name) {
    var v = get(name).toLowerCase();
    return v === 'yes' || v === 'true' || v === '1';
  }
  return {
    id: get('Event ID') || 'evt_' + Utilities.getUuid().substring(0, 8),
    title: get('Title'),
    focusArea: get('Focus Area'),
    type: get('Type'),
    startDate: _isoDate(get('Start Date')),
    startTime: get('Start Time'),
    endDate: _isoDate(get('End Date')) || _isoDate(get('Start Date')),
    endTime: get('End Time'),
    allDay: getBool('All Day'),
    locationType: get('Location Type'),
    venueName: get('Venue Name'),
    venueAddress: get('Venue Address'),
    audience: get('Intended Audience'),
    description: get('Description'),
    descriptionTeaser: get('Description Teaser'),
    contactName: get('Contact Name'),
    contactEmail: get('Contact Email'),
    contactPhone: get('Contact Phone'),
    registerUrl: get('Register URL'),
    registerText: get('Register Text') || 'Register',
    materialsUrl: get('Materials URL'),
    recordingUrl: get('Recording URL'),
    registrationDeadline: _isoDate(get('Registration Deadline')),
    contactHours: getBool('Contact Hours'),
    recurrencePattern: get('Recurrence Pattern'),
    recurrenceEnd: _isoDate(get('Recurrence End')),
    exceptions: get('Exceptions'),
    additionalDates: get('Additional Dates'),
    status: status,
  };
}


// --- Recurrence expansion ----------------------------------------------

/**
 * Produce a list of occurrences from a base event.
 * Each occurrence: { date, startTime, endDate, endTime }.
 * Simple pattern language:
 *   ''                 -> one occurrence at startDate/startTime
 *   'daily'            -> every day up to Recurrence End
 *   'weekly:tuesday'   -> weekly on Tuesday
 *   'monthly:2nd-thursday' -> the 2nd Thursday of each month
 *   'monthly:15'       -> the 15th of each month
 * Additional Dates is a JSON array of {date, start, end} appended after pattern expansion.
 * Exceptions is a comma-separated list of dates to skip.
 */
function _expandOccurrences(e) {
  var occurrences = [];
  var skipSet = _parseSkips(e.exceptions);
  var pattern = (e.recurrencePattern || '').toLowerCase().trim();
  var seedDate = e.startDate;
  if (!seedDate) return occurrences;

  var endDate = e.recurrenceEnd || _defaultRecurrenceEnd(seedDate);

  if (!pattern) {
    // Single occurrence
    if (!skipSet[seedDate]) {
      occurrences.push({ date: seedDate, startTime: e.startTime, endDate: e.endDate, endTime: e.endTime });
    }
  } else if (pattern === 'daily') {
    _walkDates(seedDate, endDate, function(d) {
      if (!skipSet[d]) occurrences.push({ date: d, startTime: e.startTime, endDate: d, endTime: e.endTime });
    });
  } else if (pattern.indexOf('weekly:') === 0) {
    var wd = pattern.substring(7);
    var wdList = wd.split(',').map(function(w) { return _weekdayIndex(w.trim()); });
    _walkDates(seedDate, endDate, function(d) {
      var dow = new Date(d + 'T12:00:00').getDay();
      if (wdList.indexOf(dow) === -1) return;
      if (skipSet[d]) return;
      occurrences.push({ date: d, startTime: e.startTime, endDate: d, endTime: e.endTime });
    });
  } else if (pattern.indexOf('monthly:') === 0) {
    var spec = pattern.substring(8);
    // 'monthly:15' -> 15th of every month
    if (/^\d+$/.test(spec)) {
      var dayOfMonth = parseInt(spec, 10);
      _walkMonths(seedDate, endDate, function(year, monthIdx) {
        var d = _isoDate(new Date(year, monthIdx, dayOfMonth));
        if (d < seedDate || d > endDate || skipSet[d]) return;
        occurrences.push({ date: d, startTime: e.startTime, endDate: d, endTime: e.endTime });
      });
    } else {
      // 'monthly:2nd-thursday' etc
      var parts = spec.split('-');
      var ordinal = parts[0]; // '2nd' etc
      var dayName = parts[1];
      var ordinalMap = { '1st': 0, '2nd': 1, '3rd': 2, '4th': 3, '5th': 4, 'last': -1 };
      var ordinalIdx = ordinalMap[ordinal];
      var targetDow = _weekdayIndex(dayName);
      if (typeof ordinalIdx !== 'number' || targetDow < 0) return occurrences;
      _walkMonths(seedDate, endDate, function(year, monthIdx) {
        var d = _nthWeekdayOfMonth(year, monthIdx, targetDow, ordinalIdx);
        if (!d || d < seedDate || d > endDate || skipSet[d]) return;
        occurrences.push({ date: d, startTime: e.startTime, endDate: d, endTime: e.endTime });
      });
    }
  }

  // Additional dates (non-pattern one-offs)
  if (e.additionalDates) {
    try {
      var extras = JSON.parse(e.additionalDates);
      for (var i = 0; i < extras.length; i++) {
        var x = extras[i];
        if (!x.date || skipSet[x.date]) continue;
        occurrences.push({
          date: _isoDate(x.date),
          startTime: x.start || e.startTime,
          endDate: _isoDate(x.date),
          endTime: x.end || e.endTime,
        });
      }
    } catch (err) { /* malformed JSON - skip */ }
  }

  return occurrences;
}


// --- Small helpers -----------------------------------------------------

function _isoDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    var y = v.getFullYear();
    var m = (v.getMonth() + 1);
    var d = v.getDate();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
  }
  var s = String(v).trim();
  // Handle common non-ISO variants (M/D/YYYY, MM-DD-YYYY, etc.)
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + _pad(m[1]) + '-' + _pad(m[2]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0].substring(0, 10);
  return s;
}
function _pad(n) { n = String(n); return n.length === 1 ? '0' + n : n; }

function _dateTimeKey(date, time) {
  var t = _to24h(time);
  return date + 'T' + (t || '23:59');
}
function _to24h(t) {
  if (!t) return '';
  var m = String(t).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return '';
  var h = parseInt(m[1], 10);
  var mm = m[2];
  var ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return _pad(h) + ':' + mm;
}

function _weekdayIndex(name) {
  var map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  return map[String(name || '').toLowerCase()] !== undefined ? map[String(name).toLowerCase()] : -1;
}

function _walkDates(startISO, endISO, cb) {
  var d = new Date(startISO + 'T12:00:00');
  var end = new Date(endISO + 'T12:00:00');
  while (d.getTime() <= end.getTime()) {
    cb(_isoDate(d));
    d.setDate(d.getDate() + 1);
  }
}
function _walkMonths(startISO, endISO, cb) {
  var d = new Date(startISO + 'T12:00:00');
  var end = new Date(endISO + 'T12:00:00');
  var year = d.getFullYear();
  var month = d.getMonth();
  while (new Date(year, month, 1).getTime() <= end.getTime()) {
    cb(year, month);
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
}
function _nthWeekdayOfMonth(year, monthIdx, targetDow, ordinal) {
  // ordinal is 0-based (0 = 1st, 1 = 2nd, ..., -1 = last)
  var first = new Date(year, monthIdx, 1);
  var firstDow = first.getDay();
  var offset = (targetDow - firstDow + 7) % 7;
  if (ordinal >= 0) {
    var day = 1 + offset + ordinal * 7;
    var d = new Date(year, monthIdx, day);
    if (d.getMonth() !== monthIdx) return '';
    return _isoDate(d);
  } else {
    // Last: walk backwards from end of month
    var lastDay = new Date(year, monthIdx + 1, 0).getDate();
    for (var i = lastDay; i >= 1; i--) {
      var d2 = new Date(year, monthIdx, i);
      if (d2.getDay() === targetDow) return _isoDate(d2);
    }
    return '';
  }
}
function _parseSkips(exceptions) {
  var set = {};
  if (!exceptions) return set;
  var items = String(exceptions).split(/[,\n]/);
  for (var i = 0; i < items.length; i++) {
    var s = items[i].trim();
    if (s) set[_isoDate(s)] = true;
  }
  return set;
}
function _defaultRecurrenceEnd(startISO) {
  // If no end date on a recurrence, don't run forever - cap at 2 years out.
  var d = new Date(startISO + 'T12:00:00');
  d.setFullYear(d.getFullYear() + 2);
  return _isoDate(d);
}
function _flatten(base, occ) {
  return {
    id: base.id,
    occurrenceKey: base.id + '_' + occ.date + '_' + (occ.startTime || ''),
    title: base.title,
    focusArea: base.focusArea,
    type: base.type,
    date: occ.date,
    startTime: occ.startTime,
    endDate: occ.endDate,
    endTime: occ.endTime,
    allDay: base.allDay,
    location: base.venueName || base.locationType || 'Virtual',
    venueName: base.venueName,
    venueAddress: base.venueAddress,
    locationType: base.locationType,
    audience: base.audience,
    desc: base.descriptionTeaser || _stripHtml(base.description).substring(0, 180),
    long: base.description,
    contactName: base.contactName,
    contactEmail: base.contactEmail,
    contactPhone: base.contactPhone,
    register: base.registerUrl,
    registerText: base.registerText,
    materialsUrl: base.materialsUrl,
    recordingUrl: base.recordingUrl,
    registrationDeadline: base.registrationDeadline,
    contactHours: base.contactHours,
    status: base.status,
    time: base.allDay
      ? 'All day'
      : (occ.startTime + (occ.endTime ? ' - ' + occ.endTime : '')),
  };
}
function _stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}


// ===========================================
// ROUTER PATCH - add this to doGet, next to the existing `?type=events`
// ===========================================
//
//     } else if (type === 'calendar') {
//       result = getPublishedEvents();
//     }
//
// Cache duration is short (60s) since staff want fresh event data.
// Add above the caching block, or wrap in its own try/catch.

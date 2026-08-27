// ============================================================
// FINAL APPS SCRIPT ADDITIONS
// Paste these into Code.gs (or a new .gs file in the project).
// Then apply the ROUTER PATCH inside doGet/doPost as noted below.
// ============================================================

// ---- CONFIG (Script Properties) ------------------------------
// Set once in Project Settings > Script Properties:
//   EVENTS_ADMIN_TOKEN = <32+ char random string>
function getEventsAdminToken() {
  return PropertiesService.getScriptProperties().getProperty('EVENTS_ADMIN_TOKEN') || '';
}


// ---- CACHE UTILS ---------------------------------------------

/** Force-refresh the calendar's cached JSON.
 *  Run manually from the Apps Script editor after publishing a batch
 *  of edits (or trigger from a Sheet onEdit).                    */
function purgeCalendarCache() {
  var cache = CacheService.getScriptCache();
  cache.removeAll(['v1_calendar', 'v1_events', 'v1_type=calendar']);
  Logger.log('Calendar cache purged.');
}


// ---- SINGLE EVENT (READ) -------------------------------------
// URL: ?type=event&id=evt_042&token=<edit-token OR admin-token>

function getSingleEvent(id, token) {
  var ctx = _openEventsSheet();
  if (ctx.error) return { error: ctx.error };
  var found = _findRowById(ctx.sheet, ctx.idx, id);
  if (!found) return { error: 'Event not found' };
  // Token must match either the event's per-row edit token or the admin token
  var eventToken = String(found.row[ctx.idx['Edit Token']] || '');
  var adminToken = getEventsAdminToken();
  var isAdmin = adminToken && token === adminToken;
  if (!token || (token !== eventToken && !isAdmin)) return { error: 'Access denied' };
  var event = _rowToRecord(found.row, ctx.idx);
  event.isAdmin = isAdmin;
  return { event: event };
}


// ---- SINGLE EVENT (UPDATE) -----------------------------------
// POST body: { id, token, fields: { ...new values by column name } }

function updateEvent(id, token, fields) {
  var ctx = _openEventsSheet();
  if (ctx.error) return { error: ctx.error };
  var found = _findRowById(ctx.sheet, ctx.idx, id);
  if (!found) return { error: 'Event not found' };
  var eventToken = String(found.row[ctx.idx['Edit Token']] || '');
  var adminToken = getEventsAdminToken();
  var isAdmin = adminToken && token === adminToken;
  if (!token || (token !== eventToken && !isAdmin)) return { error: 'Access denied' };

  // Editable field whitelist. Never let a user rewrite Edit Token or Event ID.
  var editable = [
    'Contact Name', 'Contact Email', 'Contact Phone',
    'Focus Area', 'Title', 'Type',
    'Intended Audience', 'Description', 'Description Teaser',
    'Location Type', 'Venue Name', 'Venue Address',
    'Register URL', 'Register Text', 'Materials URL', 'Recording URL',
    'Start Date', 'Start Time', 'End Date', 'End Time', 'All Day',
    'Recurrence Pattern', 'Recurrence End', 'Exceptions', 'Additional Dates',
    'Registration Deadline', 'Contact Hours',
    'Coincides', 'Special Notes',
  ];
  // Admin-only fields
  if (isAdmin) editable = editable.concat(['Status', 'Admin Notes', 'Calendar URL']);

  var updated = 0;
  for (var key in fields) {
    if (editable.indexOf(key) === -1) continue;
    if (typeof ctx.idx[key] !== 'number') continue;
    ctx.sheet.getRange(found.rowIdx + 1, ctx.idx[key] + 1).setValue(fields[key]);
    updated++;
  }
  purgeCalendarCache();
  return { ok: true, id: id, fieldsUpdated: updated };
}


// ---- SINGLE EVENT (DELETE / CANCEL) --------------------------
// Soft delete: sets Status = "Cancelled". Stays visible with strikethrough
// on the frontend for a grace period, then hidden.
// POST body: { id, token }

function deleteEvent(id, token) {
  var ctx = _openEventsSheet();
  if (ctx.error) return { error: ctx.error };
  var found = _findRowById(ctx.sheet, ctx.idx, id);
  if (!found) return { error: 'Event not found' };
  var eventToken = String(found.row[ctx.idx['Edit Token']] || '');
  var adminToken = getEventsAdminToken();
  var isAdmin = adminToken && token === adminToken;
  if (!token || (token !== eventToken && !isAdmin)) return { error: 'Access denied' };
  ctx.sheet.getRange(found.rowIdx + 1, ctx.idx['Status'] + 1).setValue('Cancelled');
  purgeCalendarCache();
  return { ok: true, id: id, status: 'Cancelled' };
}


// ---- HELPERS -------------------------------------------------

function _openEventsSheet() {
  var config = getConfig();
  if (!config.sheetId) return { error: 'No sheet configured' };
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('EventSubmissions');
  if (!sheet) return { error: 'EventSubmissions tab not found' };
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = {};
  for (var c = 0; c < header.length; c++) idx[String(header[c]).trim()] = c;
  return { sheet: sheet, idx: idx, header: header };
}

function _findRowById(sheet, idx, id) {
  if (typeof idx['Event ID'] !== 'number') return null;
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idx['Event ID']]).trim() === String(id).trim()) {
      return { row: data[r], rowIdx: r };
    }
  }
  return null;
}

function _rowToRecord(row, idx) {
  var rec = {};
  for (var name in idx) rec[name] = row[idx[name]];
  return rec;
}


// ============================================================
// ROUTER PATCHES
// ============================================================

// ---- doGet: two branches to add ------------------------------
// Find the existing `} else if (type === 'events') {` branch.
// Replace it with the guarded version + add `event` and `calendar` branches:
//
//     } else if (type === 'events') {
//       var t = (e.parameter && e.parameter.token) || '';
//       if (!t || t !== getEventsAdminToken()) {
//         result = { error: 'Access denied' };
//       } else {
//         result = getEventSubmissions();
//       }
//
//     } else if (type === 'event') {
//       result = getSingleEvent(
//         (e.parameter && e.parameter.id) || '',
//         (e.parameter && e.parameter.token) || ''
//       );
//
//     } else if (type === 'calendar') {
//       result = getPublishedEvents();
//
//
// ---- doPost: three actions to route --------------------------
// In doPost(), add these branches for calendar edit/delete/new-submission:
//
//     var body = {};
//     try { body = JSON.parse(e.postData.contents); } catch(err) {}
//     var action = (e.parameter && e.parameter.action) || body.action || '';
//
//     if (action === 'update_event') {
//       return _jsonOut(updateEvent(body.id, body.token, body.fields || {}));
//     }
//     if (action === 'delete_event') {
//       return _jsonOut(deleteEvent(body.id, body.token));
//     }
//     if (action === 'submit_event') {
//       return _jsonOut(submitNewEvent(body.fields || {}));
//     }
//
//   (Keep your existing announcement_add + other actions as they are.)


// ---- Small JSON writer used above ----------------------------
function _jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ---- NEW EVENT SUBMISSION ------------------------------------
// Called when the form on events-tracker.html POSTs a new event.
// Assigns a fresh Event ID + Edit Token and appends to EventSubmissions.

function submitNewEvent(fields) {
  var ctx = _openEventsSheet();
  if (ctx.error) return { error: ctx.error };

  // Assign IDs the submitter can use to edit/delete later.
  var editToken = Utilities.getUuid().replace(/-/g, '');
  var eventId = 'evt_' + editToken.substring(0, 8);

  // Row assembled in header order to survive future column adds.
  var row = new Array(ctx.header.length).fill('');
  function set(name, value) {
    if (typeof ctx.idx[name] === 'number') row[ctx.idx[name]] = value;
  }
  set('Date Submitted', Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd HH:mm'));
  set('Status', 'Published');   // No moderation for now, per Matt.
  set('Source', 'form');
  set('Event ID', eventId);
  set('Edit Token', editToken);

  // Copy every allowed field from the submission body.
  var allowed = [
    'Contact Name', 'Contact Email', 'Contact Phone',
    'Focus Area', 'Title', 'Type',
    'Intended Audience', 'Description', 'Description Teaser',
    'Location Type', 'Venue Name', 'Venue Address',
    'Register URL', 'Register Text', 'Materials URL',
    'Start Date', 'Start Time', 'End Date', 'End Time', 'All Day',
    'Recurrence Pattern', 'Recurrence End', 'Exceptions', 'Additional Dates',
    'Registration Deadline', 'Contact Hours',
    'Coincides', 'Special Notes',
  ];
  for (var i = 0; i < allowed.length; i++) {
    var name = allowed[i];
    if (fields.hasOwnProperty(name)) set(name, fields[name]);
  }

  ctx.sheet.appendRow(row);
  purgeCalendarCache();
  return { ok: true, id: eventId, editToken: editToken };
}

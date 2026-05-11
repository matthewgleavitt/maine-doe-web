/**
 * Maine DOE Communications Portal — GA4 + File Scanner + YouTube Tracker
 *
 * Script Properties needed:
 *   GA4_PROPERTY_ID, SA_EMAIL, SA_PRIVATE_KEY, CACHE_SHEET_ID
 *
 * Google Sheet tabs needed:
 *   FilePages (auto-created by scanner)
 *   ScanMeta (auto-created by scanner)
 *   YouTubeSubmissions (create manually with header row)
 *
 * Triggers:
 *   scanBatch → Time-driven → Every 10 minutes
 */

function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    propertyId: props.getProperty('GA4_PROPERTY_ID'),
    saEmail: props.getProperty('SA_EMAIL'),
    saKey: props.getProperty('SA_PRIVATE_KEY'),
    sheetId: props.getProperty('CACHE_SHEET_ID'),
  };
}

function getAccessToken() {
  var config = getConfig();
  var now = Math.floor(Date.now() / 1000);
  var header = { alg: 'RS256', typ: 'JWT' };
  var payload = {
    iss: config.saEmail,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  };
  var headerB64 = Utilities.base64EncodeWebSafe(JSON.stringify(header));
  var payloadB64 = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  var sigInput = headerB64 + '.' + payloadB64;
  var key = config.saKey.replace(/\\n/g, '\n');
  var signature = Utilities.computeRsaSha256Signature(sigInput, key);
  var signatureB64 = Utilities.base64EncodeWebSafe(signature);
  var jwt = sigInput + '.' + signatureB64;
  var tokenResponse = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', contentType: 'application/x-www-form-urlencoded',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
  });
  return JSON.parse(tokenResponse.getContentText()).access_token;
}

function queryGA4(requestBody) {
  var config = getConfig();
  var token = getAccessToken();
  var url = 'https://analyticsdata.googleapis.com/v1beta/properties/' + config.propertyId + ':runReport';
  var response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(requestBody),
  });
  return JSON.parse(response.getContentText());
}

function formatPageData(r) {
  var rows = [];
  if (!r.rows) return rows;
  r.rows.forEach(function(row) {
    rows.push({ path: row.dimensionValues[0].value, title: row.dimensionValues[1].value || row.dimensionValues[0].value,
      views: parseInt(row.metricValues[0].value, 10), users: parseInt(row.metricValues[1].value, 10),
      avg: formatDuration(parseFloat(row.metricValues[2].value)) });
  });
  return rows.sort(function(a, b) { return b.views - a.views; });
}

function formatFileData(r) {
  var rows = [];
  if (!r.rows) return rows;
  r.rows.forEach(function(row) {
    var linkUrl = row.dimensionValues[0].value || '';
    var customName = row.dimensionValues[1].value || '';
    var pagePath = row.dimensionValues[2].value || '';
    var fileName;
    if (customName && customName !== '(not set)') { fileName = customName; }
    else {
      try { var c = linkUrl.split('/').pop().split('?')[0].replace(/%[0-9a-fA-F]?$/, ''); fileName = decodeURIComponent(c); }
      catch(e) { fileName = linkUrl.split('/').pop().split('?')[0].replace(/%20/g, ' ').replace(/%26/g, '&'); }
    }
    if (!fileName) fileName = linkUrl;
    rows.push({ file: fileName, url: linkUrl, page: pagePath, clicks: parseInt(row.metricValues[0].value, 10) });
  });
  return rows.sort(function(a, b) { return b.clicks - a.clicks; });
}

function formatDuration(s) {
  if (isNaN(s) || s <= 0) return '0:00';
  var m = Math.floor(s / 60), sc = Math.round(s % 60);
  return m + ':' + (sc < 10 ? '0' : '') + sc;
}

function getDateRange(days) {
  var end = new Date(), start = new Date();
  start.setDate(start.getDate() - parseInt(days, 10));
  return { startDate: Utilities.formatDate(start, 'UTC', 'yyyy-MM-dd'), endDate: Utilities.formatDate(end, 'UTC', 'yyyy-MM-dd') };
}


// ═══════════════════════════════════════════
// FILE SCANNER
// ═══════════════════════════════════════════

var DRUPAL_BASE = 'https://www.maine.gov/doe/jsonapi';

function scanBatch() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('CACHE_SHEET_ID');
  if (!sheetId) { Logger.log('No CACHE_SHEET_ID set'); return; }

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName('FilePages') || ss.insertSheet('FilePages');
  var offset = parseInt(props.getProperty('SCAN_OFFSET') || '0', 10);
  var status = props.getProperty('SCAN_STATUS') || 'idle';
  var lastFull = props.getProperty('LAST_FULL_SCAN') || '';

  if (status === 'idle' && lastFull) {
    var days = (Date.now() - new Date(lastFull).getTime()) / 86400000;
    if (days < 7) { Logger.log('Last scan ' + Math.floor(days) + 'd ago, skipping.'); return; }
  }

  if (status === 'idle') {
    offset = 0;
    sheet.clear();
    sheet.appendRow(['file_path', 'file_name', 'pages_json', 'scanned_at']);
    props.setProperty('SCAN_STATUS', 'running');
    Logger.log('Starting new scan...');
  }

  var url = DRUPAL_BASE + '/file/file?filter[filemime][operator]=STARTS_WITH&filter[filemime][value]=application'
    + '&fields[file--file]=filename,uri&page[limit]=50&page[offset]=' + offset;

  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var json = JSON.parse(resp.getContentText());

    if (!json.data || json.data.length === 0) {
      props.setProperty('SCAN_STATUS', 'idle');
      props.setProperty('SCAN_OFFSET', '0');
      props.setProperty('LAST_FULL_SCAN', new Date().toISOString());
      var meta = ss.getSheetByName('ScanMeta') || ss.insertSheet('ScanMeta');
      meta.clear();
      meta.appendRow(['last_scan', 'total_files']);
      meta.appendRow([new Date().toISOString(), offset]);
      Logger.log('Scan complete! ' + offset + ' files processed.');
      return;
    }

    var rows = [];
    for (var i = 0; i < json.data.length; i++) {
      var file = json.data[i];
      var fn = file.attributes.filename || '';
      var uri = file.attributes.uri ? file.attributes.uri.url : '';
      var pages = searchBodyForFile(fn);
      rows.push([uri, fn, JSON.stringify(pages), new Date().toISOString()]);
    }

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    }

    var newOffset = offset + json.data.length;
    props.setProperty('SCAN_OFFSET', String(newOffset));
    Logger.log('Batch done: ' + offset + ' → ' + newOffset + ' (' + rows.length + ' files)');

  } catch (e) {
    Logger.log('scanBatch error: ' + e.message);
  }
}

function searchBodyForFile(filename) {
  var found = [], seen = {};
  var variants = [filename];
  var enc = encodeURIComponent(filename);
  if (enc !== filename) variants.push(enc);

  for (var v = 0; v < variants.length; v++) {
    try {
      var url = DRUPAL_BASE + '/node/multi_column_page'
        + '?filter[body.value][operator]=CONTAINS'
        + '&filter[body.value][value]=' + encodeURIComponent(variants[v])
        + '&fields[node--multi_column_page]=title,path,field_page_owner_email'
        + '&page[limit]=50';
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) continue;
      var json = JSON.parse(resp.getContentText());
      if (json.data) {
        for (var j = 0; j < json.data.length; j++) {
          var n = json.data[j];
          var alias = n.attributes.path ? n.attributes.path.alias : '';
          var fp = '/doe' + alias;
          if (alias && !seen[fp]) {
            seen[fp] = true;
            var email = n.attributes.field_page_owner_email || '';
            var owner = '';
            if (email.indexOf('@') > -1) {
              owner = email.split('@')[0].split('.').map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
            }
            found.push({ t: n.attributes.title || alias, p: fp, o: owner });
          }
        }
      }
    } catch (e) {}
  }
  return found;
}

function startFreshScan() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SCAN_OFFSET', '0');
  props.setProperty('SCAN_STATUS', 'running');
  props.deleteProperty('LAST_FULL_SCAN');
  Logger.log('Fresh scan initiated. Will begin on next trigger.');
}

function getFilePages() {
  var config = getConfig();
  if (!config.sheetId) return { error: 'No CACHE_SHEET_ID', rows: [] };
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('FilePages');
  if (!sheet) return { error: 'FilePages sheet not found', rows: [] };

  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var pages = [];
    try { pages = JSON.parse(data[i][2]); } catch(e) {}
    rows.push({ p: data[i][0], n: data[i][1], pages: pages });
  }

  var props = PropertiesService.getScriptProperties();
  var lastScan = props.getProperty('LAST_FULL_SCAN') || '';
  var scanning = props.getProperty('SCAN_STATUS') === 'running';
  var progress = parseInt(props.getProperty('SCAN_OFFSET') || '0', 10);

  return { rows: rows, lastScan: lastScan, scanning: scanning, progress: progress, type: 'file_pages' };
}


// ═══════════════════════════════════════════
// YOUTUBE TRACKER
// ═══════════════════════════════════════════

function getYouTubeSubmissions() {
  var config = getConfig();
  if (!config.sheetId) return { error: 'No sheet configured', rows: [] };

  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('YouTubeSubmissions');
  if (!sheet) return { error: 'YouTubeSubmissions tab not found. Create it with the header row.', rows: [] };

  var data = sheet.getDataRange().getValues();
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[4]) continue; // skip rows without a title

    var dateVal = row[0];
    var dateStr = '';
    if (dateVal instanceof Date) {
      dateStr = (dateVal.getMonth() + 1) + '/' + dateVal.getDate() + '/' + dateVal.getFullYear();
    } else {
      dateStr = String(dateVal || '');
    }

    rows.push({
      date: dateStr,
      requestor: String(row[1] || ''),
      email: String(row[2] || ''),
      team: String(row[3] || ''),
      title: String(row[4] || ''),
      description: String(row[5] || ''),
      mediaType: String(row[6] || ''),
      playlist: String(row[7] || ''),
      privacy: String(row[8] || 'Public'),
      engine: String(row[9] || '').toLowerCase().indexOf('yes') > -1,
      engineCourse: String(row[10] || ''),
      notes: String(row[11] || ''),
      status: String(row[12] || 'Received'),
      url: String(row[13] || ''),
    });
  }

  rows.reverse(); // most recent first
  return { rows: rows, type: 'youtube' };
}


// ═══════════════════════════════════════════
// EVENTS TRACKER
// ═══════════════════════════════════════════

function getEventSubmissions() {
  var config = getConfig();
  if (!config.sheetId) return { error: 'No sheet configured', rows: [] };

  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('EventSubmissions');
  if (!sheet) return { error: 'EventSubmissions tab not found. Create it with the header row.', rows: [] };

  var data = sheet.getDataRange().getValues();
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[4]) continue; // skip rows without event title

    var dateVal = row[0];
    var dateStr = '';
    if (dateVal instanceof Date) {
      dateStr = (dateVal.getMonth() + 1) + '/' + dateVal.getDate() + '/' + dateVal.getFullYear();
    } else {
      dateStr = String(dateVal || '');
    }

    rows.push({
      dateSubmitted: dateStr,
      requestor: String(row[1] || ''),
      email: String(row[2] || ''),
      focus: String(row[3] || ''),
      eventTitle: String(row[4] || ''),
      eventType: String(row[5] || ''),
      dateTime: String(row[6] || ''),
      audience: String(row[7] || ''),
      description: String(row[8] || ''),
      location: String(row[9] || ''),
      regLink: String(row[10] || ''),
      address: String(row[11] || ''),
      coincides: String(row[12] || ''),
      notes: String(row[13] || ''),
      status: String(row[14] || 'Received'),
      calUrl: String(row[15] || ''),
      adminNotes: String(row[16] || ''),
    });
  }

  rows.reverse();
  return { rows: rows, type: 'events' };
}


// ═══════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════

function getAnnouncements() {
  var config = getConfig();
  if (!config.sheetId) return { error: 'No sheet configured', rows: [] };

  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('Announcements');
  if (!sheet) return { error: 'Announcements tab not found.', rows: [] };

  var data = sheet.getDataRange().getValues();
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[1]) continue;
    var dateVal = row[0];
    var dateStr = '';
    if (dateVal instanceof Date) {
      dateStr = (dateVal.getMonth() + 1) + '/' + dateVal.getDate() + '/' + dateVal.getFullYear();
    } else {
      dateStr = String(dateVal || '');
    }
    rows.push({
      date: dateStr,
      title: String(row[1] || ''),
      message: String(row[2] || ''),
      priority: String(row[3] || 'normal'),
    });
  }

  rows.reverse();
  return { rows: rows, type: 'announcements' };
}


// ═══════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════

function getTemplates() {
  var config = getConfig();
  if (!config.sheetId) return { error: 'No sheet configured', rows: [] };

  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('Templates');
  if (!sheet) return { error: 'Templates tab not found.', rows: [] };

  var data = sheet.getDataRange().getValues();
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    rows.push({
      name: String(row[0] || ''),
      category: String(row[1] || ''),
      subcategory: String(row[2] || ''),
      description: String(row[3] || ''),
      source: String(row[4] || ''),
      url: String(row[5] || ''),
      thumbnail: String(row[6] || ''),
    });
  }

  return { rows: rows, type: 'templates' };
}


// ═══════════════════════════════════════════
// WEB APP ENTRY POINT
// ═══════════════════════════════════════════

function doGet(e) {
  var type = (e && e.parameter && e.parameter.type) || 'pages';
  var days = (e && e.parameter && e.parameter.days) || '30';
  var cacheKey = 'portal_' + type + '_' + days;
  var result;

  // Check cache first (skip for web_stats which should always be fresh)
  var cache = CacheService.getScriptCache();
  if (type !== 'web_stats') {
    var cached = cache.get(cacheKey);
    if (cached) {
      var output = ContentService.createTextOutput(cached);
      output.setMimeType(ContentService.MimeType.JSON);
      return output;
    }
  }

  var dateRange = getDateRange(days);

  try {
    if (type === 'pages') {
      var pr = { dateRanges: [dateRange],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'averageSessionDuration' }],
        dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/doe/' } } },
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 200 };
      result = { rows: formatPageData(queryGA4(pr)), days: days, type: 'pages' };

    } else if (type === 'files') {
      var fr = { dateRanges: [dateRange],
        dimensions: [{ name: 'linkUrl' }, { name: 'customEvent:file_name' }, { name: 'pagePath' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'file_download' } } },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 5000 };
      result = { rows: formatFileData(queryGA4(fr)), days: days, type: 'files' };

    } else if (type === 'file_pages') {
      result = getFilePages();

    } else if (type === 'youtube') {
      result = getYouTubeSubmissions();

    } else if (type === 'events') {
      result = getEventSubmissions();

    } else if (type === 'templates') {
      result = getTemplates();

    } else if (type === 'announcements') {
      result = getAnnouncements();

    } else if (type === 'publications') {
      result = getPublications();

    } else if (type === 'drupal_pages') {
      result = getDrupalPages();

    } else if (type === 'drupal_files') {
      result = getDrupalFiles();

    } else if (type === 'web_stats') {
      var props = PropertiesService.getScriptProperties();
      result = {
        totalPages: props.getProperty('STAT_TOTAL_PAGES') || '—',
        totalFiles: props.getProperty('STAT_TOTAL_FILES') || '—',
        pageViews: props.getProperty('STAT_PAGE_VIEWS') || '—',
      };

    } else {
      result = { error: 'Unknown type' };
    }
  } catch (err) { result = { error: err.message }; }

  var jsonStr = JSON.stringify(result);

  // Cache for 5 minutes (300s) for Sheet data, 10 minutes (600s) for GA4
  if (type !== 'web_stats' && !result.error) {
    var ttl = (type === 'pages' || type === 'files') ? 600 : 300;
    try { cache.put(cacheKey, jsonStr, ttl); } catch(ce) {}
  }

  var output = ContentService.createTextOutput(jsonStr);
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function doPost(e) {
  var result;
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.action === 'youtube_submit') {
      var config = getConfig();
      var ss = SpreadsheetApp.openById(config.sheetId);
      var sheet = ss.getSheetByName('YouTubeSubmissions');
      if (!sheet) { result = { error: 'YouTubeSubmissions tab not found' }; }
      else {
        var now = new Date();
        var dateStr = (now.getMonth()+1) + '/' + now.getDate() + '/' + now.getFullYear();
        sheet.appendRow([
          dateStr,
          body.requestor || '',
          body.email || '',
          body.team || '',
          body.title || '',
          body.description || '',
          body.mediaType || '',
          body.playlist || '',
          body.privacy || 'Public',
          body.engine || '',
          body.engineCourse || '',
          body.notes || '',
          'Received',
          ''
        ]);

        // Send Teams notification
        try {
          var webhookUrl = PropertiesService.getScriptProperties().getProperty('TEAMS_WEBHOOK');
          if (webhookUrl) {
            UrlFetchApp.fetch(webhookUrl, {
              method: 'post',
              contentType: 'application/json',
              muteHttpExceptions: true,
              payload: JSON.stringify({
                type: 'message',
                attachments: [{
                  contentType: 'application/vnd.microsoft.card.adaptive',
                  content: {
                    type: 'AdaptiveCard',
                    version: '1.4',
                    body: [
                      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '🎬 New YouTube Upload Request' },
                      { type: 'FactSet', facts: [
                        { title: 'Title', value: body.title || '' },
                        { title: 'From', value: (body.requestor || '') + ' (' + (body.team || '') + ')' },
                        { title: 'Type', value: body.mediaType || '' },
                        { title: 'Privacy', value: body.privacy || 'Public' },
                        { title: 'EnGiNE', value: body.engine || 'No' }
                      ]},
                      { type: 'TextBlock', text: body.description || '', wrap: true, size: 'Small' }
                    ]
                  }
                }]
              })
            });
          }
        } catch(webhookErr) { Logger.log('Teams webhook failed: ' + webhookErr.message); }

        result = { success: true, message: 'Submission received!' };
      }

    } else if (body.action === 'youtube_complete') {
      var config = getConfig();
      var ss = SpreadsheetApp.openById(config.sheetId);
      var sheet = ss.getSheetByName('YouTubeSubmissions');
      if (!sheet) { result = { error: 'Sheet not found' }; }
      else {
        var data = sheet.getDataRange().getValues();
        var found = false;
        for (var i = 1; i < data.length; i++) {
          if (String(data[i][4]) === body.title && String(data[i][1]) === body.requestor) {
            sheet.getRange(i+1, 13).setValue('Complete');
            sheet.getRange(i+1, 14).setValue(body.youtubeUrl || '');
            found = true;
            var requestorEmail = String(data[i][2] || '');
            var requestorName = String(data[i][1] || '');

            // Notify Teams
            try {
              var webhookUrl = PropertiesService.getScriptProperties().getProperty('TEAMS_WEBHOOK');
              if (webhookUrl) {
                UrlFetchApp.fetch(webhookUrl, {
                  method: 'post',
                  contentType: 'application/json',
                  muteHttpExceptions: true,
                  payload: JSON.stringify({
                    type: 'message',
                    attachments: [{
                      contentType: 'application/vnd.microsoft.card.adaptive',
                      content: {
                        type: 'AdaptiveCard',
                        version: '1.4',
                        body: [
                          { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '✅ YouTube Video Completed' },
                          { type: 'FactSet', facts: [
                            { title: 'Title', value: body.title || '' },
                            { title: 'Requestor', value: requestorName },
                            { title: 'URL', value: body.youtubeUrl || '' }
                          ]}
                        ]
                      }
                    }]
                  })
                });
              }
            } catch(webhookErr) { Logger.log('Teams webhook failed: ' + webhookErr.message); }

            result = { success: true, message: 'Marked complete!', email: requestorEmail, name: requestorName };
            break;
          }
        }
        if (!found) { result = { error: 'Submission not found in sheet' }; }
      }

    } else if (body.action === 'event_submit') {
      var config = getConfig();
      var ss = SpreadsheetApp.openById(config.sheetId);
      var sheet = ss.getSheetByName('EventSubmissions');
      if (!sheet) { result = { error: 'EventSubmissions tab not found' }; }
      else {
        var now = new Date();
        var dateStr = (now.getMonth()+1) + '/' + now.getDate() + '/' + now.getFullYear();
        sheet.appendRow([
          dateStr,
          body.requestor || '',
          body.email || '',
          body.focus || '',
          body.eventTitle || '',
          body.eventType || '',
          body.dateTime || '',
          body.audience || '',
          body.description || '',
          body.location || '',
          body.regLink || '',
          body.address || '',
          body.coincides || '',
          body.notes || '',
          'Received',
          '',
          ''
        ]);

        // Teams notification
        try {
          var webhookUrl = PropertiesService.getScriptProperties().getProperty('TEAMS_WEBHOOK');
          if (webhookUrl) {
            UrlFetchApp.fetch(webhookUrl, {
              method: 'post',
              contentType: 'application/json',
              muteHttpExceptions: true,
              payload: JSON.stringify({
                type: 'message',
                attachments: [{
                  contentType: 'application/vnd.microsoft.card.adaptive',
                  content: {
                    type: 'AdaptiveCard',
                    version: '1.4',
                    body: [
                      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '📅 New Calendar Event Request' },
                      { type: 'FactSet', facts: [
                        { title: 'Event', value: body.eventTitle || '' },
                        { title: 'From', value: (body.requestor || '') + ' (' + (body.focus || '') + ')' },
                        { title: 'Type', value: body.eventType || '' },
                        { title: 'Date', value: body.dateTime || '' },
                        { title: 'Location', value: body.location || '' },
                        { title: 'Audience', value: body.audience || '' }
                      ]},
                      { type: 'TextBlock', text: body.description || '', wrap: true, size: 'Small' }
                    ]
                  }
                }]
              })
            });
          }
        } catch(webhookErr) { Logger.log('Teams webhook failed: ' + webhookErr.message); }

        result = { success: true, message: 'Event submitted!' };
      }

    } else if (body.action === 'event_complete') {
      var config = getConfig();
      var ss = SpreadsheetApp.openById(config.sheetId);
      var sheet = ss.getSheetByName('EventSubmissions');
      if (!sheet) { result = { error: 'Sheet not found' }; }
      else {
        var data = sheet.getDataRange().getValues();
        var found = false;
        for (var i = 1; i < data.length; i++) {
          if (String(data[i][4]) === body.eventTitle && String(data[i][1]) === body.requestor) {
            sheet.getRange(i+1, 15).setValue('Complete');
            sheet.getRange(i+1, 16).setValue(body.calUrl || '');
            found = true;
            var requestorEmail = String(data[i][2] || '');
            var requestorName = String(data[i][1] || '');

            // Teams notification
            try {
              var webhookUrl = PropertiesService.getScriptProperties().getProperty('TEAMS_WEBHOOK');
              if (webhookUrl) {
                UrlFetchApp.fetch(webhookUrl, {
                  method: 'post',
                  contentType: 'application/json',
                  muteHttpExceptions: true,
                  payload: JSON.stringify({
                    type: 'message',
                    attachments: [{
                      contentType: 'application/vnd.microsoft.card.adaptive',
                      content: {
                        type: 'AdaptiveCard',
                        version: '1.4',
                        body: [
                          { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '✅ Calendar Event Published' },
                          { type: 'FactSet', facts: [
                            { title: 'Event', value: body.eventTitle || '' },
                            { title: 'Requestor', value: requestorName },
                            { title: 'Calendar', value: body.calUrl || '' }
                          ]}
                        ]
                      }
                    }]
                  })
                });
              }
            } catch(webhookErr) { Logger.log('Teams webhook failed: ' + webhookErr.message); }

            result = { success: true, message: 'Marked complete!', email: requestorEmail, name: requestorName };
            break;
          }
        }
        if (!found) { result = { error: 'Event not found in sheet' }; }
      }

    } else if (body.action === 'save_stats') {
      var props = PropertiesService.getScriptProperties();
      if (body.totalPages) props.setProperty('STAT_TOTAL_PAGES', String(body.totalPages));
      if (body.totalFiles) props.setProperty('STAT_TOTAL_FILES', String(body.totalFiles));
      if (body.pageViews) props.setProperty('STAT_PAGE_VIEWS', String(body.pageViews));
      result = { success: true };

    } else if (body.action === 'announcement_add') {
      var config = getConfig();
      var ss = SpreadsheetApp.openById(config.sheetId);
      var sheet = ss.getSheetByName('Announcements');
      if (!sheet) { result = { error: 'Announcements tab not found' }; }
      else {
        var now = new Date();
        var dateStr = (now.getMonth()+1) + '/' + now.getDate() + '/' + now.getFullYear();
        sheet.appendRow([
          dateStr,
          body.title || 'Announcement',
          body.message || '',
          body.priority || 'normal'
        ]);
        result = { success: true, message: 'Announcement added' };
      }

    } else if (body.action === 'moderation_notify') {
      try {
        var webhookUrl = PropertiesService.getScriptProperties().getProperty('TEAMS_WEBHOOK');
        if (webhookUrl) {
          UrlFetchApp.fetch(webhookUrl, {
            method: 'post',
            contentType: 'application/json',
            muteHttpExceptions: true,
            payload: JSON.stringify({
              type: 'message',
              attachments: [{
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: {
                  type: 'AdaptiveCard',
                  version: '1.4',
                  body: [
                    { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '📝 Page Ready for Approval' },
                    { type: 'FactSet', facts: [
                      { title: 'Page', value: body.title || '' },
                      { title: 'Author', value: body.author || '' }
                    ]}
                  ]
                }
              }]
            })
          });
        }
      } catch(webhookErr) { Logger.log('Teams webhook failed: ' + webhookErr.message); }
      result = { success: true };

    } else {
      result = { error: 'Unknown action' };
    }
  } catch (err) {
    result = { error: err.message };
  }

  var output = ContentService.createTextOutput(JSON.stringify(result));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}


// ═══════════════════════════════════════════
// PUBLICATIONS (Mailchimp)
// ═══════════════════════════════════════════

function getPublications() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('MAILCHIMP_API_KEY');
  var dc = props.getProperty('MAILCHIMP_DC') || 'us2';

  if (!apiKey) return { error: 'Mailchimp API key not configured', campaigns: [] };

  var baseUrl = 'https://' + dc + '.api.mailchimp.com/3.0';
  var headers = {
    'Authorization': 'Basic ' + Utilities.base64Encode('anystring:' + apiKey),
    'Content-Type': 'application/json'
  };

  try {
    // Get campaigns with report summaries in one call
    var campaignResp = UrlFetchApp.fetch(baseUrl + '/campaigns?count=1000&sort_field=send_time&sort_dir=DESC&status=sent&since_send_time=2026-01-01T00:00:00Z&fields=campaigns.id,campaigns.settings,campaigns.send_time,campaigns.recipients,campaigns.report_summary,campaigns.archive_url,campaigns.emails_sent,total_items', {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });
    var campaignData = JSON.parse(campaignResp.getContentText());

    if (!campaignData.campaigns) return { error: 'No campaigns found', campaigns: [] };

    var campaigns = [];

    for (var i = 0; i < campaignData.campaigns.length; i++) {
      var c = campaignData.campaigns[i];
      var rs = c.report_summary || {};

      var sendTime = c.send_time || '';
      var dateStr = '';
      if (sendTime) {
        var d = new Date(sendTime);
        dateStr = (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
      }

      campaigns.push({
        id: c.id,
        title: c.settings ? c.settings.title || '' : '',
        subject: c.settings ? c.settings.subject_line || '' : '',
        sendDate: dateStr,
        sendTime: sendTime,
        listName: c.recipients ? c.recipients.list_name || '' : '',
        recipientCount: c.emails_sent || (c.recipients ? c.recipients.recipient_count || 0 : 0),
        opensTotal: rs.opens || 0,
        opensUnique: rs.unique_opens || 0,
        openRate: Math.round((rs.open_rate || 0) * 1000) / 10,
        clicksTotal: rs.clicks || 0,
        clicksUnique: rs.subscriber_clicks || 0,
        clickRate: Math.round((rs.click_rate || 0) * 1000) / 10,
        bounces: (rs.hard_bounces || 0) + (rs.soft_bounces || 0),
        unsubscribes: rs.unsubscribed || 0,
        webViewUrl: c.archive_url || '',
      });
    }

    // Calculate averages
    var totalOpen = 0, totalClick = 0, totalSent = 0;
    for (var j = 0; j < campaigns.length; j++) {
      totalOpen += campaigns[j].openRate;
      totalClick += campaigns[j].clickRate;
      totalSent += campaigns[j].recipientCount;
    }
    var count = campaigns.length || 1;

    return {
      campaigns: campaigns,
      summary: {
        totalCampaigns: campaigns.length,
        avgOpenRate: Math.round(totalOpen / count * 10) / 10,
        avgClickRate: Math.round(totalClick / count * 10) / 10,
        totalSent: totalSent,
      },
      type: 'publications'
    };

  } catch (err) {
    return { error: err.message, campaigns: [] };
  }
}


// ═══════════════════════════════════════════
// DRUPAL PAGE & FILE INDEX CACHE
// Set up: Triggers → Add trigger → cacheDrupalData → Time-driven → Every 30 minutes
// ═══════════════════════════════════════════

// OPTION 1: Run both (may timeout — use separate triggers instead)
// function cacheDrupalData() { cacheDrupalPages(); cacheDrupalFiles(); }

// OPTION 2 (RECOMMENDED): Set up TWO separate triggers:
//   cacheDrupalPages → Every 30 minutes
//   cacheDrupalFiles → Every 30 minutes (offset by 15 min if possible, or same is fine since it's resumable)

function cacheDrupalPages() {
  var NODE_TYPES = ['multi_column_page','article','web_guide','instructional_page','home_page'];
  var TYPE_LABELS = {'multi_column_page':'Basic Template page','article':'Article','web_guide':'Web Guide','instructional_page':'Instructional page','home_page':'Home page'};
  var BASE = 'https://www.maine.gov/doe/jsonapi';
  var allPages = [];

  for (var t = 0; t < NODE_TYPES.length; t++) {
    var nt = NODE_TYPES[t];
    var url = BASE + '/node/' + nt + '?fields[node--' + nt + ']=title,path,field_page_owner_email,changed,created,drupal_internal__nid,status&page[limit]=50&sort=-changed';
    var pageNum = 0;

    while (url && pageNum < 100) {
      try {
        var resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
        var json = JSON.parse(resp.getContentText());
        if (json.data) {
          for (var i = 0; i < json.data.length; i++) {
            var n = json.data[i];
            var attrs = n.attributes || {};
            var path = attrs.path && attrs.path.alias ? attrs.path.alias : '';
            var email = attrs.field_page_owner_email || '';
            var ownerName = '';
            if (email && email.indexOf('@') > -1) {
              var parts = email.split('@')[0].split('.');
              for (var p = 0; p < parts.length; p++) {
                ownerName += (p > 0 ? ' ' : '') + parts[p].charAt(0).toUpperCase() + parts[p].slice(1);
              }
            }
            allPages.push({
              nid: attrs.drupal_internal__nid || '',
              title: attrs.title || 'Untitled',
              path: path ? '/doe' + path : '',
              owner: ownerName,
              ownerEmail: email,
              changed: attrs.changed || '',
              created: attrs.created || '',
              published: attrs.status !== false,
              type: TYPE_LABELS[nt] || nt,
            });
          }
        }
        url = json.links && json.links.next && json.links.next.href ? json.links.next.href : null;
        if (url) url = url.replace(/^http:/, 'https:');
        pageNum++;
      } catch (e) {
        Logger.log('Page fetch error (' + nt + '): ' + e.message);
        break;
      }
    }
  }

  // Store in Sheet
  var config = getConfig();
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('PagesIndex');
  if (!sheet) { sheet = ss.insertSheet('PagesIndex'); }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, 9).setValues([['nid','title','path','owner','ownerEmail','changed','created','published','type']]);

  if (allPages.length > 0) {
    var rows = [];
    for (var j = 0; j < allPages.length; j++) {
      var pg = allPages[j];
      rows.push([pg.nid, pg.title, pg.path, pg.owner, pg.ownerEmail, pg.changed, pg.created, pg.published, pg.type]);
    }
    sheet.getRange(2, 1, rows.length, 9).setValues(rows);
  }

  PropertiesService.getScriptProperties().setProperty('STAT_TOTAL_PAGES', String(allPages.length));
  PropertiesService.getScriptProperties().setProperty('PAGES_CACHED_AT', new Date().toISOString());
  Logger.log('Cached ' + allPages.length + ' pages from Drupal');
}

function cacheDrupalFiles() {
  var BASE = 'https://www.maine.gov/doe/jsonapi';
  var props = PropertiesService.getScriptProperties();
  var resumeUrl = props.getProperty('FILES_RESUME_URL') || '';
  var isResume = resumeUrl.length > 0;

  // If resuming, we append to existing sheet data; if fresh start, clear sheet
  var config = getConfig();
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('FilesIndex');
  if (!sheet) { sheet = ss.insertSheet('FilesIndex'); }

  if (!isResume) {
    sheet.clearContents();
    sheet.getRange(1, 1, 1, 7).setValues([['fid','name','path','ext','size','mime','created']]);
  }

  var url = isResume ? resumeUrl : BASE + '/file/file?fields[file--file]=filename,uri,filemime,filesize,created,drupal_internal__fid&page[limit]=50';
  var batchFiles = [];
  var pageNum = 0;
  var MAX_PAGES = 80; // ~4000 files per run, well within 6-min limit
  var startTime = new Date().getTime();

  while (url && pageNum < MAX_PAGES) {
    // Safety: stop if we've been running > 4.5 minutes
    if (new Date().getTime() - startTime > 270000) {
      Logger.log('Approaching time limit at page ' + pageNum + ', will resume next run');
      break;
    }

    try {
      var resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
      var json = JSON.parse(resp.getContentText());
      if (json.data) {
        for (var i = 0; i < json.data.length; i++) {
          var f = json.data[i];
          var attrs = f.attributes || {};
          var fn = attrs.filename || '';
          var uri = attrs.uri && attrs.uri.url ? attrs.uri.url : '';
          batchFiles.push([
            attrs.drupal_internal__fid || '',
            fn,
            uri,
            fn.indexOf('.') > -1 ? fn.substring(fn.lastIndexOf('.') + 1).toLowerCase() : '',
            attrs.filesize || 0,
            attrs.filemime || '',
            attrs.created || '',
          ]);
        }
      }
      url = json.links && json.links.next && json.links.next.href ? json.links.next.href : null;
      if (url) url = url.replace(/^http:/, 'https:');
      pageNum++;
    } catch (e) {
      Logger.log('File fetch error at page ' + pageNum + ': ' + e.message);
      break;
    }
  }

  // Write this batch to sheet
  if (batchFiles.length > 0) {
    var lastRow = sheet.getLastRow();
    var chunkSize = 5000;
    for (var c = 0; c < batchFiles.length; c += chunkSize) {
      var chunk = batchFiles.slice(c, c + chunkSize);
      sheet.getRange(lastRow + 1 + c, 1, chunk.length, 7).setValues(chunk);
    }
  }

  if (url) {
    // More files to fetch — save resume point
    props.setProperty('FILES_RESUME_URL', url);
    Logger.log('Batch done: ' + batchFiles.length + ' files written, resuming next run from page ' + pageNum);
  } else {
    // All done — clear resume, update stats
    props.deleteProperty('FILES_RESUME_URL');
    var totalFiles = sheet.getLastRow() - 1; // minus header
    props.setProperty('STAT_TOTAL_FILES', String(totalFiles));
    props.setProperty('FILES_CACHED_AT', new Date().toISOString());
    Logger.log('File cache complete: ' + totalFiles + ' total files');
  }
}

function getDrupalPages() {
  var config = getConfig();
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('PagesIndex');
  if (!sheet) return { error: 'PagesIndex not found. Run cacheDrupalData first.', pages: [] };

  var data = sheet.getDataRange().getValues();
  var pages = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[1]) continue;
    pages.push({
      nid: String(r[0] || ''),
      title: String(r[1] || ''),
      path: String(r[2] || ''),
      owner: String(r[3] || ''),
      ownerEmail: String(r[4] || ''),
      changed: String(r[5] || ''),
      created: String(r[6] || ''),
      published: r[7] !== false && r[7] !== 'false',
      type: String(r[8] || ''),
    });
  }
  return { pages: pages, cachedAt: PropertiesService.getScriptProperties().getProperty('PAGES_CACHED_AT') || '', type: 'drupal_pages' };
}

function getDrupalFiles() {
  var config = getConfig();
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('FilesIndex');
  if (!sheet) return { error: 'FilesIndex not found. Run cacheDrupalData first.', files: [] };

  var data = sheet.getDataRange().getValues();
  var files = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[1]) continue;
    files.push({
      fid: String(r[0] || ''),
      name: String(r[1] || ''),
      path: String(r[2] || ''),
      ext: String(r[3] || ''),
      size: Number(r[4] || 0),
      mime: String(r[5] || ''),
      created: String(r[6] || ''),
    });
  }
  return { files: files, cachedAt: PropertiesService.getScriptProperties().getProperty('FILES_CACHED_AT') || '', type: 'drupal_files' };
}


// ═══════════════════════════════════════════
// CACHE WARMER — keeps portal data pre-loaded
// Set up: Triggers → Add trigger → warmCache → Time-driven → Every 10 minutes
// Warms: Announcements, YouTube, Events, Templates, Publications, GA4 (pages + files)
// Does NOT warm: Drupal pages/files (too large for CacheService, served from Sheets)
// ═══════════════════════════════════════════

function warmCache() {
  var cache = CacheService.getScriptCache();
  var warmed = [];

  // Announcements (5 min cache)
  try {
    var annData = JSON.stringify(getAnnouncements());
    cache.put('portal_announcements_30', annData, 300);
    warmed.push('announcements');
  } catch(e) { Logger.log('Warm announcements failed: ' + e.message); }

  // YouTube submissions (5 min cache)
  try {
    var ytData = JSON.stringify(getYouTubeSubmissions());
    cache.put('portal_youtube_30', ytData, 300);
    warmed.push('youtube');
  } catch(e) { Logger.log('Warm youtube failed: ' + e.message); }

  // Event submissions (5 min cache)
  try {
    var evData = JSON.stringify(getEventSubmissions());
    cache.put('portal_events_30', evData, 300);
    warmed.push('events');
  } catch(e) { Logger.log('Warm events failed: ' + e.message); }

  // Templates (5 min cache)
  try {
    var tmplData = JSON.stringify(getTemplates());
    cache.put('portal_templates_30', tmplData, 300);
    warmed.push('templates');
  } catch(e) { Logger.log('Warm templates failed: ' + e.message); }

  // Publications/Mailchimp (5 min cache)
  try {
    var pubData = JSON.stringify(getPublications());
    cache.put('portal_publications_30', pubData, 300);
    warmed.push('publications');
  } catch(e) { Logger.log('Warm publications failed: ' + e.message); }

  // NOTE: Drupal pages/files are NOT warmed here — they're cached in Sheets
  // by cacheDrupalData (runs every 30 min) and served directly from Sheets.
  // The Sheet data is too large for CacheService's 100KB-per-key limit anyway.

  // GA4 pages — 30 day default (10 min cache)
  try {
    var dateRange = getDateRange('30');
    var pr = { dateRanges: [dateRange],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'averageSessionDuration' }],
      dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/doe/' } } },
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 200 };
    var pageResult = { rows: formatPageData(queryGA4(pr)), days: '30', type: 'pages' };
    cache.put('portal_pages_30', JSON.stringify(pageResult), 600);
    warmed.push('pages-30d');

    // Also update page views stat
    var totalViews = pageResult.rows.reduce(function(s,p){ return s + (p.views||0); }, 0);
    var pvStr = totalViews > 1000 ? (Math.round(totalViews/1000) + 'K') : String(totalViews);
    PropertiesService.getScriptProperties().setProperty('STAT_PAGE_VIEWS', pvStr);
  } catch(e) { Logger.log('Warm pages failed: ' + e.message); }

  // GA4 files — 30 day default (10 min cache)
  try {
    var dateRange = getDateRange('30');
    var fr = { dateRanges: [dateRange],
      dimensions: [{ name: 'linkUrl' }, { name: 'customEvent:file_name' }, { name: 'pagePath' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'file_download' } } },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 5000 };
    var fileResult = { rows: formatFileData(queryGA4(fr)), days: '30', type: 'files' };
    cache.put('portal_files_30', JSON.stringify(fileResult), 600);
    warmed.push('files-30d');
  } catch(e) { Logger.log('Warm files failed: ' + e.message); }

  Logger.log('Cache warmed: ' + warmed.join(', '));
}


// ═══════════════════════════════════════════
// YOUTUBE AUTO-UPLOADER
// Checks Google Drive folder for new videos, matches to Sheet submissions,
// uploads to YouTube as Private, moves to Processed subfolder.
// Set up: Triggers → Add trigger → processYouTubeUploads → Time-driven → Every 10 minutes
// ═══════════════════════════════════════════

var YT_UPLOAD_FOLDER = '1i5Hp9HSxyya3sgVA4HSMmMosIYRCLlv1';
var YT_PROCESSED_FOLDER = null; // auto-detected from "Processed" subfolder

function processYouTubeUploads() {
  var folder = DriveApp.getFolderById(YT_UPLOAD_FOLDER);

  // Find or create Processed subfolder
  var processedFolders = folder.getFoldersByName('Processed');
  var processed = processedFolders.hasNext() ? processedFolders.next() : folder.createFolder('Processed');

  var files = folder.getFiles();
  var videoExtensions = ['mp4','mov','avi','wmv','flv','mkv','webm','m4v','mpg','mpeg','3gp'];
  var uploaded = [];

  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();
    var ext = name.indexOf('.') > -1 ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : '';

    // Skip non-video files
    if (videoExtensions.indexOf(ext) === -1) continue;

    // Try to match to a YouTube submission in the Sheet
    var meta = matchToSubmission(name);

    var title = meta.title || name.replace(/\.[^.]+$/, '');
    var description = meta.description || 'Uploaded via Maine DOE Communications Portal';
    var privacy = 'private'; // Always private — review in YouTube Studio first

    try {
      Logger.log('Uploading to YouTube: ' + title + ' (' + (file.getSize() / 1048576).toFixed(1) + ' MB)');

      var resource = {
        snippet: {
          title: title,
          description: description,
          categoryId: '27' // Education
        },
        status: {
          privacyStatus: privacy,
          selfDeclaredMadeForKids: false
        }
      };

      // Use resumable upload protocol (no file size limit)
      var token = ScriptApp.getOAuthToken();

      // Step 1: Initiate resumable upload session
      var initResp = UrlFetchApp.fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': 'Bearer ' + token,
          'X-Upload-Content-Length': file.getSize(),
          'X-Upload-Content-Type': file.getMimeType()
        },
        payload: JSON.stringify(resource),
        muteHttpExceptions: true
      });

      if (initResp.getResponseCode() !== 200) {
        throw new Error('Failed to initiate upload: ' + initResp.getResponseCode() + ' ' + initResp.getContentText());
      }

      var uploadUrl = initResp.getHeaders()['Location'] || initResp.getHeaders()['location'];
      if (!uploadUrl) throw new Error('No upload URL returned');

      // Step 2: Upload full file via resumable URL
      var uploadResp = UrlFetchApp.fetch(uploadUrl, {
        method: 'put',
        payload: file.getBlob(),
        headers: {
          'Authorization': 'Bearer ' + token
        },
        muteHttpExceptions: true
      });

      var code = uploadResp.getResponseCode();
      if (code !== 200 && code !== 201) {
        throw new Error('Upload failed: ' + code + ' ' + uploadResp.getContentText());
      }

      var result = JSON.parse(uploadResp.getContentText());

      if (result && result.id) {
        Logger.log('YouTube upload success: ' + result.id + ' — ' + title);

        // Move to Processed
        file.moveTo(processed);

        // Update Sheet submission if matched
        if (meta.rowIndex > 0) {
          markSubmissionUploaded(meta.rowIndex, result.id);
        }

        uploaded.push({
          title: title,
          videoId: result.id,
          url: 'https://www.youtube.com/watch?v=' + result.id,
          requestor: meta.requestor || '',
          email: meta.email || ''
        });
      }
    } catch (e) {
      Logger.log('YouTube upload FAILED for ' + name + ': ' + e.message);
      // Don't move failed files — they'll retry next run
    }
  }

  // Send Teams notification for each upload
  if (uploaded.length > 0) {
    for (var i = 0; i < uploaded.length; i++) {
      var u = uploaded[i];
      notifyTeams('🎬 **Auto-uploaded to YouTube**\\n\\n' +
        '**Title:** ' + u.title + '\\n' +
        '**Video:** [View on YouTube](' + u.url + ')\\n' +
        '**Status:** Private (review in YouTube Studio)\\n' +
        (u.requestor ? '**Requested by:** ' + u.requestor : '') +
        '\\n\\n_Review metadata and set to Public/Unlisted when ready._');
    }
    Logger.log('Uploaded ' + uploaded.length + ' video(s) to YouTube');
  }
}

function matchToSubmission(filename) {
  var config = getConfig();
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('YouTubeSubmissions');
  if (!sheet) return {};

  var data = sheet.getDataRange().getValues();
  var cleanFilename = filename.replace(/\.[^.]+$/, '').toLowerCase().trim();

  // Search from bottom (newest) up for best match
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    // Check if filename field matches (column may vary — check common positions)
    // Also check if title is similar to filename
    var rowTitle = String(row[4] || '').toLowerCase().trim(); // title column
    var rowFilename = String(row[12] || '').toLowerCase().trim(); // filename column (if exists)

    if (rowFilename && (rowFilename === cleanFilename || filename.toLowerCase().indexOf(rowFilename) > -1)) {
      return {
        title: String(row[4] || ''),
        description: String(row[5] || ''),
        requestor: String(row[1] || ''),
        email: String(row[2] || ''),
        privacy: String(row[8] || 'Private'),
        rowIndex: i + 1
      };
    }

    // Fuzzy match on title
    if (rowTitle && (cleanFilename.indexOf(rowTitle) > -1 || rowTitle.indexOf(cleanFilename) > -1)) {
      return {
        title: String(row[4] || ''),
        description: String(row[5] || ''),
        requestor: String(row[1] || ''),
        email: String(row[2] || ''),
        privacy: String(row[8] || 'Private'),
        rowIndex: i + 1
      };
    }
  }

  return {};
}

function markSubmissionUploaded(rowIndex, videoId) {
  var config = getConfig();
  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName('YouTubeSubmissions');
  if (!sheet) return;

  // Find the status column and update it
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var statusCol = -1;
  for (var i = 0; i < header.length; i++) {
    if (String(header[i]).toLowerCase() === 'status') { statusCol = i + 1; break; }
  }
  if (statusCol > 0) {
    sheet.getRange(rowIndex, statusCol).setValue('Uploaded');
  }

  // Add video URL to notes or a dedicated column
  var notesCol = -1;
  for (var j = 0; j < header.length; j++) {
    if (String(header[j]).toLowerCase() === 'notes' || String(header[j]).toLowerCase() === 'videoid') { notesCol = j + 1; break; }
  }
  if (notesCol > 0) {
    var existing = String(sheet.getRange(rowIndex, notesCol).getValue() || '');
    sheet.getRange(rowIndex, notesCol).setValue((existing ? existing + ' | ' : '') + 'YT: https://youtu.be/' + videoId);
  }
}

function notifyTeams(message) {
  var webhook = PropertiesService.getScriptProperties().getProperty('TEAMS_WEBHOOK');
  if (!webhook) return;
  try {
    UrlFetchApp.fetch(webhook, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard',
            version: '1.2',
            body: [{ type: 'TextBlock', text: message, wrap: true }]
          }
        }]
      }),
      muteHttpExceptions: true
    });
  } catch(e) { Logger.log('Teams notify failed: ' + e.message); }
}

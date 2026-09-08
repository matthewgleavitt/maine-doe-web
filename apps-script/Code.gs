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

// Sanitize incoming message content into safe HTML.
// Handles: strings, objects (Teams message body), stringified JSON.
// Preserves formatting tags (p, br, strong, em, b, i, u, a, ul, ol, li, blockquote, div, h1-h6),
// strips everything else, and cleans up dangerous content and Teams cruft attributes.
function cleanMessage(input) {
  if (input == null) return '';
  var text = '';
  if (typeof input === 'object') {
    text = String(input.content || input.plainTextContent || input.plainText || '');
  } else {
    text = String(input);
    if (text.charAt(0) === '{') {
      try {
        var obj = JSON.parse(text);
        if (obj && (obj.content || obj.plainTextContent || obj.plainText)) {
          text = String(obj.content || obj.plainTextContent || obj.plainText);
        }
      } catch (e) { /* not JSON — leave as-is */ }
    }
  }

  // Strip dangerous elements entirely (tag + content)
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
  text = text.replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '');
  text = text.replace(/<embed\b[^>]*>/gi, '');
  // Strip inline event handlers and javascript: URLs
  text = text.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  text = text.replace(/(?:href|src)\s*=\s*(["'])\s*javascript:[^"']*\1/gi, 'href="#"');

  var allowed = { p:1, br:1, strong:1, em:1, b:1, i:1, u:1, a:1, ul:1, ol:1, li:1,
                  blockquote:1, div:1, h1:1, h2:1, h3:1, h4:1, h5:1, h6:1 };

  // Sanitize every tag: strip if not allowed; strip attributes if allowed (except <a> keeps href)
  text = text.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, function(m, slash, tag, attrs) {
    var t = tag.toLowerCase();
    if (!allowed[t]) return '';
    if (t === 'a') {
      if (slash) return '</a>';
      var hrefMatch = attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i);
      if (!hrefMatch || !hrefMatch[1]) return '';
      var href = hrefMatch[1].replace(/"/g, '&quot;');
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">';
    }
    return '<' + slash + t + '>';
  });

  // Collapse empty paragraph/div placeholders (Teams sends <p>&nbsp;</p> between paragraphs)
  text = text.replace(/<p>\s*(?:&nbsp;| |\s)*\s*<\/p>/gi, '');
  text = text.replace(/<div>\s*(?:&nbsp;| |\s)*\s*<\/div>/gi, '');
  // Decode &nbsp; inside content to a regular space
  text = text.replace(/&nbsp;/g, ' ');
  // Collapse whitespace between tags for tidier storage
  text = text.replace(/>\s+</g, '><');
  return text.trim();
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
      whenToUse: String(row[7] || ''), // column H — added so cards can show guidance next to the template
    });
  }

  return { rows: rows, type: 'templates' };
}


// ═══════════════════════════════════════════
// MODERATION QUEUE PROXY
// Fetches the Drupal admin moderation view server-side (no CORS).
// Portal calls Apps Script instead of Drupal directly.
// ═══════════════════════════════════════════

function getModerationQueue() {
  try {
    // No cache-buster on the Drupal URL — CacheService gives us the freshness
    // window we want (90s), and busting Drupal's own upstream cache added
    // hundreds of ms per request for no benefit.
    var resp = UrlFetchApp.fetch('https://www.maine.gov/doe/api/moderation', {
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });
    var code = resp.getResponseCode();
    if (code !== 200) {
      return { error: 'Drupal returned HTTP ' + code, rows: [] };
    }
    var data = JSON.parse(resp.getContentText());
    if (!Array.isArray(data)) {
      return { error: 'Unexpected response shape', rows: [] };
    }
    return { rows: data, type: 'moderation' };
  } catch (e) {
    return { error: e.message, rows: [] };
  }
}


// ═══════════════════════════════════════════
// WEB APP ENTRY POINT
// ═══════════════════════════════════════════

function doGet(e) {
  // Action-based routes come first (OAuth callbacks, etc.) since they
  // may need to return HTML instead of JSON.
  var action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'wpcom_oauth_start') return wpcomOauthStart();
  if (action === 'wpcom_oauth_callback') return wpcomOauthCallback(e);

  var type = (e && e.parameter && e.parameter.type) || 'pages';
  var days = (e && e.parameter && e.parameter.days) || '30';
  var cacheKey = 'portal_' + type + '_' + days;
  // Per-user endpoints must include the identity in the cache key or one
  // user's cached response gets served to the next user with the same TTL.
  if (type === 'my_events') {
    var _emailKey = String((e && e.parameter && e.parameter.email) || '').trim().toLowerCase();
    cacheKey = 'portal_' + type + '_' + _emailKey + '_' + days;
  }
  // Admin-only endpoint: verify the token BEFORE reading cache. Previously
  // the token check happened inside the switch (below), so an unauthenticated
  // caller after a successful admin request would receive the cached admin
  // data from the shared key. Bounce here instead.
  if (type === 'events') {
    var _tk = (e.parameter && e.parameter.token) || '';
    if (!_tk || _tk !== getEventsAdminToken()) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'Access denied' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  var result;

  // Check cache first (skip for endpoints that must always be fresh or that
  // key on parameters not baked into the cache key). ?refresh=1 also bypasses.
  //
  // 'event' is skipped because its response depends on id+token but the shared
  // key was 'portal_event_30' — so Paula's edit of Event A would be served
  // back when Emily edited Event B, leaking one user's event into another's
  // edit form. The endpoint is small and per-user, so no caching is correct.
  //
  // 'moderation' USED to bypass cache too, but that meant every portal load
  // fired a live Drupal round-trip (1-3s) for every user. A 90s TTL is well
  // within the "fresh enough for an approval queue" window, and the Refresh
  // button on Pending Approvals still passes ?refresh=1 to force a bypass.
  var bypassCache = !!(e && e.parameter && e.parameter.refresh);
  var cache = CacheService.getScriptCache();
  if (type !== 'web_stats' && type !== 'event' && !bypassCache) {
    // Payloads bigger than 100KB use chunked storage. All the GA/stats
    // endpoints can spill over depending on the site's volume, so we chunk
    // them consistently.
    var isChunked = (type === 'youtube_stats' || type === 'newsroom_stats' ||
                     type === 'pages' || type === 'files');
    var cached = isChunked ? chunkedCacheGet(cache, cacheKey) : cache.get(cacheKey);
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
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 10000 };
      var allPages = formatPageData(queryGA4(pr));
      // Ship only the top slice — the tile uses totals, the list only
      // needs the leaders. Full 10k rows would be ~2MB round-trip for nothing.
      result = {
        rows: allPages.slice(0, 500),
        totalCount: allPages.length,
        totalViews: allPages.reduce(function(s,p){return s+(p.views||0);}, 0),
        totalUsers: allPages.reduce(function(s,p){return s+(p.users||0);}, 0),
        days: days, type: 'pages'
      };

    } else if (type === 'files') {
      var fr = { dateRanges: [dateRange],
        dimensions: [{ name: 'linkUrl' }, { name: 'customEvent:file_name' }, { name: 'pagePath' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'file_download' } } },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 10000 };
      var allFiles = formatFileData(queryGA4(fr));
      result = {
        rows: allFiles.slice(0, 500),
        totalCount: allFiles.length,
        totalDownloads: allFiles.reduce(function(s,f){return s+(f.clicks||0);}, 0),
        days: days, type: 'files'
      };

    } else if (type === 'file_pages') {
      result = getFilePages();

    } else if (type === 'youtube') {
      result = getYouTubeSubmissions();

    } else if (type === 'events') {
      // Admin-only: full row data including private fields
      var _adminTok = (e.parameter && e.parameter.token) || '';
      if (!_adminTok || _adminTok !== getEventsAdminToken()) {
        result = { error: 'Access denied' };
      } else {
        result = getEventSubmissions();
      }

    } else if (type === 'event') {
      // Single event fetch — for the edit form (submitter token OR admin token)
      result = getSingleEvent(
        (e.parameter && e.parameter.id) || '',
        (e.parameter && e.parameter.token) || ''
      );

    } else if (type === 'calendar') {
      // Public calendar feed: only Published events, past events filtered, recurrences expanded
      result = getPublishedEvents();

    } else if (type === 'templates') {
      result = getTemplates();

    } else if (type === 'announcements') {
      result = getAnnouncements();

    } else if (type === 'publications') {
      result = getPublications();

    } else if (type === 'commons') {
      result = getCommonsPosts();

    } else if (type === 'newsroom_stats') {
      // WordPress.com Stats API — requires an OAuth token in Script Properties.
      result = getNewsroomStats();

    } else if (type === 'youtube_stats') {
      // YouTube Data API v3 + YouTube Analytics API via Apps Script Advanced Services.
      result = getYouTubeStats();

    } else if (type === 'my_events') {
      // Submitter self-service: list events where Contact Email OR Submitter Email
      // matches. No token required — this is an internal-portal convenience, and
      // the calendar is already public. Returns each event's edit token so the
      // client can call updateEvent / deleteEvent without prompting again.
      result = getMyEvents((e.parameter && e.parameter.email) || '');

    } else if (type === 'drupal_pages') {
      result = getDrupalPages();

    } else if (type === 'drupal_files') {
      result = getDrupalFiles();

    } else if (type === 'moderation') {
      result = getModerationQueue();

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

  // Cache TTLs are tuned per data type. CacheService caps at 100KB/key so
  // huge payloads may silently fail — the try/catch swallows that.
  // 'event' is intentionally NOT cached — key would collide across events (see read guard above).
  if (type !== 'web_stats' && type !== 'event' && !result.error) {
    var ttl;
    switch (type) {
      // Approval queue — 90s is fresh enough for a moderation view; the
      // Refresh button still passes ?refresh=1 to force a bypass.
      case 'moderation':
        ttl = 90; break;
      // Fresh — user-facing writes should show quickly. Calendar was 300s
      // but the warmer runs every 10 min → entries expired mid-cycle and the
      // next visitor paid Apps Script cold-start + Sheet read + recurrence
      // expansion. Bumped to 900s so cache always outlives the warmer.
      case 'calendar':
        ttl = 900; break;
      case 'events': case 'commons':
        ttl = 300; break;
      // Real-time — manage view needs to reflect the edit the user JUST made
      case 'my_events':
        ttl = 30; break;
      // GA data is expensive to build (10k-row queries). Cache to the CacheService
      // ceiling (6 hours). A nightly + noon warmCache trigger keeps it fresh.
      case 'pages': case 'files': case 'file_pages':
        ttl = 21600; break;
      // Moderate — template + inbox data. TTLs must be >= the warmCache
      // interval (10 min) so warming actually holds — 900s gives a safe margin.
      case 'youtube': case 'templates': case 'announcements':
        ttl = 900; break;
      // Stable — Drupal indexes, Mailchimp campaigns, WP.com stats rarely change hour-to-hour
      case 'drupal_pages': case 'drupal_files': case 'publications':
        ttl = 1800; break;
      // Newsroom stats: 60 min. Longer than others because the fetch touches
      // 8 wp.com endpoints and warming keeps first-load fast.
      case 'newsroom_stats': case 'youtube_stats':
        ttl = 3600; break;
      default:
        ttl = 300;
    }
    if (type === 'youtube_stats' || type === 'newsroom_stats' ||
        type === 'pages' || type === 'files') {
      // Large payload — chunk it. Clear any stale non-chunked entry first.
      try { cache.remove(cacheKey); } catch(re) {}
      var ok = chunkedCachePut(cache, cacheKey, jsonStr, ttl);
      if (!ok) {
        chunkedCacheRemove(cache, cacheKey);
        Logger.log('chunkedCachePut failed (' + type + ', ' + jsonStr.length + ' bytes)');
      }
    } else {
      try {
        cache.put(cacheKey, jsonStr, ttl);
      } catch(ce) {
        try { cache.remove(cacheKey); } catch(re) {}
        Logger.log('cache.put failed (' + type + ', ' + jsonStr.length + ' bytes): ' + ce.message + ' — stale entry evicted');
      }
    }
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
      // New schema submission — hands off to submitNewEvent in Calendar.gs
      var submitRes = submitNewEvent(body.fields || {});
      if (submitRes.error) { result = submitRes; }
      else {
        var fields = body.fields || {};

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
                        { title: 'Event', value: fields['Title'] || '' },
                        { title: 'From', value: (fields['Contact Name'] || '') + ' (' + (fields['Focus Area'] || '') + ')' },
                        { title: 'Type', value: fields['Type'] || '' },
                        { title: 'Date', value: (fields['Start Date'] || '') + ' ' + (fields['Start Time'] || '') },
                        { title: 'Location', value: fields['Venue Name'] || fields['Location Type'] || '' },
                        { title: 'Audience', value: fields['Intended Audience'] || '' }
                      ]},
                      { type: 'TextBlock', text: (fields['Description Teaser'] || fields['Description'] || '').replace(/<[^>]+>/g, ' ').substring(0, 300), wrap: true, size: 'Small' }
                    ]
                  }
                }]
              })
            });
          }
        } catch(webhookErr) { Logger.log('Teams webhook failed: ' + webhookErr.message); }

        result = submitRes;
      }

    } else if (body.action === 'event_update') {
      // Called from the edit form (uses per-event edit token OR admin token)
      result = updateEvent(body.id, body.token, body.fields || {});

    } else if (body.action === 'event_delete') {
      // Soft-delete: sets Status = Cancelled
      result = deleteEvent(body.id, body.token);

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
        var cleanTitle = cleanMessage(body.title) || 'Announcement';
        var cleanBody = cleanMessage(body.message);
        sheet.appendRow([
          dateStr,
          cleanTitle,
          cleanBody,
          body.priority || 'normal'
        ]);
        // Bust the announcements cache so the new row shows immediately,
        // and re-warm with fresh data so the next read is fast.
        try {
          var cache = CacheService.getScriptCache();
          cache.remove('portal_announcements_30');
          var fresh = JSON.stringify(getAnnouncements());
          cache.put('portal_announcements_30', fresh, 300);
        } catch (ce) { Logger.log('Cache refresh failed: ' + ce.message); }
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

// Scrape the public Maine DOE Commons index page and return recent posts.
// The Drupal site doesn't expose JSON:API for blog_post, so we parse the
// rendered HTML — the .blog-card block structure is stable enough for this.
function getCommonsPosts() {
  var CACHE_KEY = 'commons_posts_v1';
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }

  var url = 'https://www.maine.gov/doe/commons';
  var html;
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 MaineDOE-CommsPortal' }
    });
    if (resp.getResponseCode() !== 200) {
      return { error: 'Commons returned ' + resp.getResponseCode(), posts: [] };
    }
    html = resp.getContentText();
  } catch (err) {
    return { error: 'Fetch failed: ' + err.message, posts: [] };
  }

  var posts = [];
  var cardRe = /<div class="blog-card">([\s\S]*?)<\/div>\s*<\/span>\s*<\/div>\s*<\/div>/g;
  var m;
  while ((m = cardRe.exec(html)) !== null) {
    var body = m[1];

    var img = '';
    var imgM = body.match(/<img[^>]+src="([^"]+)"/);
    if (imgM) {
      img = imgM[1];
      if (img.indexOf('http') !== 0) img = 'https://www.maine.gov' + img;
    }

    var team = '';
    var teamM = body.match(/<span class="blog-section-pill[^"]*">([^<]+)<\/span>/);
    if (teamM) team = _decodeEntities(teamM[1].trim());

    var date = '';
    var dateM = body.match(/<time datetime="([^"]+)"/);
    if (dateM) date = dateM[1];

    var title = '';
    var href = '';
    var titleM = body.match(/<h2 class="blog-card__title">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (titleM) {
      href = titleM[1];
      if (href.indexOf('http') !== 0) href = 'https://www.maine.gov' + href;
      title = _decodeEntities(titleM[2].replace(/<[^>]+>/g, '').trim());
    }

    var excerpt = '';
    var exM = body.match(/<p class="blog-card__excerpt">([\s\S]*?)<\/p>/);
    if (exM) excerpt = _decodeEntities(exM[1].replace(/<[^>]+>/g, '').trim());

    if (title && href) {
      posts.push({
        title: title,
        team: team,
        date: date,
        excerpt: excerpt,
        image: img,
        url: href,
      });
    }
  }

  var result = { posts: posts, count: posts.length, fetched: new Date().toISOString() };
  try { cache.put(CACHE_KEY, JSON.stringify(result), 900); } catch (e) { /* cache size cap; ignore */ }
  return result;
}

function _decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    // Generic numeric entities: &#8211; and friends. Handles both ; and
    // missing-semicolon variants that WP.com occasionally emits.
    .replace(/&#(\d+);?/g, function(_, code) {
      try { return String.fromCodePoint(parseInt(code, 10)); } catch (e) { return ''; }
    })
    .replace(/&#x([0-9a-fA-F]+);?/g, function(_, code) {
      try { return String.fromCodePoint(parseInt(code, 16)); } catch (e) { return ''; }
    });
}


// ═══════════════════════════════════════════
// WORDPRESS.COM STATS (Maine DOE Newsroom)
// ═══════════════════════════════════════════
//
// One-time setup:
//   1. Register an app at https://developer.wordpress.com/apps/ with redirect
//      URL = the exec URL of THIS web app + '?action=wpcom_oauth_callback'
//   2. Set Script Properties:
//      - WPCOM_CLIENT_ID
//      - WPCOM_CLIENT_SECRET
//      - WPCOM_SITE_DOMAIN = 'mainedoenews.net' (or whichever site)
//   3. Visit <exec-url>?action=wpcom_oauth_start once, approve on WordPress.com.
//      On callback we store WPCOM_ACCESS_TOKEN in Script Properties.
//   4. From then on, ?type=newsroom_stats returns real analytics.

var WPCOM_SITE_DEFAULT = 'mainedoenews.net';

function _wpcomProp(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}
function _wpcomExecUrl() {
  return ScriptApp.getService().getUrl();
}
function _wpcomRedirectUri() {
  return _wpcomExecUrl() + '?action=wpcom_oauth_callback';
}

// Step 1 of OAuth — send the user to WordPress.com's authorize page.
function wpcomOauthStart() {
  var clientId = _wpcomProp('WPCOM_CLIENT_ID');
  if (!clientId) {
    return HtmlService.createHtmlOutput(
      '<h2>Missing WPCOM_CLIENT_ID</h2>' +
      '<p>Set <code>WPCOM_CLIENT_ID</code> and <code>WPCOM_CLIENT_SECRET</code> in Apps Script Script Properties, then try again.</p>'
    );
  }
  var url = 'https://public-api.wordpress.com/oauth2/authorize' +
    '?client_id=' + encodeURIComponent(clientId) +
    '&redirect_uri=' + encodeURIComponent(_wpcomRedirectUri()) +
    '&response_type=code' +
    '&scope=global';
  // Apps Script sandboxes iframes for HtmlService, so we bounce via meta refresh.
  return HtmlService.createHtmlOutput(
    '<meta http-equiv="refresh" content="0;url=' + url.replace(/"/g, '&quot;') + '">' +
    '<p>Redirecting to WordPress.com to authorize the app…</p>' +
    '<p>If nothing happens, <a href="' + url + '">click here</a>.</p>'
  );
}

// Step 2 of OAuth — WordPress.com redirects here with ?code=XXX. We exchange
// that for an access token and store it.
function wpcomOauthCallback(e) {
  var code = (e && e.parameter && e.parameter.code) || '';
  var err = (e && e.parameter && e.parameter.error) || '';
  if (err) {
    return HtmlService.createHtmlOutput('<h2>Authorization failed</h2><p>' + err + '</p>');
  }
  if (!code) {
    return HtmlService.createHtmlOutput('<h2>No auth code returned</h2><p>Try starting over at <code>?action=wpcom_oauth_start</code>.</p>');
  }
  var clientId = _wpcomProp('WPCOM_CLIENT_ID');
  var clientSecret = _wpcomProp('WPCOM_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return HtmlService.createHtmlOutput('<h2>Missing client credentials</h2><p>Set WPCOM_CLIENT_ID and WPCOM_CLIENT_SECRET in Script Properties.</p>');
  }
  var resp = UrlFetchApp.fetch('https://public-api.wordpress.com/oauth2/token', {
    method: 'post',
    payload: {
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: _wpcomRedirectUri(),
      grant_type: 'authorization_code',
    },
    muteHttpExceptions: true,
  });
  var body = resp.getContentText();
  var j;
  try { j = JSON.parse(body); } catch (ex) { j = {}; }
  if (!j.access_token) {
    return HtmlService.createHtmlOutput('<h2>Token exchange failed</h2><pre>' + body.replace(/</g, '&lt;') + '</pre>');
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('WPCOM_ACCESS_TOKEN', j.access_token);
  if (j.blog_url && !props.getProperty('WPCOM_SITE_DOMAIN')) {
    props.setProperty('WPCOM_SITE_DOMAIN', String(j.blog_url).replace(/^https?:\/\//, '').replace(/\/$/, ''));
  }
  // Bust the cached stats so the next fetch is fresh.
  try { CacheService.getScriptCache().remove('portal_newsroom_stats_30'); } catch (ce) {}
  return HtmlService.createHtmlOutput(
    '<h2>WordPress.com connected</h2>' +
    '<p>Access token stored. You can close this tab and reload the Newsroom tab in the portal.</p>'
  );
}

function _wpcomFetch(path) {
  var token = _wpcomProp('WPCOM_ACCESS_TOKEN');
  if (!token) return { error: 'not_authenticated' };
  var url = 'https://public-api.wordpress.com/rest/v1.1' + path;
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  var body = resp.getContentText();
  var code = resp.getResponseCode();
  try {
    var j = JSON.parse(body);
    if (code >= 400) return { error: j.error || ('http_' + code), message: j.message || body.substring(0, 200) };
    return j;
  } catch (ex) {
    return { error: 'bad_json', message: body.substring(0, 200) };
  }
}

// Public entry point for the frontend.
function getNewsroomStats() {
  var token = _wpcomProp('WPCOM_ACCESS_TOKEN');
  if (!token) {
    return { error: 'WordPress.com not authorized yet. Visit ' + _wpcomExecUrl() + '?action=wpcom_oauth_start' };
  }
  var site = _wpcomProp('WPCOM_SITE_DOMAIN') || WPCOM_SITE_DEFAULT;
  var siteSeg = '/sites/' + encodeURIComponent(site);

  var summary = _wpcomFetch(siteSeg + '/stats/summary');
  var top30 = _wpcomFetch(siteSeg + '/stats/top-posts?period=month&num=1&max=10');
  var top7 = _wpcomFetch(siteSeg + '/stats/top-posts?period=week&num=1&max=10');
  // Merged top-posts across the last 12 months. Views from this feed enrich
  // the full article list below — anything not in a month's top-100 shows
  // dashes on the frontend (still findable, just no view data).
  var top12m = _wpcomFetch(siteSeg + '/stats/top-posts?period=month&num=12&max=100');
  var referrers = _wpcomFetch(siteSeg + '/stats/referrers?period=month&num=1&max=8');
  var visits = _wpcomFetch(siteSeg + '/stats/visits?unit=day&quantity=30');
  // Full list of articles published in the last 365 days. Powers "search all
  // articles" so authors can find their own posts even if underperforming.
  var articlesRes = _fetchNewsroomArticles365(site);
  var articles365 = articlesRes.articles || [];

  function _shouldExcludeEntry(p) {
    var t = String(p.title || '').trim();
    if (!t) return true;
    if (/^\(untitled\)$/i.test(t)) return true;
    if (/^#\d+\s*\(untitled\)$/i.test(t)) return true;
    if (/^home$/i.test(t)) return true;
    if (/^home page$/i.test(t)) return true;
    // WP.com titles archives like "Category Archives: X" / "Tag Archives: X".
    if (/^(category|tag|author|monthly|daily|yearly|date)\s+archives?\b/i.test(t)) return true;
    if (/\s+archives$/i.test(t)) return true;
    var href = String(p.href || '');
    // Root of the site — the home page even if the title is something else.
    if (/^https?:\/\/[^\/]+\/?$/.test(href)) return true;
    // Category / tag / author / date-archive / pagination URLs.
    if (/\/(category|tag|author)\//i.test(href)) return true;
    if (/\/page\/\d+\/?/i.test(href)) return true;
    if (/\/\d{4}\/?(\?|$)/.test(href)) return true;
    if (/\/\d{4}\/\d{2}\/?(\?|$)/.test(href)) return true;
    // Real post URLs on mainedoenews.net follow /YYYY/MM/DD/slug — everything
    // else on the domain is a page, an archive, or a taxonomy landing.
    if (/mainedoenews\.net/i.test(href) && !/\/\d{4}\/\d{2}\/\d{2}\//.test(href)) return true;
    return false;
  }

  function normalizeTopPosts(res) {
    if (!res || res.error) return [];
    var days = res.days || {};
    var keys = Object.keys(days);
    if (!keys.length) return [];
    var pv = (days[keys[0]] || {}).postviews || [];
    return pv
      .filter(function(p) { return !_shouldExcludeEntry(p); })
      .map(function(p) {
        return {
          id: p.id,
          title: _decodeEntities(String(p.title || '')),
          url: (p.href || '').replace(/^http:/, 'https:'),
          views: p.views,
          date: p.date || '',
        };
      });
  }

  function mergeTopPostsAcrossPeriods(res) {
    if (!res || res.error) return [];
    var days = res.days || {};
    var byId = {};
    Object.keys(days).forEach(function(dateKey) {
      var pv = (days[dateKey] || {}).postviews || [];
      pv.forEach(function(p) {
        if (_shouldExcludeEntry(p)) return;
        var key = String(p.id);
        if (!byId[key]) {
          byId[key] = {
            id: p.id,
            title: _decodeEntities(String(p.title || '')),
            url: (p.href || '').replace(/^http:/, 'https:'),
            views: 0,
            date: p.date || '',
          };
        }
        byId[key].views += Number(p.views) || 0;
      });
    });
    var arr = [];
    for (var k in byId) arr.push(byId[k]);
    return arr.sort(function(a, b) { return b.views - a.views; });
  }
  function normalizeReferrers(res) {
    if (!res || res.error) return [];
    var days = res.days || {};
    var keys = Object.keys(days);
    if (!keys.length) return [];
    var groups = (days[keys[0]] || {}).groups || [];
    return groups.slice(0, 8).map(function(g) {
      return { name: g.name || g.group || '', total: g.total || 0, url: g.url || '' };
    });
  }
  function normalizeVisits(res) {
    if (!res || res.error || !Array.isArray(res.data)) return [];
    // WP returns [[date, views, visitors, ...]] — flatten to {date, views, visitors}.
    var fieldIdx = { period: 0, views: 1, visitors: 2 };
    (res.fields || []).forEach(function(f, i) { fieldIdx[f] = i; });
    return res.data.map(function(row) {
      return {
        date: row[fieldIdx.period],
        views: Number(row[fieldIdx.views] || 0),
        visitors: Number(row[fieldIdx.visitors] || 0),
      };
    });
  }

  // Prefer the per-day visits array for period totals. summary.views has
  // ambiguous semantics (it changes shape with period params), so we roll
  // our own from a source that always means "views on this day".
  var visitsRows = normalizeVisits(visits);
  function sumField(rows, field) {
    return rows.reduce(function(a, r) { return a + (Number(r[field]) || 0); }, 0);
  }
  var todayRow = visitsRows.length ? visitsRows[visitsRows.length - 1] : {};
  var last7 = visitsRows.slice(-7);

  // Build a lookup of merged views across all 12 months, then attach to
  // the full 365-day article list. Anything not in the merge stays viewless.
  var viewsById = {};
  mergeTopPostsAcrossPeriods(top12m).forEach(function(p) {
    viewsById[String(p.id)] = p.views;
  });
  var articlesWithViews = (articles365 || []).map(function(a) {
    var id = String(a.id);
    var v = viewsById.hasOwnProperty(id) ? viewsById[id] : null;
    return { id: a.id, title: a.title, url: a.url, date: a.date, views: v };
  });

  return {
    summary: {
      viewsToday: Number(todayRow.views) || 0,
      visitorsToday: Number(todayRow.visitors) || 0,
      views7d: sumField(last7, 'views'),
      views30d: sumField(visitsRows, 'views'),
      visitors30d: sumField(visitsRows, 'visitors'),
      posts: (summary && !summary.error && summary.posts) || 0,
      articles365Count: articlesWithViews.length,
    },
    top30: normalizeTopPosts(top30),
    top7: normalizeTopPosts(top7),
    articles: articlesWithViews,
    referrers: normalizeReferrers(referrers),
    visits: visitsRows,
    fetchedAt: new Date().toISOString(),
    site: site,
    errors: [
      summary && summary.error ? { source: 'summary', error: summary.error } : null,
      top30 && top30.error ? { source: 'top30', error: top30.error } : null,
      top7 && top7.error ? { source: 'top7', error: top7.error } : null,
      top12m && top12m.error ? { source: 'top12m', error: top12m.error } : null,
      referrers && referrers.error ? { source: 'referrers', error: referrers.error } : null,
      visits && visits.error ? { source: 'visits', error: visits.error } : null,
      articlesRes && articlesRes.error ? { source: 'articles', error: articlesRes.error } : null,
    ].filter(Boolean),
    articlesDiag: articlesRes ? articlesRes.diag : null,
  };
}

// Full list of Newsroom articles published in the last 365 days.
// Uses UrlFetchApp.fetchAll to page in parallel — cuts cold-start latency
// from ~5s (8 sequential calls) to ~1s (all pages concurrent).
function _fetchNewsroomArticles365(site) {
  var diag = [];
  var token = _wpcomProp('WPCOM_ACCESS_TOKEN');
  if (!token) return { articles: [], error: 'no_token', diag: diag };
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  var after = Utilities.formatDate(cutoff, 'UTC', "yyyy-MM-dd'T'HH:mm:ss");

  // Issue all pages in parallel. 800 posts is well above the ~400 we expect,
  // giving headroom for a busy year without a follow-up call.
  var requests = [];
  for (var offset = 0; offset < 800; offset += 100) {
    requests.push({
      url: 'https://public-api.wordpress.com/rest/v1.1/sites/' + encodeURIComponent(site) +
        '/posts?after=' + encodeURIComponent(after) +
        '&number=100&offset=' + offset +
        '&order_by=date&order=DESC' +
        '&fields=ID,title,URL,date,status',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
  }

  var responses;
  try {
    responses = UrlFetchApp.fetchAll(requests);
  } catch (err) {
    return { articles: [], error: 'fetchAll_threw: ' + err.message, diag: diag };
  }

  var out = [];
  var seenIds = {};
  var lastError = null;
  for (var i = 0; i < responses.length; i++) {
    var resp = responses[i];
    var offset = i * 100;
    var code = resp.getResponseCode();
    var text = resp.getContentText();
    var body;
    try { body = JSON.parse(text); } catch (ex) {
      lastError = 'bad_json (http ' + code + '): ' + text.substring(0, 200);
      diag.push({ offset: offset, error: lastError });
      continue;
    }
    if (code >= 400 || (body && body.error)) {
      lastError = (body && (body.error + (body.message ? ': ' + body.message : ''))) || ('http_' + code);
      diag.push({ offset: offset, http: code, error: lastError });
      continue;
    }
    diag.push({ offset: offset, http: code, returned: (body.posts || []).length });
    if (!Array.isArray(body.posts)) continue;
    body.posts.forEach(function(p) {
      if (seenIds[p.ID]) return;
      seenIds[p.ID] = true;
      var title = _decodeEntities(String(p.title || '').replace(/<[^>]+>/g, '').trim());
      if (!title) return;
      out.push({
        id: p.ID,
        title: title,
        url: String(p.URL || '').replace(/^http:/, 'https:'),
        date: p.date || '',
      });
    });
  }
  // Sort newest-first — pagination order isn't guaranteed with fetchAll.
  out.sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
  return { articles: out, error: lastError, diag: diag };
}

// ═══════════════════════════════════════════
// YOUTUBE ANALYTICS
// ═══════════════════════════════════════════
//
// Uses Apps Script's built-in advanced services:
//   YouTube (Data API v3) — channel + video metadata
//   YouTubeAnalytics — per-day metrics, subscriber gains, watch time
//
// One-time setup:
//   1. In Apps Script: Services (+ icon) → add "YouTube Data API v3" and
//      "YouTube Analytics API". Version v3 and v2 respectively.
//   2. In the linked Cloud project, enable both APIs. Apps Script's
//      "Change project" prompt links you straight there.
//   3. Set Script Property YT_CHANNEL_ID to the channel's ID
//      (starts with "UC..."). Handle isn't enough — needs the ID.
//   4. The Google account running the Web App must have Owner or Manager
//      role on the channel for the Analytics API to return anything.
//      Data API works for anyone but Analytics API is per-owner.

// Chunked cache helpers — CacheService caps at 100KB per key. For payloads
// like the YouTube video list (~600KB) we split into ~90KB chunks and store
// each under its own key. Read reassembles them; if any chunk is missing
// (partial expiry, quota) we return null so the caller does a fresh fetch.
var CHUNK_SIZE_BYTES = 90 * 1024;
var CHUNK_MAX = 20; // hard cap = 1.8 MB total

function chunkedCachePut(cache, baseKey, jsonStr, ttl) {
  var chunks = [];
  for (var i = 0; i < jsonStr.length; i += CHUNK_SIZE_BYTES) {
    chunks.push(jsonStr.substring(i, i + CHUNK_SIZE_BYTES));
  }
  if (chunks.length > CHUNK_MAX) return false;
  var putMap = { '_meta': JSON.stringify({ n: chunks.length, len: jsonStr.length }) };
  chunks.forEach(function(c, i) { putMap['_p' + i] = c; });
  try {
    Object.keys(putMap).forEach(function(suffix) {
      cache.put(baseKey + suffix, putMap[suffix], ttl);
    });
    return true;
  } catch (e) { return false; }
}

function chunkedCacheGet(cache, baseKey) {
  var metaStr = cache.get(baseKey + '_meta');
  if (!metaStr) return null;
  var meta;
  try { meta = JSON.parse(metaStr); } catch (e) { return null; }
  var chunkKeys = [];
  for (var i = 0; i < meta.n; i++) chunkKeys.push(baseKey + '_p' + i);
  var chunkMap = cache.getAll(chunkKeys);
  var out = '';
  for (var j = 0; j < meta.n; j++) {
    var c = chunkMap[baseKey + '_p' + j];
    if (c === undefined || c === null) return null;
    out += c;
  }
  if (out.length !== meta.len) return null;
  return out;
}

function chunkedCacheRemove(cache, baseKey) {
  cache.remove(baseKey + '_meta');
  for (var i = 0; i < CHUNK_MAX; i++) cache.remove(baseKey + '_p' + i);
}


function getYouTubeStats() {
  var channelId = PropertiesService.getScriptProperties().getProperty('YT_CHANNEL_ID');
  if (!channelId) {
    return { error: 'YouTube channel not configured. Set YT_CHANNEL_ID in Apps Script Script Properties (must be the channel ID starting with "UC...", not the handle).' };
  }

  var result = {
    channel: null,
    videos: [],
    videosReturned: 0,
    playlistPagesFetched: 0,
    analytics: null,
    errors: [],
    fetchedAt: new Date().toISOString(),
  };

  // 1. Channel-level stats via Data API.
  try {
    var chResp = YouTube.Channels.list('snippet,statistics,contentDetails', { id: channelId });
    if (!chResp.items || !chResp.items.length) {
      return { error: 'Channel not found: ' + channelId + '. Double-check YT_CHANNEL_ID.' };
    }
    var ch = chResp.items[0];
    result.channel = {
      title: ch.snippet.title,
      customUrl: ch.snippet.customUrl || '',
      description: ch.snippet.description || '',
      thumbnail: ch.snippet.thumbnails && ch.snippet.thumbnails.high ? ch.snippet.thumbnails.high.url : '',
      subscribers: Number(ch.statistics.subscriberCount || 0),
      totalViews: Number(ch.statistics.viewCount || 0),
      videoCount: Number(ch.statistics.videoCount || 0),
      uploadsPlaylistId: ch.contentDetails && ch.contentDetails.relatedPlaylists ? ch.contentDetails.relatedPlaylists.uploads : null,
    };
  } catch (chErr) {
    return { error: 'Data API call failed: ' + chErr.message + ' — check that YouTube Data API v3 is enabled as a service in this Apps Script project.' };
  }

  // 2. Paginate through the entire uploads playlist, then fetch video stats
  // in batches. Cap at 1500 videos to bound execution time — the endpoint
  // caches for an hour so a first-time cold path of a few seconds is fine.
  try {
    if (result.channel.uploadsPlaylistId) {
      var allVideoIds = [];
      var pageToken = null;
      var pagesFetched = 0;
      // Ceiling only exists to guard against runaway loops if the API returns
      // a bad nextPageToken. 200 pages * 50 = 10,000 videos, way past the
      // channel's real size but bounded so a bug can't fry the quota.
      var MAX_PAGES = 200;
      while (pagesFetched < MAX_PAGES) {
        var listArgs = {
          playlistId: result.channel.uploadsPlaylistId,
          maxResults: 50,
        };
        if (pageToken) listArgs.pageToken = pageToken;
        var playlistResp = YouTube.PlaylistItems.list('contentDetails', listArgs);
        (playlistResp.items || []).forEach(function(item) {
          if (item.contentDetails && item.contentDetails.videoId) {
            allVideoIds.push(item.contentDetails.videoId);
          }
        });
        pagesFetched++;
        if (!playlistResp.nextPageToken) break;
        pageToken = playlistResp.nextPageToken;
      }
      result.playlistPagesFetched = pagesFetched;

      // Videos.list takes up to 50 IDs per call — batch through them.
      for (var i = 0; i < allVideoIds.length; i += 50) {
        var batch = allVideoIds.slice(i, i + 50);
        var videosResp = YouTube.Videos.list('snippet,statistics,contentDetails,status', {
          id: batch.join(','),
        });
        (videosResp.items || []).forEach(function(v) {
          var thumb = '';
          if (v.snippet.thumbnails) {
            thumb = (v.snippet.thumbnails.medium || v.snippet.thumbnails.high || v.snippet.thumbnails.default || {}).url || '';
          }
          result.videos.push({
            id: v.id,
            title: v.snippet.title,
            publishedAt: v.snippet.publishedAt,
            thumbnail: thumb,
            duration: v.contentDetails ? v.contentDetails.duration : '',
            privacy: v.status ? v.status.privacyStatus : '',
            views: Number(v.statistics.viewCount || 0),
            likes: Number(v.statistics.likeCount || 0),
            comments: Number(v.statistics.commentCount || 0),
            url: 'https://www.youtube.com/watch?v=' + v.id,
          });
        });
      }
    }
    result.videosReturned = result.videos.length;
  } catch (vidErr) {
    result.errors.push({ source: 'videos', error: vidErr.message });
    result.videosReturned = result.videos.length;
  }

  // 3. Rolled-up analytics — views, subscriber changes, watch time for the
  // last 30 days. YouTubeAnalytics is a separate advanced service; if it
  // isn't enabled or the running account can't see this channel's stats,
  // this call throws and we surface it as a non-fatal error.
  try {
    var endDate = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
    var startD = new Date();
    startD.setDate(startD.getDate() - 30);
    var startDate = Utilities.formatDate(startD, 'UTC', 'yyyy-MM-dd');

    // Only query for the specific channel. No "MINE" fallback — that returns
    // whatever primary channel the deploy owner's Google identity has, which
    // is misleading if it's not the actual DOE channel.
    var totals = YouTubeAnalytics.Reports.query({
      ids: 'channel==' + channelId,
      startDate: startDate,
      endDate: endDate,
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares',
    });

    if (totals.rows && totals.rows.length) {
      var row = totals.rows[0];
      result.analytics = {
        period: { start: startDate, end: endDate, days: 30 },
        views: Number(row[0] || 0),
        watchTimeMinutes: Number(row[1] || 0),
        avgViewSeconds: Number(row[2] || 0),
        subscribersGained: Number(row[3] || 0),
        subscribersLost: Number(row[4] || 0),
        netSubscribers: Number(row[3] || 0) - Number(row[4] || 0),
        likes: Number(row[5] || 0),
        comments: Number(row[6] || 0),
        shares: Number(row[7] || 0),
      };
    }
  } catch (anErr) {
    result.errors.push({
      source: 'analytics',
      error: anErr.message,
      hint: 'Enable "YouTube Analytics API" as a service in Apps Script and confirm this account has Owner/Manager role on the channel.'
    });
  }

  return result;
}


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
  // NOTE: Anonymous JSON:API only returns what an anon user is allowed to see.
  // A prior version of this list included 'article' and 'instructional_page',
  // which don't exist on this Drupal (JSON:API root confirms these types).
  // If page counts here look low, that's the Drupal permission layer — the
  // JSON:API root exposes these node types: blog_post, home_page,
  // multi_column_page, newsletter_issue, web_guide, webform. To pull the
  // full set (including restricted content), the Script needs an authorized
  // request (OAuth or Basic Auth against a Drupal user with node-view perms).
  var NODE_TYPES = ['multi_column_page','web_guide','home_page','newsletter_issue'];
  var TYPE_LABELS = {'multi_column_page':'Basic Template page','web_guide':'Web Guide','home_page':'Home page','newsletter_issue':'Newsletter issue'};
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

  var url = isResume ? resumeUrl : BASE + '/file/file?fields[file--file]=filename,uri,filemime,filesize,created,drupal_internal__fid&sort=-created&page[limit]=50';
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

  // TTL rule: warmed entries must outlive the warmCache trigger interval
  // (10 min) so an entry never expires between two warmings and leaves users
  // waiting on cold Apps Script. 900s = 15 min gives a 50% safety margin.

  // Announcements
  try {
    var annData = JSON.stringify(getAnnouncements());
    cache.put('portal_announcements_30', annData, 900);
    warmed.push('announcements');
  } catch(e) { Logger.log('Warm announcements failed: ' + e.message); }

  // YouTube submissions
  try {
    var ytData = JSON.stringify(getYouTubeSubmissions());
    cache.put('portal_youtube_30', ytData, 900);
    warmed.push('youtube');
  } catch(e) { Logger.log('Warm youtube failed: ' + e.message); }

  // Event submissions
  try {
    var evData = JSON.stringify(getEventSubmissions());
    cache.put('portal_events_30', evData, 900);
    warmed.push('events');
  } catch(e) { Logger.log('Warm events failed: ' + e.message); }

  // Templates
  try {
    var tmplData = JSON.stringify(getTemplates());
    cache.put('portal_templates_30', tmplData, 900);
    warmed.push('templates');
  } catch(e) { Logger.log('Warm templates failed: ' + e.message); }

  // Publications/Mailchimp — longer TTL (30 min) since Mailchimp is 3-8s cold
  // and campaigns rarely change hour-to-hour.
  try {
    var pubData = JSON.stringify(getPublications());
    cache.put('portal_publications_30', pubData, 1800);
    warmed.push('publications');
  } catch(e) { Logger.log('Warm publications failed: ' + e.message); }

  // Moderation queue — biggest win. Was previously uncached AND unwarmed, so
  // every portal load fired a live Drupal round-trip (1-3s). 90s TTL matches
  // the doGet write TTL — always fresh, never cold.
  try {
    var modData = JSON.stringify(getModerationQueue());
    cache.put('portal_moderation_30', modData, 90);
    warmed.push('moderation');
  } catch(e) { Logger.log('Warm moderation failed: ' + e.message); }

  // Calendar feed — expensive because getPublishedEvents iterates the
  // EventSubmissions sheet AND expands every recurring series. Went from
  // fast to slow after 25+ new rows landed (BTAM alone is 16 dates). Warm
  // it every cycle so the public calendar page is never cold. TTL 900s
  // keeps entries alive between warmings.
  try {
    var calData = JSON.stringify(getPublishedEvents());
    cache.put('portal_calendar_30', calData, 900);
    warmed.push('calendar');
  } catch(e) { Logger.log('Warm calendar failed: ' + e.message); }

  // Newsroom stats — 60 min cache. Payload can spill over 100KB (article
  // list + featured images), so store chunked.
  try {
    var newsroomData = JSON.stringify(getNewsroomStats());
    var newsKey = 'portal_newsroom_stats_30';
    try { cache.remove(newsKey); } catch(re) {}
    var okNews = chunkedCachePut(cache, newsKey, newsroomData, 3600);
    warmed.push('newsroom_stats(' + Math.ceil(newsroomData.length/1024) + 'KB' + (okNews?'':' - too big to chunk') + ')');
  } catch(e) { Logger.log('Warm newsroom_stats failed: ' + e.message); }

  // YouTube analytics — 60 min cache. Payload is big (~600KB with all videos),
  // stored via chunkedCachePut across multiple 90KB keys.
  try {
    var ytData = JSON.stringify(getYouTubeStats());
    var ytKey = 'portal_youtube_stats_30';
    try { cache.remove(ytKey); } catch(re) {} // clear any legacy single-key entry
    var okYt = chunkedCachePut(cache, ytKey, ytData, 3600);
    if (okYt) warmed.push('youtube_stats(' + Math.ceil(ytData.length/1024) + 'KB)');
    else Logger.log('Warm youtube_stats: payload too big to chunk (' + ytData.length + ' bytes)');
  } catch(e) { Logger.log('Warm youtube_stats failed: ' + e.message); }

  // NOTE: Drupal pages/files are NOT warmed here — they're cached in Sheets
  // by cacheDrupalData (runs every 30 min) and served directly from Sheets.
  // The Sheet data is too large for CacheService's 100KB-per-key limit anyway.

  // GA4 pages — 30 day default. Cached to the CacheService ceiling (6h).
  try {
    var dateRange = getDateRange('30');
    var pr = { dateRanges: [dateRange],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'averageSessionDuration' }],
      dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/doe/' } } },
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 10000 };
    var allPages = formatPageData(queryGA4(pr));
    // Shape must match doGet's `pages` response — dashboard tiles read
    // totalViews/totalUsers, and the warmed entry was previously missing
    // both, so cards silently rendered blanks whenever the warmer beat the
    // user to the cache.
    var pageResult = {
      rows: allPages.slice(0, 500),
      totalCount: allPages.length,
      totalViews: allPages.reduce(function(s,p){ return s + (p.views||0); }, 0),
      totalUsers: allPages.reduce(function(s,p){ return s + (p.users||0); }, 0),
      days: '30', type: 'pages'
    };
    var pageJson = JSON.stringify(pageResult);
    var pagesKey = 'portal_pages_30';
    try { cache.remove(pagesKey); } catch(re) {}
    var okPages = chunkedCachePut(cache, pagesKey, pageJson, 21600);
    warmed.push('pages-30d(' + Math.ceil(pageJson.length/1024) + 'KB' + (okPages?'':' - too big to chunk') + ')');

    // Also update page views stat
    var totalViews = allPages.reduce(function(s,p){ return s + (p.views||0); }, 0);
    var pvStr = totalViews > 1000 ? (Math.round(totalViews/1000) + 'K') : String(totalViews);
    PropertiesService.getScriptProperties().setProperty('STAT_PAGE_VIEWS', pvStr);
    PropertiesService.getScriptProperties().setProperty('STAT_TOTAL_PAGES', String(allPages.length));
  } catch(e) { Logger.log('Warm pages failed: ' + e.message); }

  // GA4 files — 30 day default, cached 6h.
  try {
    var dateRange = getDateRange('30');
    var fr = { dateRanges: [dateRange],
      dimensions: [{ name: 'linkUrl' }, { name: 'customEvent:file_name' }, { name: 'pagePath' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'file_download' } } },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 10000 };
    var allFiles = formatFileData(queryGA4(fr));
    // Same shape parity as the pages warm block — totalDownloads is the tile.
    var fileResult = {
      rows: allFiles.slice(0, 500),
      totalCount: allFiles.length,
      totalDownloads: allFiles.reduce(function(s,f){ return s + (f.clicks||0); }, 0),
      days: '30', type: 'files'
    };
    var fileJson = JSON.stringify(fileResult);
    var filesKey = 'portal_files_30';
    try { cache.remove(filesKey); } catch(re) {}
    var okFiles = chunkedCachePut(cache, filesKey, fileJson, 21600);
    warmed.push('files-30d(' + Math.ceil(fileJson.length/1024) + 'KB' + (okFiles?'':' - too big to chunk') + ')');
    PropertiesService.getScriptProperties().setProperty('STAT_TOTAL_FILES', String(allFiles.length));
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
  function getRaw(name) {
    return (typeof idx[name] === 'number') ? row[idx[name]] : '';
  }
  function getBool(name) {
    var v = get(name).toLowerCase();
    return v === 'yes' || v === 'true' || v === '1';
  }
  return {
    id: get('Event ID') || 'evt_' + Utilities.getUuid().substring(0, 8),
    title: get('Title'),
    focusArea: get('Focus Area'),
    programInitiative: get('Program / Initiative'),
    type: get('Type'),
    startDate: _isoDate(getRaw('Start Date')),
    startTime: _isoTime(getRaw('Start Time')),
    endDate: _isoDate(getRaw('End Date')) || _isoDate(getRaw('Start Date')),
    endTime: _isoTime(getRaw('End Time')),
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
    registrationDeadline: _isoDate(getRaw('Registration Deadline')),
    contactHours: getBool('Contact Hours'),
    recurrencePattern: get('Recurrence Pattern'),
    recurrenceEnd: _isoDate(getRaw('Recurrence End')),
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

// Sheets time-only cells come back as Date objects at the 1899 epoch
// (Dec 30 1899 is Google Sheets' zero-date). String(dateObj) leaks that
// junk into the payload — extract just the h:mm AM/PM.
function _isoTime(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) {
    var h = v.getHours();
    var m = v.getMinutes();
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
  }
  var s = String(v).trim();
  // Already formatted like "11:00 AM" — pass through.
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(s)) return s.toUpperCase().replace(/\s+/, ' ');
  // 24-hour "13:45" — convert to 12-hour.
  var m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) {
    var hh = parseInt(m24[1], 10);
    var mm = m24[2];
    if (isNaN(hh)) return '';
    var apn = hh >= 12 ? 'PM' : 'AM';
    var h12n = hh % 12; if (h12n === 0) h12n = 12;
    return h12n + ':' + mm + ' ' + apn;
  }
  return s;
}

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
  // Actual keys the router writes (v1_* were leftovers from a previous naming
  // scheme — this function was a no-op for months, which is why users saw
  // events staying stale ~5 min after edits).
  cache.removeAll(['portal_calendar_30', 'portal_events_30', 'portal_moderation_30']);
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
    'Contact Name', 'Contact Email', 'Contact Phone', 'Submitter Email',
    'Focus Area', 'Program / Initiative', 'Title', 'Type',
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
  // Auto-add columns that later features assumed but the sheet was created without.
  var appended = false;
  ['Submitter Email'].forEach(function(name) {
    if (typeof idx[name] !== 'number') {
      var newCol = header.length + 1;
      sheet.getRange(1, newCol).setValue(name);
      header.push(name);
      idx[name] = newCol - 1;
      appended = true;
    }
  });
  if (appended) SpreadsheetApp.flush();
  return { sheet: sheet, idx: idx, header: header };
}

// ---- MY EVENTS (submitter self-service listing) --------------
// Returns all events tied to this email (as Contact Email or Submitter Email),
// with just enough per-row data to power the manage view — including each
// event's editToken so the client can update or cancel without a re-prompt.
function getMyEvents(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e || e.indexOf('@') < 1) return { error: 'Enter a valid email address', events: [] };

  var ctx = _openEventsSheet();
  if (ctx.error) return { error: ctx.error, events: [] };

  var idx = ctx.idx;
  function col(name, row) { return typeof idx[name] === 'number' ? row[idx[name]] : ''; }

  var data = ctx.sheet.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var contact = String(col('Contact Email', row) || '').trim().toLowerCase();
    var submitter = String(col('Submitter Email', row) || '').trim().toLowerCase();
    if (contact !== e && submitter !== e) continue;
    // Include the full record (same shape as getSingleEvent) so the frontend
    // Edit click doesn't have to make a second 12-15s Apps Script call — it
    // just deserializes the record it already has.
    var full = _rowToRecord(row, idx);
    full.id = String(col('Event ID', row) || '');
    full.editToken = String(col('Edit Token', row) || '');
    full.title = String(col('Title', row) || '');
    full.focusArea = String(col('Focus Area', row) || '');
    full.type = String(col('Type', row) || '');
    full.status = String(col('Status', row) || '');
    full.startDate = _isoDate(col('Start Date', row));
    full.startTime = _isoTime(col('Start Time', row));
    full.endDate = _isoDate(col('End Date', row));
    full.endTime = _isoTime(col('End Time', row));
    full.allDay = (function(v){var s=String(v||'').toLowerCase();return s==='yes'||s==='true'||s==='1';})(col('All Day', row));
    full.location = String(col('Location Type', row) || '') || 'Virtual';
    full.venueName = String(col('Venue Name', row) || '');
    full.contactName = String(col('Contact Name', row) || '');
    full.contactEmail = String(col('Contact Email', row) || '');
    full.submitterEmail = String(col('Submitter Email', row) || '');
    full.submitted = String(col('Date Submitted', row) || '');
    out.push(full);
  }
  // Newest first — matches the natural "what did I just submit" instinct.
  out.sort(function(a,b){ return (b.submitted || '').localeCompare(a.submitted || ''); });
  return { events: out, count: out.length };
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
  // Sheets returns time-only cells as Date objects at the 1899 epoch and
  // date cells as Date objects. Apps Script's JSON encoder would ship those
  // as raw ISO strings the client's parsers don't recognize, so normalize
  // known-typed columns before serializing.
  var timeCols = { 'Start Time': 1, 'End Time': 1 };
  var dateCols = { 'Start Date': 1, 'End Date': 1, 'Recurrence End': 1, 'Registration Deadline': 1 };
  for (var name in idx) {
    var v = row[idx[name]];
    if (timeCols[name]) rec[name] = _isoTime(v);
    else if (dateCols[name]) rec[name] = _isoDate(v);
    else rec[name] = v;
  }
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
    'Contact Name', 'Contact Email', 'Contact Phone', 'Submitter Email',
    'Focus Area', 'Program / Initiative', 'Title', 'Type',
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
  // Default Submitter Email = Contact Email so the manage lookup finds it even
  // for events submitted before this feature existed.
  if (typeof ctx.idx['Submitter Email'] === 'number' && !row[ctx.idx['Submitter Email']]) {
    row[ctx.idx['Submitter Email']] = String(fields['Contact Email'] || '').trim();
  }

  ctx.sheet.appendRow(row);
  purgeCalendarCache();

  // Email the submitter their edit link so they can modify/cancel later
  // without contacting the Comms team.
  var editUrl = 'https://gateway.maine.gov/doe/communications/events-tracker.html?edit=' + eventId + '&token=' + editToken;
  try {
    var contactEmail = String(fields['Contact Email'] || '').trim();
    var title = String(fields['Title'] || 'Your event');
    if (contactEmail && contactEmail.indexOf('@') > 0) {
      var startDate = String(fields['Start Date'] || '');
      var startTime = String(fields['Start Time'] || '');
      var html =
        '<div style="font-family:Arial,sans-serif;max-width:560px;color:#182b3c;">' +
          '<div style="background:#182b3c;color:#eee6df;padding:18px 24px;">' +
            '<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.7;">Maine DOE Communications</div>' +
            '<div style="font-size:20px;font-weight:700;margin-top:4px;">Your calendar event is live</div>' +
          '</div>' +
          '<div style="padding:22px 24px;background:#ffffff;border:1px solid #e2e8f0;border-top:0;">' +
            '<p style="margin:0 0 14px;font-size:15px;line-height:1.5;">Thanks for submitting <strong>' + title.replace(/</g,'&lt;') + '</strong>' +
              (startDate ? ' on ' + startDate + (startTime ? ' at ' + startTime : '') : '') +
              '. It is now visible on <a href="https://www.maine.gov/doe/calendar" style="color:#0d7ba0;">the DOE calendar</a>.</p>' +
            '<div style="background:#fef2f2;border-left:3px solid #8a2e13;padding:14px 16px;border-radius:6px;margin:18px 0;">' +
              '<div style="font-weight:700;color:#8a2e13;margin-bottom:6px;">Save this email</div>' +
              '<div style="font-size:14px;line-height:1.5;">If you need to update details, change the date, or cancel this event, use the link below. Anyone with this link can edit the event, so keep it private.</div>' +
            '</div>' +
            '<a href="' + editUrl + '" style="display:inline-block;padding:12px 22px;background:#182b3c;color:#eee6df;text-decoration:none;font-weight:700;border-radius:6px;letter-spacing:.06em;">Edit or cancel this event</a>' +
            '<p style="font-size:12px;color:#475569;margin-top:22px;line-height:1.5;word-break:break-all;"><strong>Link:</strong> ' + editUrl + '</p>' +
            '<p style="font-size:12px;color:#475569;margin-top:14px;">Questions? Reply to this email or contact Matt Leavitt (matthew.g.leavitt@maine.gov) or Rachel Paling (rachel.paling@maine.gov).</p>' +
          '</div>' +
        '</div>';
      MailApp.sendEmail({
        to: contactEmail,
        subject: 'DOE Event Submitted: ' + title,
        htmlBody: html,
        name: 'Maine DOE Communications',
        replyTo: 'matthew.g.leavitt@maine.gov'
      });
    }
  } catch (mailErr) {
    Logger.log('Confirmation email failed: ' + mailErr.message);
    // Don't fail the whole submission if email doesn't send.
  }

  return { ok: true, id: eventId, editToken: editToken, editUrl: editUrl };
}

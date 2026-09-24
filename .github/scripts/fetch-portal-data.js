// Fetches read-only Apps Script endpoints and writes the JSON responses
// to /data/*.json. Runs on GitHub Actions; see .github/workflows/refresh-portal-data.yml.
//
// Design principles:
//   - Never fail the workflow because one endpoint hiccupped. If Apps Script
//     returns HTML (Google's flaky-edge 404 page) or times out, skip that
//     file — the previously-committed JSON stays in place, so frontends
//     always have SOMETHING to load.
//   - Retry each endpoint up to 3× with 5s / 10s / 20s backoff. Google's
//     edge glitches usually clear within a minute.
//   - Add a wrapper { _fetched: ISO, _sourceType: <type>, ...payload } so
//     frontends can display freshness and detect stale data.
//
// Only endpoints listed in ENDPOINTS are mirrored. Deliberately excluded:
//   - events, my_events — per-user edit views; caching them across users
//     would leak one person's event into another's edit form.
//   - Write endpoints (POST for submissions/edits) — stay live.
//
// The repo is public, so nothing here may carry data the calendar feed does
// not already publish. youtube (submissions) qualifies: the only personal
// field is the submitter's email, which the calendar feed already exposes as
// contactEmail.

const fs = require('fs');
const path = require('path');
const https = require('https');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx9_qEikjvV4ieh-7CGv-Gq5Mm7PA432dtGEN-UzmSDtzlaL7SEVxChnMOfl0Lgr2BEhg/exec';

const ENDPOINTS = [
  { type: 'calendar',       ttl: 900,  desc: 'Public calendar feed' },
  { type: 'publications',   ttl: 1800, desc: 'Mailchimp campaigns + blog' },
  { type: 'youtube_videos', ttl: 900,  desc: 'YouTube library band' },
  { type: 'youtube_stats',  ttl: 3600, desc: 'YouTube analytics' },
  { type: 'commons',        ttl: 900,  desc: 'Maine DOE Commons posts' },
  { type: 'store',          ttl: 900,  desc: 'Maine DOE Store catalog' },
  { type: 'announcements',  ttl: 900,  desc: 'Portal notifications' },
  { type: 'moderation',     ttl: 90,   desc: 'Drupal pending-approval queue' },
  { type: 'youtube',        ttl: 900,  desc: 'YouTube submissions tracker' },
  { type: 'pages',          ttl: 21600, desc: 'GA4 page views (30-day)' },
  { type: 'files',          ttl: 21600, desc: 'GA4 file downloads (30-day)' },
  { type: 'web_stats',      ttl: 900,   desc: 'Portal stats tile' },
  { type: 'newsroom_stats', ttl: 3600,  desc: 'WordPress.com newsroom analytics' },
];

const DATA_DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function fetchWithRedirect(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: opts.timeout || 60000 }, (res) => {
      // Follow redirects (Apps Script always 302s to a signed googleusercontent URL).
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return fetchWithRedirect(res.headers.location, opts).then(resolve, reject);
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout after ' + (opts.timeout || 60000) + 'ms')); });
  });
}

async function fetchEndpoint(type) {
  // No &refresh=1. Forcing a cache bypass made Apps Script rebuild the payload
  // from scratch on every call, and for the heavy endpoints that runs long
  // enough that Google's edge gives up and hands back its 7,912-byte HTML 404
  // — calendar failed all four attempts that way (185s burned, mirror left
  // 6.5 hours stale). Every type below except commons and web_stats is kept
  // warm by the Apps Script warmCache trigger every 10 minutes, and web_stats
  // is never cached at all, so reading the warm copy costs at most 10 minutes
  // of freshness against a mirror that only refreshes hourly.
  const url = `${APPS_SCRIPT_URL}?type=${encodeURIComponent(type)}`;
  const backoffs = [0, 5000, 10000, 20000];
  let lastErr = null;

  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    if (backoffs[attempt]) {
      await new Promise((r) => setTimeout(r, backoffs[attempt]));
    }
    try {
      const { status, body } = await fetchWithRedirect(url, { timeout: 60000 });
      if (status !== 200) {
        lastErr = new Error(`HTTP ${status} (${body.length}b)`);
        continue;
      }
      // Google's flaky-edge returns HTML error pages with 200 status too.
      // Real payload starts with `{`.
      const trimmed = body.trim();
      if (trimmed.charAt(0) !== '{') {
        lastErr = new Error(`non-JSON response (${trimmed.slice(0, 80).replace(/\s+/g, ' ')}…)`);
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch (e) {
        lastErr = new Error(`JSON parse: ${e.message}`);
        continue;
      }
      return parsed;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function main() {
  const summary = [];
  for (const { type, desc } of ENDPOINTS) {
    const started = Date.now();
    try {
      const data = await fetchEndpoint(type);
      const wrapped = {
        _fetched: new Date().toISOString(),
        _sourceType: type,
        _description: desc,
        ...data,
      };
      const filePath = path.join(DATA_DIR, `${type}.json`);
      fs.writeFileSync(filePath, JSON.stringify(wrapped));
      const size = fs.statSync(filePath).size;
      const took = Date.now() - started;
      summary.push({ type, ok: true, bytes: size, ms: took });
      console.log(`  ✓ ${type.padEnd(18)} ${size.toString().padStart(7)}b  ${took}ms`);

      // The submission form needs to offer the programs and focus areas
      // actually in use, but its only source for them was a hardcoded array
      // that drifted every time one was renamed in the sheet. Derive them
      // from the calendar we just fetched and write a small file the form can
      // read without auth. Nothing new is requested from Apps Script.
      if (type === 'calendar' && Array.isArray(data.events)) {
        const distinct = (field) =>
          [...new Set(data.events.map((e) => (e[field] || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        const lists = {
          _fetched: wrapped._fetched,
          _description:
            'Distinct programInitiative and focusArea values in use on the calendar, ' +
            'derived from calendar.json. Read by the event submission form to populate ' +
            'its dropdowns so they cannot drift from the sheet.',
          programs: distinct('programInitiative'),
          focusAreas: distinct('focusArea'),
        };
        const listsPath = path.join(DATA_DIR, 'lists.json');
        fs.writeFileSync(listsPath, JSON.stringify(lists));
        console.log(
          `  ✓ ${'lists'.padEnd(18)} ${fs.statSync(listsPath).size.toString().padStart(7)}b  ` +
          `${lists.programs.length} programs, ${lists.focusAreas.length} focus areas`
        );
      }
    } catch (e) {
      summary.push({ type, ok: false, error: e.message });
      console.log(`  ✗ ${type.padEnd(18)} ${e.message}`);
    }
  }
  const okCount = summary.filter((s) => s.ok).length;
  console.log(`\nDone: ${okCount}/${summary.length} endpoints refreshed.`);
  // Never exit non-zero — a partial refresh still leaves the previous
  // JSON for the endpoints that failed today.
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

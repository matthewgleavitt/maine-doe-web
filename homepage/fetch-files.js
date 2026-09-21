#!/usr/bin/env node
/* Maine DOE — file inventory via JSON:API
 * Version: 2026-09-19-a  ·  Last edited: 2026-09-19
 *
 *   node fetch-files.js
 *
 * Caches every managed file as uuid → fid, filename, uri.
 * Read only. The individual /file/file/<uuid> route 404s for
 * anonymous requests, but the collection does not — so the map is
 * built by walking the collection once and joining locally.
 */
'use strict';
const fs = require('fs'), path = require('path');
(async () => {
  let url = 'https://www.maine.gov/doe/jsonapi/file/file?page%5Blimit%5D=50'
          + '&fields%5Bfile--file%5D=drupal_internal__fid,filename,uri,filesize,created';
  const files = {};
  let page = 0;
  while (url) {
    const r = await fetch(url, { headers: { Accept: 'application/vnd.api+json', 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) { console.error(`\nHTTP ${r.status} at page ${page}`); break; }
    const j = await r.json();
    if (j.errors) { console.error('\n' + JSON.stringify(j.errors).slice(0, 200)); break; }
    for (const f of j.data || []) {
      const a = f.attributes || {};
      files[f.id] = {
        fid: a.drupal_internal__fid,
        filename: a.filename,
        url: (a.uri || {}).url || null,
        size: a.filesize,
        created: a.created,
      };
    }
    process.stdout.write(`\r  page ${++page} — ${Object.keys(files).length} files`);
    url = (j.links || {}).next ? j.links.next.href : null;
    if (url) await new Promise(s => setTimeout(s, 120));
  }
  fs.writeFileSync(path.join(__dirname, 'cache', 'files.json'), JSON.stringify(files, null, 1));
  console.log(`\n${Object.keys(files).length} files → cache/files.json`);
})();

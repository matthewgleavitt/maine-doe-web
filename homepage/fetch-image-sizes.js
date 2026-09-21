#!/usr/bin/env node
/* Maine DOE — the real dimensions of every image
 * Version: 2026-09-20-a  ·  Last edited: 2026-09-20
 *
 *   node fetch-image-sizes.js
 *
 * WHY THIS EXISTS. Every decision about how an image should be sized
 * — tall, full width, floated beside text — depends on its shape, and
 * the markup does not say: nearly every <img> on the site is written
 * width="100%" height="100%" regardless of what it actually is. So
 * the shape has been guessed at, page by page, and guessed wrong at
 * least once already.
 *
 * Dimensions live in the first few dozen bytes of a PNG, GIF or WebP
 * and within the first few KB of a JPEG, so this asks for a byte
 * RANGE rather than the file: about 2KB each instead of a megabyte,
 * and one pass over 1,400 images rather than a person opening them.
 */
'use strict';
const fs = require('fs'), path = require('path');
const C = path.join(__dirname, 'cache');
const files = JSON.parse(fs.readFileSync(path.join(C, 'files.json'), 'utf8'));

function dims(buf) {
  if (buf.length < 24) return null;
  /* PNG: IHDR is always the first chunk, width and height at 16. */
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG')
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  /* GIF: logical screen descriptor, little-endian, at byte 6. */
  if (buf.toString('latin1', 0, 3) === 'GIF')
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  /* WebP: VP8X carries them at 24, VP8 (lossy) inside the frame tag. */
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const tag = buf.toString('latin1', 12, 16);
    if (tag === 'VP8X') return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (tag === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  /* JPEG: walk the segment chain to the start-of-frame marker. */
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

(async () => {
  const imgs = Object.entries(files).filter(([, f]) => f.url && /\.(png|jpe?g|gif|webp)$/i.test(f.url));
  const out = {}, fail = [];
  let done = 0;
  const BATCH = 8;
  for (let i = 0; i < imgs.length; i += BATCH) {
    await Promise.all(imgs.slice(i, i + BATCH).map(async ([uuid, f]) => {
      try {
        const r = await fetch('https://www.maine.gov' + f.url,
          { headers: { Range: 'bytes=0-8191', 'User-Agent': 'Mozilla/5.0' } });
        const d = dims(Buffer.from(await r.arrayBuffer()));
        if (d && d.w && d.h) out[f.url] = { ...d, fid: f.fid, name: f.filename, bytes: f.size };
        else fail.push(f.filename);
      } catch (e) { fail.push(f.filename); }
    }));
    done += Math.min(BATCH, imgs.length - i);
    process.stdout.write(`\r  ${done}/${imgs.length}`);
    await new Promise(s => setTimeout(s, 60));
  }
  fs.writeFileSync(path.join(C, 'image-sizes.json'), JSON.stringify(out, null, 1));
  const v = Object.values(out);
  const shape = r => r > 1.25 ? 'landscape' : r < 0.85 ? 'portrait' : 'square';
  const tally = {};
  v.forEach(x => { const s = x.w / x.h > 2.5 ? 'banner' : shape(x.w / x.h); tally[s] = (tally[s] || 0) + 1; });
  console.log(`\n${v.length} images measured, ${fail.length} unreadable → cache/image-sizes.json`);
  Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k.padEnd(11)}${n}`));
})();

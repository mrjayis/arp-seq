import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Every local asset URL must carry the same ?v= stamp; otherwise a browser can
// mix cached files from different releases (e.g. new HTML with old app.js).
test('all local asset URLs share one cache-busting version', () => {
  const files = ['index.html', ...readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => `src/${f}`)];
  const refs = files.flatMap((f) => {
    const text = readFileSync(f, 'utf8');
    return [
      ...text.matchAll(/(?:from\s+|href=|src=)['"](\.{0,2}\/?[\w./-]+\.(?:js|css))(\?v=\d+)?['"]/g),
    ].map((m) => ({ file: f, url: m[1], stamp: m[2] }));
  });
  assert.ok(refs.length >= 7, `found only ${refs.length} asset references`);
  for (const r of refs) assert.ok(r.stamp, `${r.file}: ${r.url} has no ?v= stamp`);
  const versions = new Set(refs.map((r) => r.stamp));
  assert.equal(versions.size, 1, `mixed versions: ${[...versions].join(', ')}`);
});

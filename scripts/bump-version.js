// Bumps the ?v=N cache-busting stamp on every local asset URL (index.html and
// src/*.js imports), so browsers fetch a release's files as a matching set.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const files = ['index.html', ...readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => `src/${f}`)];
const STAMP = /(\.(?:js|css))\?v=(\d+)/g;
const current = Math.max(0, ...files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(STAMP)].map((m) => Number(m[2]))));
const next = current + 1;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const out = src.replace(STAMP, `$1?v=${next}`);
  if (out !== src) writeFileSync(f, out);
}
console.log(`asset version ${current} -> ${next}`);

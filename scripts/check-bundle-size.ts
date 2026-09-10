/**
 * Fails the build when a §3 bundle budget is exceeded.
 *
 *   npm run size            # after npm run build
 *
 * Reads `dist/` rather than the build log, and measures gzip, because that is
 * what the phone downloads.
 *
 * "Initial JS" is the set of scripts the browser fetches before it can paint:
 * the entry module plus every `modulepreload` Vite emits into `index.html`.
 * Taking the set from the markup is the only definition that cannot drift —
 * a chunk becomes eager the moment something in the shell imports it, and
 * that shows up here as a preload link with no source change to notice.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const INITIAL_JS_LIMIT = 150 * 1024;
const ROUTE_CHUNK_LIMIT = 60 * 1024;

/**
 * The Firestore SDK, which no route budget can hold.
 *
 * `firebase/firestore` is ~146 kB gzipped and there is nothing to shake out of
 * it. The only smaller build is Firestore Lite, which drops the local cache —
 * and offline logging is the product (§2.8), so Lite is not an option.
 *
 * It stays off the first-paint path, which is the part that matters: it is
 * reachable only through a dynamic import, so the shell paints without it. The
 * ceiling here is a regression alarm, not a target — if a Firebase upgrade
 * moves this number, that is worth knowing before it ships.
 */
const EXCEPTIONS: Record<string, number> = { 'fb-firestore': 155 * 1024 };

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} kB`;

/**
 * Chunk name without its content hash: `fb-firestore-Ct3Iyz7e.js` -> `fb-firestore`.
 *
 * The hash is always the last eight characters and may itself start with `-`
 * (`ScrollArea--LCddLXK.js`), so the count has to be exact — a greedy match
 * eats real name segments and turns every `fb-*` chunk into `fb`.
 */
function baseName(file: string): string {
  return file.replace(/-[A-Za-z0-9_-]{8}\.js$/u, '');
}

function gzipped(file: string): number {
  return gzipSync(readFileSync(`${DIST}assets/${file}`)).length;
}

function initialScripts(): string[] {
  const html = readFileSync(`${DIST}index.html`, 'utf8');
  const found = html.match(/assets\/[A-Za-z0-9_.-]+\.js/gu) ?? [];
  if (found.length === 0) throw new Error('dist/index.html references no scripts — build first');
  return [...new Set(found)].map((path) => path.replace('assets/', ''));
}

/**
 * Modules that must never be reachable before the first paint.
 *
 * Firestore is the one that matters: the entry graph reaching it would mean a
 * read on the first-paint path, which §2.6 and §3 both rule out — and it is
 * larger than the whole initial-JS budget, so the totals above would not
 * quietly absorb it either. It is a static-import mistake away at any time, in
 * `useAuth` or any provider, and the symptom on a phone is a slow first screen
 * rather than anything that looks like a bug.
 */
const FORBIDDEN_IN_INITIAL = ['fb-firestore'];

const failures: string[] = [];

const initial = initialScripts();

for (const name of FORBIDDEN_IN_INITIAL) {
  if (initial.some((file) => baseName(file) === name)) {
    failures.push(
      `${name} is on the first-paint path; it must be reachable only by dynamic import`,
    );
  }
}
const initialBytes = initial.reduce((total, file) => total + gzipped(file), 0);

console.log(`Initial JS (${String(initial.length)} chunks, gzipped)`);
for (const file of [...initial].sort((a, b) => gzipped(b) - gzipped(a))) {
  console.log(`  ${kb(gzipped(file)).padStart(9)}  ${baseName(file)}`);
}
console.log(`  ${kb(initialBytes).padStart(9)}  TOTAL / ${kb(INITIAL_JS_LIMIT)}\n`);

if (initialBytes > INITIAL_JS_LIMIT) {
  failures.push(
    `initial JS is ${kb(initialBytes)}, over the ${kb(INITIAL_JS_LIMIT)} budget by ${kb(initialBytes - INITIAL_JS_LIMIT)}`,
  );
}

const eager = new Set(initial);
const lazy = readdirSync(`${DIST}assets`)
  .filter((file) => file.endsWith('.js') && !eager.has(file))
  .map((file) => ({ name: baseName(file), bytes: gzipped(file) }))
  .sort((a, b) => b.bytes - a.bytes);

console.log(`Lazy chunks (${String(lazy.length)}), largest first`);
for (const { name, bytes } of lazy.slice(0, 10)) {
  const limit = EXCEPTIONS[name] ?? ROUTE_CHUNK_LIMIT;
  console.log(
    `  ${kb(bytes).padStart(9)}  ${name}${EXCEPTIONS[name] === undefined ? '' : ' (exception)'} / ${kb(limit)}`,
  );
}

for (const { name, bytes } of lazy) {
  const limit = EXCEPTIONS[name] ?? ROUTE_CHUNK_LIMIT;
  if (bytes > limit) failures.push(`chunk ${name} is ${kb(bytes)}, over its ${kb(limit)} budget`);
}

if (failures.length > 0) {
  console.error(`\nBundle budget exceeded (§3):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\nEvery bundle budget met (§3).');

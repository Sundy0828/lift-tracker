/**
 * Lets `node scripts/*.ts` import workspace source the way the bundlers do.
 *
 * `@lift/*` specifiers already resolve through each package's `exports` map to
 * a real `.ts` file, which node's native type stripping can run. What node
 * cannot follow is the extensionless relative specifier (`./muscles`) that
 * Vite and Metro resolve inside those files. Rather than give the packages a
 * second import style, this hook teaches node that one rule.
 *
 * Used as `node --import <path to>/scripts/ts-resolve.mjs <script>.ts`.
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HAS_EXTENSION = /\.[cm]?[jt]sx?$|\.json$/u;

function firstExisting(base) {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');

    if (isRelative && !HAS_EXTENSION.test(specifier)) {
      const base = new URL(specifier, context.parentURL ?? pathToFileURL('.').href).href;
      const resolved = firstExisting(base);
      if (resolved !== null) return { url: resolved, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

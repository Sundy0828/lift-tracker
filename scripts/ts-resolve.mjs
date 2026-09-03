/**
 * Lets `node scripts/*.ts` import app source the way the app itself does.
 *
 * Node's native type stripping resolves real file paths, so it cannot follow
 * the extensionless specifiers (`./muscles`) or the `@/` alias that Vite
 * resolves for the app. Rather than give build scripts a second import style
 * — or a second copy of the domain vocabularies — this hook teaches Node the
 * same two rules.
 *
 * Used as `node --import ./scripts/ts-resolve.mjs scripts/<script>.ts`.
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = new URL('../src/', import.meta.url);
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
    const isAlias = specifier.startsWith('@/');

    if ((isRelative || isAlias) && !HAS_EXTENSION.test(specifier)) {
      const base = isAlias
        ? new URL(specifier.slice(2), SRC).href
        : new URL(specifier, context.parentURL ?? pathToFileURL('.').href).href;
      const resolved = firstExisting(base);
      if (resolved !== null) return { url: resolved, shortCircuit: true };
    }

    if (isAlias) {
      return { url: new URL(specifier.slice(2), SRC).href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

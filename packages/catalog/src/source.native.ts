/**
 * Where the catalog's raw JSON comes from on mobile. Web uses `source.ts`.
 *
 * Both files ship inside the app bundle, so the catalog works offline from the
 * very first launch, with nothing to download. Metro turns a `require` of a
 * JSON file into a module; the require sits inside each function so the parse
 * happens on first use, not at startup.
 *
 * `require` rather than `import`, so TypeScript never infers a literal type
 * for the 876-element array (see `source.ts`). The value is untrusted at the
 * type level either way; `index.ts` validates it.
 */

// Metro's module loader. Declared here because the package loads no
// React Native or node types.
declare const require: (id: string) => unknown;

/** The searchable core, `generated/exercises.json`. */
export function readCoreJson(): Promise<unknown> {
  return Promise.resolve(require('./generated/exercises.json'));
}

/** Instructions and image paths, `generated/details.json`. */
export function readDetailsJson(): Promise<unknown> {
  return Promise.resolve(require('./generated/details.json'));
}

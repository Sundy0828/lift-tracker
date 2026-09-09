// Hand-maintained alongside AppLayout.module.css. Named keys (rather than the
// loose index signature Vite declares for `*.module.css`) keep class names
// typed as `string` under `noUncheckedIndexedAccess` and catch typos.
declare const classes: {
  readonly shell: string;
  readonly offline: string;
  readonly main: string;
  readonly nav: string;
  readonly navItem: string;
  readonly glyph: string;
};
export default classes;

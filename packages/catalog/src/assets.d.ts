/**
 * `?url` imports, as the web bundler resolves them: a hashed asset URL.
 * Declared here rather than through `vite/client`, so the package does not
 * depend on the web bundler to typecheck.
 */
declare module '*?url' {
  const url: string;
  export default url;
}

/**
 * Runs work after the browser finishes the first paint.
 *
 * The entry bundle has a budget (§3), so anything the first screen does not
 * need loads from here instead: the callback usually starts a dynamic import.
 * `requestIdleCallback` is missing on older Safari, so a timer stands in.
 */
export function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 2_000 });
    return () => {
      cancelIdleCallback(id);
    };
  }

  const id = setTimeout(run, 1_000);
  return () => {
    clearTimeout(id);
  };
}

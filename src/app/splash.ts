/**
 * Removes the static splash in `index.html`.
 *
 * Called from an effect, so it runs after React has painted the first screen
 * — the splash is on top until then, which keeps the handover to a single
 * frame. It is `position: fixed`, so removing it shifts no layout.
 */
export function hideSplash(): void {
  document.getElementById('splash')?.remove();
}

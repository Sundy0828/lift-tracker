/**
 * A random uuid fit for an id that grants access: a share link.
 *
 * This is the mobile build. Hermes has no `crypto` global, and a `Math.random`
 * uuid is guessable, which a share id must never be. expo-crypto takes the
 * bytes from the OS's secure random source (SecRandomCopyBytes on iOS,
 * SecureRandom on Android). The web build, `random.ts`, uses the browser's.
 *
 * **Loaded on first use, not imported.** Its module throws at import when the
 * native half is missing (a dev build older than the JS it runs), and as a
 * static import that took down every screen that can share, the editor
 * included. Loaded here, a missing module costs the share link only, and says
 * why.
 */
export async function secureUuid(): Promise<string> {
  try {
    const { randomUUID } = await import('expo-crypto');
    return randomUUID();
  } catch {
    throw Object.assign(
      new Error(
        'This build of the app cannot make share links yet. Install the latest build and try again.',
      ),
      { code: 'app/needs-new-build' },
    );
  }
}

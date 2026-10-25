/**
 * A random uuid fit for an id that grants access: a share link.
 *
 * This is the web build: the browser's `crypto`. The phone has no `crypto`
 * global (Hermes), so `random.native.ts` beside it takes the same uuid from
 * expo-crypto, which reads the OS's secure random source. The two must stay
 * identical in shape. Async because the phone loads its module on first use.
 *
 * Record ids do not need this and do not use it (see `../ids`).
 */
export function secureUuid(): Promise<string> {
  return Promise.resolve(crypto.randomUUID());
}

/**
 * Accounts whose data has been deleted in this browser session.
 *
 * This exists to close one specific hole. `useProfile` seeds a profile
 * document whenever its listener reports the document missing — that is how a
 * brand-new account gets its `createdAt` without an extra read. Deleting an
 * account makes that document missing, so the listener does exactly what it
 * was built to do and writes it straight back. The account deletion then
 * removes the login, and the recreated document is stranded: the security
 * rules key on `request.auth.uid`, so with the login gone nothing can ever
 * reach it again, to delete it or otherwise.
 *
 * "Missing because it is new" and "missing because it was just deleted" look
 * identical to a listener. Nothing in the snapshot can tell them apart, so the
 * intent has to be recorded outside it — which is all this module is.
 *
 * In-memory and session-scoped on purpose: a uid that has been deleted cannot
 * sign in again, so there is nothing to remember past a reload. No imports, so
 * it stays testable without pulling in Firebase.
 */

const deleted = new Set<string>();

/**
 * Records that this account is being torn down.
 *
 * Call **before** deleting anything. Called afterwards it would be a race
 * against the listener it is meant to silence.
 */
export function markAccountDeleted(uid: string): void {
  deleted.add(uid);
}

/** Whether writes that would resurrect this account must be refused. */
export function isAccountDeleted(uid: string): boolean {
  return deleted.has(uid);
}

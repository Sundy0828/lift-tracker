/**
 * The URL for a share id.
 *
 * Its own module rather than a second export from `SharePanel`: a file that
 * exports both a component and a helper loses fast refresh, and this is used
 * from the row and the panel both.
 *
 * Absolute, because the entire point of the string is to be pasted somewhere
 * that is not this app.
 */
export function shareUrl(shareId: string): string {
  return `${window.location.origin}/share/${shareId}`;
}

/**
 * The URL behind a friend QR.
 *
 * Absolute for the same reason, and a link rather than the bare code so a
 * phone camera can open it directly (see `FriendQr`).
 */
export function friendUrl(code: string): string {
  return `${window.location.origin}/friend/${code}`;
}

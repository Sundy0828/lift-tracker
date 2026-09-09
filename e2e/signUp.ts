import { expect, type Page } from '@playwright/test';

/**
 * Creates an account and gets it through the email-confirmation gate.
 *
 * Every spec needs a signed-in account and none of them care how, but since
 * password sign-ups are gated on a confirmed address (see `app/RequireAuth`)
 * "how" is now two steps rather than one. Shared here so the gate is exercised
 * exactly once in the suite's own code rather than copied into six files.
 *
 * The confirmation goes through the **real link**. The Auth emulator keeps the
 * out-of-band codes it would have emailed, so the test fetches the genuine
 * verification URL and visits it, the same way a person clicking the mail
 * would. Flipping `emailVerified` through the emulator's admin endpoint would
 * be shorter and would test nothing: the link is the part that can break.
 */

const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PROJECT_ID = 'demo-lift-tracker';
const PASSWORD = 'lifttracker';

type OobCode = {
  email: string;
  requestType: string;
  oobLink: string;
};

/** Unique per call: a rerun must never collide with a previous run's account. */
export function testEmail(prefix: string): string {
  const stamp = `${String(Date.now())}-${String(Math.floor(Math.random() * 100000))}`;
  return `${prefix}-${stamp}@example.com`;
}

async function confirmEmail(page: Page, email: string): Promise<void> {
  const response = await page.request.get(
    `${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/oobCodes`,
  );
  expect(response.ok(), 'the auth emulator should expose its pending oob codes').toBe(true);

  const { oobCodes } = (await response.json()) as { oobCodes: OobCode[] };
  const link = oobCodes
    .filter((code) => code.email === email && code.requestType === 'VERIFY_EMAIL')
    // Resends invalidate earlier codes, so the newest is the live one.
    .at(-1)?.oobLink;

  expect(link, `a verification link should have been issued for ${email}`).toBeTruthy();

  // Fetched rather than navigated to: the emulator's action handler is not part
  // of the app, and visiting it in the page would throw away the app's tab.
  const visited = await page.request.get(link ?? '');
  expect(visited.ok(), 'the verification link should be accepted').toBe(true);
}

/**
 * Registers a fresh account, confirms it, and leaves the browser on Today.
 *
 * Returns the address, for specs that need to sign in as the same person again.
 */
export async function signUp(page: Page, prefix: string): Promise<string> {
  const email = testEmail(prefix);

  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Need an account?' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  // getByLabel('Password') would also match Mantine's visibility toggle.
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  await confirmEmail(page, email);

  // The screen polls on its own, but asking directly makes the test wait on an
  // action rather than on a timer.
  await page.getByRole('button', { name: 'I’ve confirmed it' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  return email;
}

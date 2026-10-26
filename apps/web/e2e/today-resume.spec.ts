import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * Two sessions left unfinished at once. Today lists both, and either one can
 * be resumed or discarded without touching the other.
 *
 * Starting a session is a fire-and-forget write, and a reload that outruns it
 * loses it, so each start is followed to the emulator before the next reload.
 */

const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const PROJECT_ID = 'demo-lift-tracker';

test.describe.configure({ timeout: 120_000 });

const items = (page: Page) => page.getByTestId('resume-item');

type Account = { localId: string };

/** The uid behind a test address, straight from the auth emulator. */
async function uidFor(page: Page, email: string): Promise<string> {
  const response = await page.request.post(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    { headers: { Authorization: 'Bearer owner' }, data: { email: [email] } },
  );
  expect(response.ok(), `the auth emulator should resolve ${email}`).toBe(true);

  const { users = [] } = (await response.json()) as { users?: Account[] };
  const uid = users[0]?.localId;
  expect(uid, `${email} should have an account`).toBeTruthy();
  return uid ?? '';
}

type SessionDocument = { name?: string };

/** The session ids the emulator itself holds. */
async function serverSessionIds(page: Page, uid: string): Promise<string[]> {
  const response = await page.request.get(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/sessions`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  if (!response.ok()) return [];
  const { documents = [] } = (await response.json()) as { documents?: SessionDocument[] };
  return documents.map((one) => (one.name ?? '').split('/').pop() ?? '');
}

/** Waits for a started session to reach the emulator. */
async function expectStored(page: Page, uid: string, sessionId: string): Promise<void> {
  await expect
    .poll(async () => (await serverSessionIds(page, uid)).includes(sessionId), {
      timeout: 30_000,
      message: `session ${sessionId} should reach the emulator`,
    })
    .toBe(true);
}

/** Starts an ad-hoc session, waits for it to be stored, and returns its id. */
async function startAdHoc(page: Page, uid: string): Promise<string> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: 'Start an ad-hoc session' }).click();
  await expect(page).toHaveURL(/\/session\/[^/]+$/u);

  const sessionId = page.url().split('/session/')[1] ?? '';
  await expectStored(page, uid, sessionId);
  return sessionId;
}

/** Goes back to Today and waits for the list to settle on a count. */
async function today(page: Page, expected: number): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(items(page)).toHaveCount(expected);
}

test.describe('unfinished sessions on Today', () => {
  test('both are listed, and the older one resumes without discarding the newer', async ({
    page,
  }) => {
    const uid = await uidFor(page, await signUp(page, 'resume'));

    const first = await startAdHoc(page, uid);
    const second = await startAdHoc(page, uid);
    expect(second).not.toBe(first);

    await today(page, 2);

    // Newest first, and named as such; the older one is still its own item.
    await expect(items(page).first()).toContainText('Session in progress');
    await expect(items(page).nth(1)).toContainText('Unfinished session');
    await expect(items(page).first().getByRole('link', { name: 'Resume' })).toHaveAttribute(
      'href',
      `/session/${second}`,
    );

    // A running clock on each item.
    await expect(items(page).first().getByTestId('session-clock')).toBeVisible();
    await expect(items(page).nth(1).getByTestId('session-clock')).toBeVisible();

    // The older one is reachable directly, with nothing thrown away first.
    await items(page).nth(1).getByRole('link', { name: 'Resume' }).click();
    await expect(page).toHaveURL(`/session/${first}`);

    await today(page, 2);
  });

  test('discarding one leaves the other resumable', async ({ page }) => {
    const uid = await uidFor(page, await signUp(page, 'discard'));

    const first = await startAdHoc(page, uid);
    const second = await startAdHoc(page, uid);

    await today(page, 2);

    // Two taps on the older item only.
    const older = items(page).nth(1);
    await older.getByRole('button', { name: 'Discard', exact: true }).click();
    await older.getByRole('button', { name: 'Discard for good' }).click();

    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first().getByRole('link', { name: 'Resume' })).toHaveAttribute(
      'href',
      `/session/${second}`,
    );

    await items(page).first().getByRole('link', { name: 'Resume' }).click();
    await expect(page).toHaveURL(`/session/${second}`);
    expect(second).not.toBe(first);
  });
});

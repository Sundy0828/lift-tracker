import { expect, test, type Page } from '@playwright/test';
import { signUp, testEmail } from './signUp';

/**
 * The first-run walkthrough: that it appears once, that it can be skipped
 * immediately, and that it can be asked for again afterwards.
 *
 * `signUp` dismisses it for every other spec, so this is the only place the
 * first-run behaviour itself is exercised — which is why it registers by hand
 * rather than through the helper.
 */

const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PROJECT_ID = 'demo-lift-tracker';
const PASSWORD = 'Lift$Tracker1';

test.describe.configure({ timeout: 120_000 });

type OobCode = { email: string; requestType: string; oobLink: string };

async function confirmEmail(page: Page, email: string): Promise<void> {
  const response = await page.request.get(
    `${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/oobCodes`,
  );
  const { oobCodes } = (await response.json()) as { oobCodes: OobCode[] };
  const link = oobCodes
    .filter((code) => code.email === email && code.requestType === 'VERIFY_EMAIL')
    .at(-1)?.oobLink;

  expect(link, `a verification link should have been issued for ${email}`).toBeTruthy();
  const visited = await page.request.get(link ?? '');
  expect(visited.ok()).toBe(true);
}

/** Registers and confirms, leaving the walkthrough exactly as it lands. */
async function registerRaw(page: Page, prefix: string): Promise<void> {
  const email = testEmail(prefix);

  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Need an account?' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  await confirmEmail(page, email);
  await page.getByRole('button', { name: 'I’ve confirmed it' }).click();
}

test.describe('the first-run walkthrough', () => {
  test('opens on a new account, steps through, and does not come back', async ({ page }) => {
    await registerRaw(page, 'tour');

    const tour = page.getByTestId('tour');
    await expect(tour).toBeVisible();
    await expect(tour.getByText('A workout is a list you reuse')).toBeVisible();

    // Back only appears past the first step, so this also proves it advanced.
    await tour.getByRole('button', { name: 'Next' }).click();
    await expect(tour.getByRole('button', { name: 'Back' })).toBeVisible();
    await tour.getByRole('button', { name: 'Back' }).click();
    await expect(tour.getByRole('button', { name: 'Back' })).toHaveCount(0);

    // Straight to the end, which closes it.
    for (let step = 0; step < 5; step += 1) {
      await tour.getByRole('button', { name: 'Next' }).click();
    }
    await tour.getByRole('button', { name: 'Start lifting' }).click();
    await expect(tour).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

    // Seen is stored on the account, so a reload does not start it over.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(page.getByTestId('tour')).toHaveCount(0);
  });

  test('can be skipped from the first step, and asked for again later', async ({ page }) => {
    await registerRaw(page, 'tour-skip');

    const tour = page.getByTestId('tour');
    await expect(tour).toBeVisible();
    await tour.getByRole('button', { name: 'Skip' }).click();
    await expect(tour).toBeHidden();

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Show the walkthrough' }).click();
    await expect(page.getByTestId('tour')).toBeVisible();
    await expect(page.getByTestId('tour').getByText('A workout is a list you reuse')).toBeVisible();
  });

  test('stays away for an account that has already seen it', async ({ page }) => {
    // signUp dismisses it, so this is the state every other spec starts in.
    await signUp(page, 'tour-seen');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(page.getByTestId('tour')).toHaveCount(0);
  });
});

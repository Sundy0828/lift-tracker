import { expect, test } from '@playwright/test';

test.describe('phase 0 foundation', () => {
  test('an unauthenticated visit redirects to sign-in', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Lift Tracker' })).toBeVisible();
  });

  test('the manifest and icons are served', async ({ page }) => {
    await page.goto('/');
    const manifestHref = await page.locator('link[rel=manifest]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifest = await page.request.get(manifestHref ?? '');
    expect(manifest.ok()).toBe(true);
    const parsed = (await manifest.json()) as {
      name: string;
      icons: { src: string; purpose?: string }[];
    };
    expect(parsed.name).toBe('Lift Tracker');
    expect(parsed.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of parsed.icons) {
      const response = await page.request.get(icon.src);
      expect(response.ok(), `${icon.src} should be served`).toBe(true);
    }
  });

  test('the service worker registers and controls the page', async ({ page }) => {
    await page.goto('/');
    const registered = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active !== null;
    });
    expect(registered).toBe(true);
  });

  test('sign-in, then the unit toggle persists across a reload', async ({ page }) => {
    const email = `phase0-${String(Date.now())}@example.com`;

    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Need an account?' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    // getByLabel('Password') would also match Mantine's visibility toggle.
    await page.getByRole('textbox', { name: 'Password' }).fill('lifttracker');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    const unitGroup = page.getByRole('radiogroup', { name: 'Display unit' });
    await expect(unitGroup.getByRole('radio', { name: 'Pounds (lb)' })).toBeChecked();

    await unitGroup.getByText('Kilograms (kg)').click();
    await expect(unitGroup.getByRole('radio', { name: 'Kilograms (kg)' })).toBeChecked();
    // 185 lb rendered in kg proves domain/units is wired to the preference.
    await expect(page.getByText('83.9 kg')).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('radiogroup', { name: 'Display unit' }).getByRole('radio', {
        name: 'Kilograms (kg)',
      }),
    ).toBeChecked();
  });
});

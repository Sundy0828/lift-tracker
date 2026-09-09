import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * Picking an exercise for a workout previews the movement first: the catalog has
 * ten near-identical lateral raises and the name alone does not say which is
 * which.
 */

async function signIn(page: Page): Promise<void> {
  await signUp(page, 'pv');
}

async function openPicker(page: Page): Promise<void> {
  await page.goto('/workouts');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  // Scoped to the dialog: the editor's own name field shares this label.
  await page.getByRole('dialog').getByRole('textbox', { name: 'Workout name' }).fill('DELTS');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue('DELTS');

  await page.getByTestId('insert-exercise').first().click();
  await expect(page.getByRole('textbox', { name: 'Search exercises to add' })).toBeVisible();
}

test.describe('exercise preview before adding', () => {
  test('search results carry a picture of the movement', async ({ page }) => {
    await signIn(page);
    await openPicker(page);

    await page.getByRole('textbox', { name: 'Search exercises to add' }).fill('lateral raise');

    // One thumbnail per visible row, pointing at the derived image path.
    // `count()` does not auto-wait, so settle on the first row first.
    const thumbs = page.getByTestId('exercise-list').locator('img');
    await expect(thumbs.first()).toBeAttached();
    expect(await thumbs.count()).toBeGreaterThan(0);
    await expect(thumbs.first()).toHaveAttribute('src', /raw\.githubusercontent\.com/u);
    await expect(thumbs.first()).toHaveAttribute('src', /\/0\.jpg$/u);
    await expect(thumbs.first()).toHaveAttribute('loading', 'lazy');
  });

  test('tapping a result previews it instead of adding it', async ({ page }) => {
    await signIn(page);
    await openPicker(page);

    await page.getByRole('textbox', { name: 'Search exercises to add' }).fill('side lateral raise');
    await page.getByTestId('exercise-list').getByRole('button').first().click();

    // The preview shows both frames of the movement, labelled. Exact match:
    // "start" also appears in the instruction text.
    await expect(page.getByText('Start', { exact: true })).toBeVisible();
    await expect(page.getByText('Finish', { exact: true })).toBeVisible();
    await expect(page.getByText('Instructions')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Add to DELTS$/u })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('cancelling adds nothing and keeps the search query', async ({ page }) => {
    await signIn(page);
    await openPicker(page);

    const box = page.getByRole('textbox', { name: 'Search exercises to add' });
    await box.fill('side lateral raise');
    await page.getByTestId('exercise-list').getByRole('button').first().click();
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Back on the search list, query intact.
    await expect(box).toHaveValue('side lateral raise');
    await expect(page.getByRole('button', { name: /^Add to DELTS$/u })).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(page.getByText('No exercises yet.')).toBeVisible();
  });

  test('confirming adds exactly one exercise to the right workout', async ({ page }) => {
    await signIn(page);
    await openPicker(page);

    await page.getByRole('textbox', { name: 'Search exercises to add' }).fill('side lateral raise');
    await page.getByTestId('exercise-list').getByRole('button').first().click();
    await page.getByRole('button', { name: /^Add to DELTS$/u }).click();

    await expect(page.getByText('1 exercise')).toBeVisible();
    await expect(page.getByText('3 x 8-12 @ 1-2 RIR')).toBeVisible();
  });

  test('the picker names the workout it will add to', async ({ page }) => {
    await signIn(page);
    await openPicker(page);
    await expect(page.getByText('Add to DELTS')).toBeVisible();
  });

  test('browsing exercises shows the same pictures', async ({ page }) => {
    await signIn(page);
    await page.goto('/exercises');
    await expect(page.getByTestId('exercise-list')).toBeVisible();

    await page.getByRole('textbox', { name: 'Search exercises' }).fill('barbell squat');
    const thumbs = page.getByTestId('exercise-list').locator('img');
    await expect(thumbs.first()).toBeAttached();

    await page.getByTestId('exercise-list').getByRole('button').first().click();
    // Exact: the instruction text also contains the word "start".
    await expect(page.getByRole('dialog').getByText('Start', { exact: true })).toBeVisible();
  });

  test('a custom exercise falls back to a placeholder, not a broken image', async ({ page }) => {
    await signIn(page);
    await page.goto('/exercises');
    await expect(page.getByTestId('exercise-list')).toBeVisible();

    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Zulu Placeholder Lift');
    await page.getByRole('combobox', { name: 'Primary muscles' }).click();
    await page.getByRole('option', { name: 'Tibialis', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add exercise' }).click();

    await page.getByRole('textbox', { name: 'Search exercises' }).fill('zulu placeholder');
    const list = page.getByTestId('exercise-list');
    await expect(list.getByText('Zulu Placeholder Lift')).toBeVisible();
    // No <img> is requested for a custom exercise.
    await expect(list.locator('img')).toHaveCount(0);
  });
});

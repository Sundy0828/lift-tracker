import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * Instructions have to be reachable wherever an exercise is handled: while
 * picking one, and again while editing the slot it became.
 */

async function createWorkout(page: Page, name: string): Promise<void> {
  await page.goto('/workouts');
  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Workout name' }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue(name);
}

async function addExercise(page: Page, query: string): Promise<void> {
  await page.getByTestId('insert-exercise').last().click();
  await page.getByRole('textbox', { name: 'Search exercises to add' }).fill(query);
  await page.getByTestId('exercise-list').getByRole('button').first().click();
  await page.getByRole('button', { name: 'Add to workout' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('exercise instructions', () => {
  test('the picker previews the movement before anything is added', async ({ page }) => {
    await signUp(page, 'info-a');
    await createWorkout(page, 'PREVIEW');

    await page.getByTestId('insert-exercise').last().click();
    // The invitation is on screen before a result is tapped.
    await expect(page.getByText('Tap one to see the movement', { exact: false })).toBeVisible();

    await page.getByRole('textbox', { name: 'Search exercises to add' }).fill('barbell squat');
    await page.getByTestId('exercise-list').getByRole('button').first().click();

    // The preview sits over the search pane, so it is the later dialog.
    const preview = page.getByRole('dialog').last();
    await expect(preview.getByText('Instructions')).toBeVisible();
    await expect(preview.getByRole('listitem').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to workout' })).toBeVisible();
  });

  test('editing a slot reopens the instructions', async ({ page }) => {
    await signUp(page, 'info-b');
    await createWorkout(page, 'REOPEN');
    await addExercise(page, 'barbell squat');

    await page.getByTestId('slot-name').first().click();
    const editor = page.getByRole('dialog');
    await expect(editor.getByRole('button', { name: 'Save' })).toBeVisible();

    await page.getByRole('button', { name: 'How to do it' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(2);

    const detail = page.getByRole('dialog').last();
    await expect(detail.getByText('Instructions')).toBeVisible();
    await expect(detail.getByRole('listitem').first()).toBeVisible();
    // Muscles, so someone can check they are working the right thing.
    await expect(detail.getByText('Primary', { exact: true })).toBeVisible();
    await expect(detail.getByText('Quads', { exact: true })).toBeVisible();
    await expect(detail.getByText('Secondary', { exact: true })).toBeVisible();

    // Closing the instructions leaves the prescription editor where it was.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'How to do it' })).toBeVisible();
  });

  test('the picker search box clears from its own button', async ({ page }) => {
    await signUp(page, 'info-d');
    await createWorkout(page, 'CLEARBTN');

    await page.getByTestId('insert-exercise').last().click();
    const box = page.getByRole('textbox', { name: 'Search exercises to add' });

    // Nothing to clear until there is something in the box.
    await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0);

    await box.fill('barbell squat');
    const clear = page.getByRole('button', { name: 'Clear search' });
    await expect(clear).toBeVisible();

    // Reachable from the keyboard, not the pointer alone.
    await clear.focus();
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('');
  });
});

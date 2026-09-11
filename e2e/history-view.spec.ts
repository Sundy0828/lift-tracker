import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * Reading one past session back: how hard each set was, and what it worked.
 *
 * Both answers are only true of the session that is open, so the test logs a
 * session with a different RIR on each set and then asserts against that one
 * session's own numbers.
 */

const WORKOUT = 'VIEW DAY';

async function createWorkout(page: Page, name: string): Promise<string> {
  await page.goto('/workouts');
  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Workout name' }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue(name);

  const workoutId = /\/workouts\/([^/?]+)/u.exec(page.url())?.[1];
  expect(workoutId, 'the editor URL should carry the workout id').toBeTruthy();
  return workoutId ?? '';
}

async function addExercise(page: Page, query: string): Promise<void> {
  await page.getByTestId('insert-exercise').last().click();
  await page.getByRole('textbox', { name: 'Search exercises to add' }).fill(query);
  await page.getByTestId('exercise-list').getByRole('button').first().click();
  const confirm = page.getByRole('button', { name: 'Add to workout' });
  await confirm.click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Fills one set, records the effort behind it, and ticks it done. */
async function logSet(
  page: Page,
  ordinal: number,
  weight: string,
  reps: string,
  effort: string,
): Promise<void> {
  const n = String(ordinal);
  await page.getByRole('spinbutton', { name: `Set ${n} weight` }).fill(weight);
  await page.getByRole('spinbutton', { name: `Set ${n} reps` }).fill(reps);
  // Weight, reps and effort tick the set on their own, so nothing clicks the box.
  await page.getByRole('button', { name: `Set ${n}: ${effort}` }).click();
  await expect(page.getByRole('button', { name: `Set ${n} done, undo` })).toBeVisible();
}

test.describe('history view', () => {
  test('a past session shows each set’s RIR and the muscles it worked', async ({ page }) => {
    await signUp(page, 'histview');

    const workoutId = await createWorkout(page, WORKOUT);
    await addExercise(page, 'barbell bench press');
    await page.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText('unpublished', { exact: true })).toBeHidden();

    await page.goto(`/session/start/${workoutId}`);
    await expect(page.getByRole('heading', { name: WORKOUT })).toBeVisible();
    await logSet(page, 1, '185', '8', '2 reps left');
    await logSet(page, 2, '185', '8', '1 rep left');
    await logSet(page, 3, '185', '6', 'to failure, no reps left');

    await page.getByRole('button', { name: /^Finish session/u }).click();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

    // Navigated, not reloaded, so the finish is never raced by a page load.
    await page.getByRole('link', { name: 'History' }).click();
    const row = page.getByTestId('history-session');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('3 sets');
    // The timeline summarises. Per-set effort belongs to the session itself.
    await expect(row).not.toContainText('RIR');

    await row.click();
    await expect(page.getByRole('heading', { name: WORKOUT })).toBeVisible();

    // Each set carries the effort it was logged with, not one figure for both.
    const entry = page.getByTestId('session-entry').first();
    await expect(entry).toContainText('185 lb × 8 @ 2 RIR');
    await expect(entry).toContainText('185 lb × 8 @ 1 RIR');
    await expect(entry).toContainText('185 lb × 6 @ 0 RIR');

    // Three worked sets of bench: chest three times over, on a pressing day.
    const map = page.getByTestId('session-muscle-map');
    await expect(map).toBeVisible();
    await expect(map).toContainText('Set-equivalents in this session');
    const chestRow = map.locator('[data-muscle-row="chest"]');
    await expect(chestRow).toBeVisible();
    await expect(chestRow).toContainText('3');
    await expect(map.locator('[data-muscle-row="triceps"]')).toBeVisible();
  });
});

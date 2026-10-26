import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * Phase 2 acceptance: a workout builds end to end, editing it produces a new
 * version with a readable summary while its id stays stable, old versions stay
 * viewable and unchanged, and the muscle map tracks the exercises as they are
 * added.
 *
 * A workout is the whole unit — there is no plan above it — so building one is
 * a single step: name it, then add exercises.
 */

async function signIn(page: Page): Promise<void> {
  await signUp(page, 'wo');
}

async function createWorkout(page: Page, name: string): Promise<void> {
  await page.goto('/workouts');
  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  // Scoped to the dialog: the editor's own name field shares this label.
  await page.getByRole('dialog').getByRole('textbox', { name: 'Workout name' }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue(name);
}

/**
 * Appends an exercise. Tapping a result opens a preview, so adding takes an
 * explicit confirmation.
 */
async function addExercise(page: Page, query: string): Promise<void> {
  // With an insert row under every exercise, the last one is the end.
  await page.getByTestId('insert-exercise').last().click();
  await page.getByRole('textbox', { name: 'Search exercises to add' }).fill(query);
  await page.getByTestId('exercise-list').getByRole('button').first().click();
  const confirm = page.getByRole('button', { name: 'Add to workout' });
  await confirm.click();
  await expect(confirm).toBeHidden();
  // Both picker modals must finish closing: while an overlay is still
  // painted it swallows the pointer, so any drag that follows goes nowhere.
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function rename(page: Page, name: string): Promise<void> {
  const field = page.getByRole('textbox', { name: 'Workout name' });
  await field.fill(name);
  await field.blur();
}

test.describe('workouts', () => {
  test('a workout builds end to end', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'PUSH');

    await addExercise(page, 'barbell bench press');
    await addExercise(page, 'barbell row');
    await addExercise(page, 'barbell squat');

    await expect(page.getByText('3 exercises', { exact: true })).toBeVisible();
    // Three exercises at the default 3 sets each.
    await expect(page.getByText('9 sets', { exact: true })).toBeVisible();
  });

  test('several workouts stand alongside each other, on no schedule', async ({ page }) => {
    // The case the model exists for: PUSH and ABS are separate, reusable
    // things, and nothing pairs them into a week.
    await signIn(page);
    await createWorkout(page, 'PUSH');
    await addExercise(page, 'barbell bench press');
    await createWorkout(page, 'ABS');
    await addExercise(page, 'crunches');

    await page.goto('/workouts');
    await expect(page.getByTestId('workout-card')).toHaveCount(2);
    await expect(page.getByText('PUSH', { exact: true })).toBeVisible();
    await expect(page.getByText('ABS', { exact: true })).toBeVisible();
  });

  test('a new workout appears in the list even though createdAt is server-set', async ({
    page,
  }) => {
    // Guards the offline path: the write is pending, so createdAt is null
    // locally. The list must still show the workout.
    await signIn(page);
    await createWorkout(page, 'Cache Visible Workout');

    await page.goto('/workouts');
    await expect(page.getByText('Cache Visible Workout')).toBeVisible();
  });

  test('one muscle map, updating as exercises are added', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Map Workout');

    // Exactly one map, open by default, so it visibly follows the lifts.
    await expect(page.getByTestId('workout-muscle-map')).toHaveCount(1);
    await expect(
      page.getByText('No exercises yet — add one to see what this workout hits'),
    ).toBeVisible();

    await addExercise(page, 'barbell bench press');

    const chestRow = page.getByTestId('workout-muscle-map').locator('[data-muscle-row="chest"]');
    await expect(chestRow).toBeVisible();
    await expect(chestRow).toContainText('3');

    // Adding a second chest exercise increases the number.
    await addExercise(page, 'cable crossover');
    await expect(chestRow).toContainText('6');
  });

  test('the map covers every exercise in the workout', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Mixed Workout');

    await addExercise(page, 'barbell bench press');
    await addExercise(page, 'barbell squat');

    const map = page.getByTestId('workout-muscle-map');
    await expect(map).toHaveCount(1);
    await expect(map.locator('[data-muscle-row="chest"]')).toBeVisible();
    await expect(map.locator('[data-muscle-row="quadriceps"]')).toBeVisible();
  });

  test('the body diagram exposes a path per muscle and is decorative', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'SVG Workout');
    await addExercise(page, 'barbell bench press');

    const chestPath = page.locator('svg [data-muscle="chest"]').first();
    await expect(chestPath).toBeAttached();

    // The SVG is hidden from assistive technology; the table carries meaning.
    const svgs = page.locator('svg[aria-hidden="true"]');
    expect(await svgs.count()).toBeGreaterThanOrEqual(2);
  });

  test('adding the same exercise twice marks the second occurrence', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Duplicate Workout');

    await addExercise(page, 'barbell bench press');
    await addExercise(page, 'barbell bench press');

    await expect(page.getByText('(again)')).toBeVisible();
    await expect(page.getByText('2 exercises', { exact: true })).toBeVisible();
  });

  test('publishing snapshots the workout, and editing it later leaves that snapshot alone', async ({
    page,
  }) => {
    await signIn(page);
    await createWorkout(page, 'CHEST');
    await addExercise(page, 'barbell bench press');

    // --- v1
    await expect(page.getByText('Unpublished changes')).toBeVisible();
    await expect(page.getByText(/Created CHEST with 1 exercise/u)).toBeVisible();
    await page.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText('unpublished', { exact: true })).toBeHidden();
    await expect(page.getByText('v1', { exact: true }).first()).toBeVisible();

    // --- edit: rename it and add a lift
    await rename(page, 'CHEST + DELTS');
    await addExercise(page, 'dumbbell flyes');

    await expect(page.getByText('Unpublished changes')).toBeVisible();
    // The summary reads as a rename, not a delete plus an add, because the
    // workout's id is its document and never changes.
    await expect(page.getByText(/Renamed CHEST to CHEST \+ DELTS/u)).toBeVisible();

    await page.getByRole('button', { name: 'Publish v2' }).click();

    // --- version history shows both, with readable summaries
    await page.getByRole('button', { name: 'Version history' }).click();
    const history = page.getByLabel('Version history');
    await expect(history.getByText(/^v2$/u)).toBeVisible();
    await expect(history.getByText(/^v1$/u)).toBeVisible();
    await expect(history.getByText(/Renamed CHEST to CHEST \+ DELTS/u)).toBeVisible();

    // --- v1 still shows the week-1 definition, under its week-1 name
    await history.getByText(/Created CHEST with 1 exercise/u).click();
    const snapshot = page.getByRole('dialog');
    await expect(snapshot.getByText('CHEST', { exact: true })).toBeVisible();
    await expect(snapshot.getByText('Dumbbell Flyes')).toBeHidden();
    await expect(
      snapshot.getByText('This is an immutable snapshot.', { exact: false }),
    ).toBeVisible();
  });

  test('a prescription can be edited and shows in the slot summary', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Prescription Workout');
    await addExercise(page, 'barbell bench press');

    await expect(page.getByText('3 x 8-12 @ 1-2 RIR')).toBeVisible();
    await page.getByText('3 x 8-12 @ 1-2 RIR').click();

    const drawer = page.getByRole('dialog');
    await drawer.getByRole('textbox', { name: 'Sets' }).fill('4');

    // Reps 8-12 -> 12-20 by walking each thumb with the keyboard.
    const repLow = drawer.getByRole('slider', { name: 'Lowest reps' });
    const repHigh = drawer.getByRole('slider', { name: 'Highest reps' });
    await repHigh.focus();
    for (let step = 0; step < 8; step += 1) await page.keyboard.press('ArrowRight');
    await repLow.focus();
    for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowRight');

    await expect(repLow).toHaveAttribute('aria-valuenow', '12');
    await expect(repHigh).toHaveAttribute('aria-valuenow', '20');

    await drawer.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('4 x 12-20 @ 1-2 RIR')).toBeVisible();
    await expect(page.getByText(/4 sets/u).first()).toBeVisible();
  });

  test('raising the bottom of a range carries the top with it', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Range Workout');
    await addExercise(page, 'barbell bench press');
    await page.getByText('3 x 8-12 @ 1-2 RIR').click();

    const drawer = page.getByRole('dialog');
    const rirLow = drawer.getByRole('slider', { name: 'Lowest RIR' });
    const rirHigh = drawer.getByRole('slider', { name: 'Highest RIR' });

    // RIR 1-2 is exactly the minimum gap. Nudging the bottom to 2 must carry
    // the top to 3 straight away, not wait for them to collide.
    await rirLow.focus();
    await page.keyboard.press('ArrowRight');
    await expect(rirLow).toHaveAttribute('aria-valuenow', '2');
    await expect(rirHigh).toHaveAttribute('aria-valuenow', '3');

    // Reps keep a two-rep gap, so 8-12 raised to 11 carries the top to 13.
    const repLow = drawer.getByRole('slider', { name: 'Lowest reps' });
    const repHigh = drawer.getByRole('slider', { name: 'Highest reps' });
    await repLow.focus();
    for (let step = 0; step < 3; step += 1) await page.keyboard.press('ArrowRight');
    await expect(repLow).toHaveAttribute('aria-valuenow', '11');
    await expect(repHigh).toHaveAttribute('aria-valuenow', '13');

    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('3 x 11-13 @ 2-3 RIR')).toBeVisible();
  });

  test('lowering the top of a range pushes the bottom, keeping the gap', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Range Down Workout');
    await addExercise(page, 'barbell bench press');
    await page.getByText('3 x 8-12 @ 1-2 RIR').click();

    const drawer = page.getByRole('dialog');
    const repLow = drawer.getByRole('slider', { name: 'Lowest reps' });
    const repHigh = drawer.getByRole('slider', { name: 'Highest reps' });

    // 12 down to 3 across nine steps; the bottom is pushed once the gap is hit.
    await repHigh.focus();
    for (let step = 0; step < 9; step += 1) await page.keyboard.press('ArrowLeft');

    await expect(repHigh).toHaveAttribute('aria-valuenow', '3');
    await expect(repLow).toHaveAttribute('aria-valuenow', '1');

    // The range never inverts and never drops below its minimum gap.
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('3 x 1-3 @ 1-2 RIR')).toBeVisible();
  });

  test('a per-exercise rest falls back to the profile default', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Rest Workout');
    await addExercise(page, 'barbell bench press');
    await page.getByText('3 x 8-12 @ 1-2 RIR').click();

    const drawer = page.getByRole('dialog');
    // No rest of its own yet, so it names the profile default -- in seconds,
    // matching the presets and the field.
    await expect(drawer.getByText('your default, 90s')).toBeVisible();

    await drawer.getByRole('button', { name: '180s' }).click();
    await expect(drawer.getByRole('button', { name: 'Use my default' })).toBeVisible();

    await drawer.getByRole('button', { name: 'Use my default' }).click();
    await expect(drawer.getByText('your default, 90s')).toBeVisible();
  });

  test('exercise slots can be reordered with the move buttons', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Slot Order Workout');

    await addExercise(page, 'barbell bench press');
    await addExercise(page, 'barbell squat');

    await page.getByRole('button', { name: /Move Barbell Squat up/u }).click();
    await expect(page.getByTestId('slot-name').first()).toContainText('Barbell Squat');
  });

  test('a workout can be archived and restored', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Archive Me');
    await page.goto('/workouts');

    await page.getByRole('button', { name: 'Archive Archive Me' }).click();
    await expect(page.getByText('Archived')).toBeVisible();

    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('Archived')).toBeHidden();
  });
});

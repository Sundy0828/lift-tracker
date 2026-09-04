import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 acceptance: a 4-day plan builds end to end, editing it produces a
 * new version with a readable summary while workoutIds stay stable, old
 * versions stay viewable and unchanged, and the muscle map tracks the
 * exercises as they are added.
 */

async function signIn(page: Page): Promise<void> {
  const email = `pl-${String(Date.now())}-${String(Math.floor(Math.random() * 100000))}@example.com`;
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Need an account?' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('lifttracker');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

async function createPlan(page: Page, name: string): Promise<void> {
  await page.goto('/plans');
  await expect(page.getByRole('heading', { name: 'Plans' })).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('textbox', { name: 'Plan name' }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Plan name' })).toHaveValue(name);
}

/**
 * Adds an exercise to the workout card at `cardIndex`. Tapping a result opens
 * a preview, so adding takes an explicit confirmation.
 */
async function addExercise(page: Page, cardIndex: number, query: string): Promise<void> {
  await page.getByRole('button', { name: 'Add exercise' }).nth(cardIndex).click();
  await page.getByRole('textbox', { name: 'Search exercises to add' }).fill(query);
  await page.getByTestId('exercise-list').getByRole('button').first().click();
  const confirm = page.getByRole('button', { name: /^Add to /u });
  await confirm.click();
  await expect(confirm).toBeHidden();
}

async function renameWorkout(page: Page, index: number, name: string): Promise<void> {
  const field = page.getByRole('textbox', { name: `Workout ${String(index + 1)} name` });
  await field.fill(name);
  await field.blur();
}

test.describe('plans', () => {
  test('a 4-day plan can be built end to end', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'PPL + Upper');

    const days = ['PUSH', 'PULL', 'CHEST + DELTS', 'ARMS + LEGS'];
    for (const [index, day] of days.entries()) {
      await page.getByRole('button', { name: 'Add workout' }).click();
      await renameWorkout(page, index, day);
    }

    await expect(page.getByRole('textbox', { name: /Workout \d name/u })).toHaveCount(4);
    for (const [index, day] of days.entries()) {
      await expect(
        page.getByRole('textbox', { name: `Workout ${String(index + 1)} name` }),
      ).toHaveValue(day);
    }

    await addExercise(page, 0, 'barbell bench press');
    await addExercise(page, 1, 'barbell row');
    await addExercise(page, 3, 'barbell squat');

    await expect(page.getByText('4 workouts')).toBeVisible();
    // Three exercises at the default 3 sets each.
    await expect(page.getByText('9 sets / week')).toBeVisible();
  });

  test('a new plan appears in the list even though createdAt is server-set', async ({ page }) => {
    // Guards the offline path: the write is pending, so createdAt is null
    // locally. The list must still show the plan.
    await signIn(page);
    await createPlan(page, 'Cache Visible Plan');

    await page.goto('/plans');
    await expect(page.getByText('Cache Visible Plan')).toBeVisible();
  });

  test('the muscle map updates as exercises are added', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Map Plan');
    await page.getByRole('button', { name: 'Add workout' }).click();

    await page.getByRole('button', { name: 'What this session hits' }).click();
    await expect(
      page.getByText('No exercises yet — add one to see what this session hits'),
    ).toBeVisible();

    await addExercise(page, 0, 'barbell bench press');

    // Scoped to the session map: the plan-week map renders a chest row too.
    const chestRow = page.getByTestId('session-muscle-map').locator('[data-muscle-row="chest"]');
    await expect(chestRow).toBeVisible();
    await expect(chestRow).toContainText('3');

    // Adding a second chest exercise increases the number.
    await addExercise(page, 0, 'cable crossover');
    await expect(chestRow).toContainText('6');
  });

  test('the body diagram exposes a path per muscle and is decorative', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'SVG Plan');
    await page.getByRole('button', { name: 'Add workout' }).click();
    await addExercise(page, 0, 'barbell bench press');
    await page.getByRole('button', { name: 'What this session hits' }).click();

    const chestPath = page.locator('svg [data-muscle="chest"]').first();
    await expect(chestPath).toBeAttached();

    // The SVG is hidden from assistive technology; the table carries meaning.
    const svgs = page.locator('svg[aria-hidden="true"]');
    expect(await svgs.count()).toBeGreaterThanOrEqual(2);
  });

  test('adding the same exercise twice marks the second occurrence', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Duplicate Plan');
    await page.getByRole('button', { name: 'Add workout' }).click();

    await addExercise(page, 0, 'barbell bench press');
    await addExercise(page, 0, 'barbell bench press');

    await expect(page.getByText('(again)')).toBeVisible();
    await expect(page.getByText('2 exercises')).toBeVisible();
  });

  test('publishing snapshots the plan, and editing it later leaves that snapshot alone', async ({
    page,
  }) => {
    await signIn(page);
    await createPlan(page, 'Versioned Plan');
    await page.getByRole('button', { name: 'Add workout' }).click();
    await renameWorkout(page, 0, 'CHEST');
    await addExercise(page, 0, 'barbell bench press');

    // --- v1
    await expect(page.getByText('Unpublished changes')).toBeVisible();
    await page.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText('unpublished', { exact: true })).toBeHidden();
    await expect(page.getByText('v1', { exact: true }).first()).toBeVisible();

    // --- edit: rename the day and add a lift
    await renameWorkout(page, 0, 'CHEST + DELTS');
    await addExercise(page, 0, 'dumbbell flyes');

    const alert = page.getByText('Unpublished changes');
    await expect(alert).toBeVisible();
    // The summary reads as a rename, not a delete plus an add, because
    // workoutId is stable across versions.
    await expect(page.getByText(/Renamed CHEST to CHEST \+ DELTS/u)).toBeVisible();

    await page.getByRole('button', { name: 'Publish v2' }).click();

    // --- version history shows both, with readable summaries
    await page.getByRole('button', { name: 'Version history' }).click();
    const history = page.getByLabel('Version history');
    await expect(history.getByText(/^v2$/u)).toBeVisible();
    await expect(history.getByText(/^v1$/u)).toBeVisible();
    await expect(history.getByText(/Renamed CHEST to CHEST \+ DELTS/u)).toBeVisible();

    // --- v1 still shows the week-1 definition
    await history.getByText(/Added workout CHEST/u).click();
    const snapshot = page.getByRole('dialog');
    await expect(snapshot.getByText('CHEST', { exact: true })).toBeVisible();
    await expect(snapshot.getByText('Dumbbell Flyes')).toBeHidden();
    await expect(
      snapshot.getByText('This is an immutable snapshot.', { exact: false }),
    ).toBeVisible();
  });

  test('a prescription can be edited and shows in the slot summary', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Prescription Plan');
    await page.getByRole('button', { name: 'Add workout' }).click();
    await addExercise(page, 0, 'barbell bench press');

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

  test('a range cannot invert: dragging the top thumb down pushes the bottom', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Range Plan');
    await page.getByRole('button', { name: 'Add workout' }).click();
    await addExercise(page, 0, 'barbell bench press');
    await page.getByText('3 x 8-12 @ 1-2 RIR').click();

    const drawer = page.getByRole('dialog');
    const repLow = drawer.getByRole('slider', { name: 'Lowest reps' });
    const repHigh = drawer.getByRole('slider', { name: 'Highest reps' });

    // Walk the top thumb from 12 down past the bottom thumb at 8.
    await repHigh.focus();
    for (let step = 0; step < 9; step += 1) await page.keyboard.press('ArrowLeft');

    // Both ended up at 3: the bottom was pushed down rather than crossed.
    await expect(repHigh).toHaveAttribute('aria-valuenow', '3');
    await expect(repLow).toHaveAttribute('aria-valuenow', '3');

    // Same for RIR, and the readout never shows an inverted range.
    const rirHigh = drawer.getByRole('slider', { name: 'Highest RIR' });
    const rirLow = drawer.getByRole('slider', { name: 'Lowest RIR' });
    await rirHigh.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(rirHigh).toHaveAttribute('aria-valuenow', '0');
    await expect(rirLow).toHaveAttribute('aria-valuenow', '0');

    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('3 x 3 @ 0 RIR')).toBeVisible();
  });

  test('a per-exercise rest falls back to the profile default', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Rest Plan');
    await page.getByRole('button', { name: 'Add workout' }).click();
    await addExercise(page, 0, 'barbell bench press');
    await page.getByText('3 x 8-12 @ 1-2 RIR').click();

    const drawer = page.getByRole('dialog');
    // No rest of its own yet, so it names the profile default.
    await expect(drawer.getByText('your default, 2:00')).toBeVisible();

    await drawer.getByRole('button', { name: '3:00' }).click();
    await expect(drawer.getByRole('button', { name: 'Use my default' })).toBeVisible();

    await drawer.getByRole('button', { name: 'Use my default' }).click();
    await expect(drawer.getByText('your default, 2:00')).toBeVisible();
  });

  test('a workout can be reordered with the move buttons', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Reorder Plan');

    await page.getByRole('button', { name: 'Add workout' }).click();
    await renameWorkout(page, 0, 'FIRST');
    await page.getByRole('button', { name: 'Add workout' }).click();
    await renameWorkout(page, 1, 'SECOND');

    await page.getByRole('button', { name: 'Move SECOND up' }).click();

    await expect(page.getByRole('textbox', { name: 'Workout 1 name' })).toHaveValue('SECOND');
    await expect(page.getByRole('textbox', { name: 'Workout 2 name' })).toHaveValue('FIRST');
  });

  test('exercise slots can be reordered within a workout', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Slot Order Plan');
    await page.getByRole('button', { name: 'Add workout' }).click();

    await addExercise(page, 0, 'barbell bench press');
    await addExercise(page, 0, 'barbell squat');

    await page.getByRole('button', { name: /Move Barbell Squat up/u }).click();
    const rows = page.locator('[data-muscle-row], button').filter({ hasText: 'Barbell' });
    await expect(rows.first()).toContainText('Barbell Squat');
  });

  test('a plan can be archived and restored', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Archive Me');
    await page.goto('/plans');

    await page.getByRole('button', { name: 'Archive Archive Me' }).click();
    await expect(page.getByText('Archived')).toBeVisible();

    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('Archived')).toBeHidden();
  });
});

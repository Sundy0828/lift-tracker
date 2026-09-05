import { expect, test, type Page } from '@playwright/test';

/**
 * Circuits and discarding plan edits.
 */

async function signIn(page: Page): Promise<void> {
  const email = `ci-${String(Date.now())}-${String(Math.floor(Math.random() * 100000))}@example.com`;
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Need an account?' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('lifttracker');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

async function createPlan(page: Page, name: string): Promise<void> {
  await page.goto('/plans');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('textbox', { name: 'Plan name' }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Plan name' })).toHaveValue(name);
}

async function addExercise(page: Page, query: string): Promise<void> {
  await page.getByRole('button', { name: 'Add exercise' }).first().click();
  await page.getByRole('textbox', { name: 'Search exercises to add' }).fill(query);
  await page.getByTestId('exercise-list').getByRole('button').first().click();
  const confirm = page.getByRole('button', { name: /^Add to /u });
  await confirm.click();
  await expect(confirm).toBeHidden();
}

/** Warm-up plus the three exercises that will become the circuit. */
/** Groups a slot into the one above it, waiting for the re-render to settle. */
async function groupWithAbove(page: Page, name: string, expectMembers: number): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp(`^Group ${name} with the exercise above$`, 'u') })
    .click();
  await expect(
    page.getByText(new RegExp(`rounds of these ${String(expectMembers)}, in order`, 'u')),
  ).toBeVisible();
}

async function buildBodyweightWorkout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add workout' }).click();
  const nameField = page.getByRole('textbox', { name: 'Workout 1 name' });
  await nameField.fill('ABS + BODYWEIGHT');
  await nameField.blur();

  // free-exercise-db has no jumping jacks; Bench Jump stands in as the warm-up.
  await addExercise(page, 'bench jump');
  await addExercise(page, 'pushups');
  await addExercise(page, 'crunches');
  await addExercise(page, 'pullups');
  await expect(page.getByText('4 exercises')).toBeVisible();
}

test.describe('circuits', () => {
  test('three exercises can be grouped into one circuit', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Circuit Plan');
    await buildBodyweightWorkout(page);

    // Nothing is a circuit to begin with.
    await expect(page.getByTestId('circuit-block')).toHaveCount(0);

    // Group the 2nd into the 1st, then pull the 3rd into the same group.
    await groupWithAbove(page, 'Crunches', 2);
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);

    await groupWithAbove(page, 'Pullups', 3);

    // Still ONE circuit with three members — not three separate groups, which
    // is what the old superset toggle produced.
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
  });

  test('the circuit owns its rounds, and rounds apply to every member', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Rounds Plan');
    await buildBodyweightWorkout(page);
    await groupWithAbove(page, 'Crunches', 2);
    await groupWithAbove(page, 'Pullups', 3);

    const rounds = page.getByRole('textbox', { name: /^Rounds for the circuit/u });
    await rounds.fill('4');
    await expect(rounds).toHaveValue(/4/);

    await expect(page.getByText(/4 rounds of these 3, in order/u)).toBeVisible();
    // Warm-up 3 sets + 3 members x 4 rounds. Exact: the plan header also
    // carries a "15 sets / week" badge.
    await expect(page.getByText('15 sets', { exact: true })).toBeVisible();
  });

  test('a circuit member has no rest of its own by default', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Flow Plan');
    await buildBodyweightWorkout(page);
    await groupWithAbove(page, 'Crunches', 2);

    // Joining drops the member rest to 0, so the round flows straight through
    // rather than pausing after each exercise.
    await expect(page.getByText(/^then /u)).toBeHidden();

    // The pause belongs to the circuit instead, and starts on the profile
    // default rather than a value of its own.
    await expect(page.getByText('rest between rounds')).toBeVisible();
    const roundRest = page.getByRole('textbox', { name: /^Rest between rounds/u });
    await expect(roundRest).toHaveValue('');
    await roundRest.fill('30');
    await expect(roundRest).toHaveValue(/30/);
  });

  test('a member can be removed from the circuit again', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Unlink Plan');
    await buildBodyweightWorkout(page);
    await groupWithAbove(page, 'Crunches', 2);
    await groupWithAbove(page, 'Pullups', 3);

    await page.getByRole('button', { name: /^Remove Pullups from the circuit$/u }).click();
    await expect(page.getByText(/3 rounds of these 2/u)).toBeVisible();

    // Removing the second-to-last dissolves the circuit entirely.
    await page.getByRole('button', { name: /^Remove Crunches from the circuit$/u }).click();
    await expect(page.getByTestId('circuit-block')).toHaveCount(0);
    await expect(page.getByText('4 exercises')).toBeVisible();
  });

  test('a circuit survives a reload', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Persist Plan');
    await buildBodyweightWorkout(page);
    await groupWithAbove(page, 'Crunches', 2);

    const roundRest = page.getByRole('textbox', { name: /^Rest between rounds/u });
    await roundRest.fill('45');
    await expect(roundRest).toHaveValue(/45/);

    await page.reload();
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: /^Rest between rounds/u })).toHaveValue(/45/);
  });
});

test.describe('discarding plan edits', () => {
  test('discard reverts the working copy to the last published version', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Discard Plan');
    await page.getByRole('button', { name: 'Add workout' }).click();
    const nameField = page.getByRole('textbox', { name: 'Workout 1 name' });
    await nameField.fill('PUSH');
    await nameField.blur();
    await addExercise(page, 'barbell bench press');

    await page.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText('Unpublished changes')).toBeHidden();

    // Experiment: add a lift and change the day name.
    await addExercise(page, 'dumbbell flyes');
    await nameField.fill('PUSH EXPERIMENT');
    await nameField.blur();
    await expect(page.getByText('Unpublished changes')).toBeVisible();
    await expect(page.getByText('2 exercises')).toBeVisible();

    // Back it all out.
    await page.getByRole('button', { name: /^Discard, back to v1$/u }).click();

    await expect(page.getByText('Unpublished changes')).toBeHidden();
    await expect(page.getByText('1 exercise')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Workout 1 name' })).toHaveValue('PUSH');
    // Discarding is not a publish, so the version does not move.
    await expect(page.getByText('v1', { exact: true }).first()).toBeVisible();
  });

  test('edits survive leaving the screen, so nothing is lost by accident', async ({ page }) => {
    // The counterpart to discard: edits auto-save, so an interruption mid-edit
    // keeps the work and backing out stays an explicit choice.
    await signIn(page);
    await createPlan(page, 'Autosave Plan');
    await page.getByRole('button', { name: 'Add workout' }).click();
    await addExercise(page, 'barbell squat');

    await page.goto('/plans');
    // By role, and settle on the editor before asserting: clicking the row
    // while the list is still rendering can hit a detached node.
    await page.getByRole('link', { name: 'Autosave Plan' }).click();
    await expect(page.getByRole('textbox', { name: 'Plan name' })).toHaveValue('Autosave Plan');

    await expect(page.getByText('1 exercise')).toBeVisible();
    await expect(page.getByText('Unpublished changes')).toBeVisible();
  });

  test('an unpublished plan discards to empty, and says so', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Never Published');
    await page.getByRole('button', { name: 'Add workout' }).click();
    await addExercise(page, 'barbell squat');

    await page.getByRole('button', { name: 'Discard all' }).click();

    await expect(page.getByText('0 workouts')).toBeVisible();
    await expect(page.getByText('Unpublished changes')).toBeHidden();
  });
});

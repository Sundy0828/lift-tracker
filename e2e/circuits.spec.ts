import { expect, test, type Page } from '@playwright/test';

/**
 * Circuits and discarding plan edits.
 */

/**
 * The pointer sensor arms on a hold, not on distance, so a drag has to wait
 * with the button down before it moves. A move inside the hold cancels
 * activation — that is what leaves the horizontal swipe gesture free — so this
 * has to sit between mouse.down() and the first move.
 */
const DRAG_HOLD_MS = 260;

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
  // Appends: with an insert row under every exercise, the last one is the end.
  await page.getByTestId('insert-exercise').last().click();
  await page.getByRole('textbox', { name: 'Search exercises to add' }).fill(query);
  await page.getByTestId('exercise-list').getByRole('button').first().click();
  const confirm = page.getByRole('button', { name: /^Add to /u });
  await confirm.click();
  await expect(confirm).toBeHidden();
  // Both picker modals must finish closing: while an overlay is still painted
  // it swallows the pointer, so any drag that follows goes nowhere.
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Picks up `name`'s handle and holds it over `onto`'s, without releasing. */
async function dragOnto(page: Page, name: string, onto: string): Promise<void> {
  const handle = page.getByRole('button', { name: new RegExp(`^Reorder or group ${name}$`, 'u') });
  const target = page.getByRole('button', { name: new RegExp(`^Reorder or group ${onto}$`, 'u') });

  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  expect(from, `no box for ${name}`).not.toBeNull();
  expect(to, `no box for ${onto}`).not.toBeNull();
  if (from === null || to === null) return;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(DRAG_HOLD_MS);
  // Nudge clear of the row, then travel to the target.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
}

/**
 * Groups a slot into the one above it with the real gesture: drag, hold until
 * the target offers to group, release.
 */
async function groupWithAbove(page: Page, name: string, onto: string, expectMembers: number) {
  await dragOnto(page, name, onto);
  await expect(page.getByText('release to group')).toBeVisible();
  await page.mouse.up();

  await expect(
    page.getByText(new RegExp(`rounds of these ${String(expectMembers)}, in order`, 'u')),
  ).toBeVisible();
}

/** Warm-up plus the three exercises that will become the circuit. */
async function buildBodyweightWorkout(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ Add another day' }).click();
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
    await groupWithAbove(page, 'Crunches', 'Pushups', 2);
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);

    await groupWithAbove(page, 'Pullups', 'Crunches', 3);

    // Still ONE circuit with three members — not three separate groups, which
    // is what the old superset toggle produced.
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
  });

  test('the circuit owns its rounds, and rounds apply to every member', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Rounds Plan');
    await buildBodyweightWorkout(page);
    await groupWithAbove(page, 'Crunches', 'Pushups', 2);
    await groupWithAbove(page, 'Pullups', 'Crunches', 3);

    const rounds = page.getByRole('textbox', { name: /^Rounds for the circuit/u });
    await rounds.fill('4');
    await expect(rounds).toHaveValue(/4/);

    await expect(page.getByText(/4 rounds of these 3, in order/u)).toBeVisible();
    // Warm-up 3 sets + 3 members x 4 rounds. Exact: the plan header also
    // carries a "15 sets / week" badge.
    await expect(page.getByText('15 sets', { exact: true })).toBeVisible();
  });

  test('a circuit adds no pause of its own until you place one', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Flow Plan');
    await buildBodyweightWorkout(page);
    await groupWithAbove(page, 'Crunches', 'Pushups', 2);

    // A round flows straight through: no rest rows unless you add them.
    await expect(page.getByRole('textbox', { name: 'Rest length' })).toHaveCount(0);

    // The round rest starts on the profile default rather than a value of
    // its own, so an untouched circuit inherits your setting.
    const roundRest = page.getByRole('textbox', { name: /^Rest between rounds/u });
    await expect(roundRest).toHaveValue('');
    await roundRest.fill('30');
    await expect(roundRest).toHaveValue(/30/);
  });

  test('a circuit survives a reload', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Persist Plan');
    await buildBodyweightWorkout(page);
    await groupWithAbove(page, 'Crunches', 'Pushups', 2);

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
    await page.getByRole('button', { name: '+ Add another day' }).click();
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
    await page.getByRole('button', { name: '+ Add another day' }).click();
    await addExercise(page, 'barbell squat');

    // In-app navigation, which is how leaving the screen actually happens.
    // A hard page load fired in the same tick as the write is a different
    // test: it can outrun Firestore's IndexedDB flush and is not the claim.
    await page.getByRole('link', { name: 'Back to plans' }).click();
    await expect(page.getByRole('heading', { name: 'Plans' })).toBeVisible();

    await page.getByRole('link', { name: 'Autosave Plan' }).click();
    await expect(page.getByRole('textbox', { name: 'Plan name' })).toHaveValue('Autosave Plan');

    await expect(page.getByText('1 exercise')).toBeVisible();
    await expect(page.getByText('Unpublished changes')).toBeVisible();
  });

  test('an unpublished plan discards to empty, and says so', async ({ page }) => {
    await signIn(page);
    await createPlan(page, 'Never Published');
    await page.getByRole('button', { name: '+ Add another day' }).click();
    await addExercise(page, 'barbell squat');

    await page.getByRole('button', { name: 'Discard all' }).click();

    await expect(page.getByText('0 workouts')).toBeVisible();
    await expect(page.getByText('Unpublished changes')).toBeHidden();
  });
});

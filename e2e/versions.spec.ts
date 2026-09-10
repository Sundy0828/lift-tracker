import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * Circuits, and discarding unpublished workout edits.
 */

/**
 * The pointer sensor arms on a hold, not on distance, so a drag has to wait
 * with the button down before it moves. A move inside the hold cancels
 * activation — that is what leaves the horizontal swipe gesture free — so this
 * has to sit between mouse.down() and the first move.
 */
const DRAG_HOLD_MS = 260;

async function signIn(page: Page): Promise<void> {
  await signUp(page, 'ci');
}

async function createWorkout(page: Page, name: string): Promise<void> {
  await page.goto('/workouts');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  // Scoped to the dialog: the editor's own name field shares this label.
  await page.getByRole('dialog').getByRole('textbox', { name: 'Workout name' }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue(name);
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

  // `hover` rather than a box captured up front: it waits for the row to stop
  // moving and scrolls it into view. Adding an exercise closes two modals and
  // reflows the list, so coordinates read before that settles can point at
  // empty space by the time the button goes down — and a mousedown that misses
  // the handle starts no drag at all.
  await handle.hover();
  await page.mouse.down();
  await page.waitForTimeout(DRAG_HOLD_MS);

  const from = await handle.boundingBox();
  expect(from, `no box for ${name}`).not.toBeNull();
  if (from === null) return;
  // Nudge clear of the row so the sortable picks it up.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 5 });

  // Read after the drag has started: the rows have shifted to make room, so a
  // box read before it is stale.
  const to = await target.boundingBox();
  expect(to, `no box for ${onto}`).not.toBeNull();
  if (to === null) return;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await holdToGroup(page, to.x + to.width / 2, to.y + to.height / 2);
}
/**
 * Holds over the target until it offers to group, jiggling as a finger would.
 *
 * The app arms grouping on a dwell, and dnd-kit re-evaluates the drop target on
 * every pointer move, so the rows shifting to make room can flip that target
 * away the instant a *synthetic* pointer stops dead — cancelling the dwell with
 * nothing left to restart it. A real hand is never that still. These 1px nudges
 * stay inside the target, which the app treats as the same hover and so does not
 * restart, and are what make the gesture land reliably.
 */
async function holdToGroup(page: Page, x: number, y: number): Promise<void> {
  const hint = page.getByText('release to group');
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await hint.isVisible()) return;
    await page.mouse.move(x + (attempt % 2 === 0 ? 1 : -1), y, { steps: 2 });
    await page.waitForTimeout(100);
  }
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
  // free-exercise-db has no jumping jacks; Bench Jump stands in as the warm-up.
  await addExercise(page, 'bench jump');
  await addExercise(page, 'pushups');
  await addExercise(page, 'crunches');
  await addExercise(page, 'pullups');
  await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
}

test.describe('circuits', () => {
  test('three exercises can be grouped into one circuit', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'ABS + BODYWEIGHT');
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
    await createWorkout(page, 'Rounds Workout');
    await buildBodyweightWorkout(page);
    await groupWithAbove(page, 'Crunches', 'Pushups', 2);
    await groupWithAbove(page, 'Pullups', 'Crunches', 3);

    const rounds = page.getByRole('textbox', { name: /^Rounds for the circuit/u });
    await rounds.fill('4');
    await expect(rounds).toHaveValue(/4/);

    await expect(page.getByText(/4 rounds of these 3, in order/u)).toBeVisible();
    // Warm-up 3 sets + 3 members x 4 rounds.
    await expect(page.getByText('15 sets', { exact: true })).toBeVisible();
  });

  test('a circuit adds no pause of its own until you place one', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Flow Workout');
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
    await createWorkout(page, 'Persist Workout');
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

test.describe('discarding workout edits', () => {
  test('discard reverts the working copy to the last published version', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'PUSH');
    await addExercise(page, 'barbell bench press');

    await page.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText('Unpublished changes')).toBeHidden();

    // Experiment: add a lift and change the name.
    await addExercise(page, 'dumbbell flyes');
    const nameField = page.getByRole('textbox', { name: 'Workout name' });
    await nameField.fill('PUSH EXPERIMENT');
    await nameField.blur();
    await expect(page.getByText('Unpublished changes')).toBeVisible();
    await expect(page.getByText('2 exercises', { exact: true })).toBeVisible();

    // Back it all out.
    await page.getByRole('button', { name: /^Discard, back to v1$/u }).click();

    await expect(page.getByText('Unpublished changes')).toBeHidden();
    await expect(page.getByText('1 exercise', { exact: true })).toBeVisible();
    await expect(nameField).toHaveValue('PUSH');
    // Discarding is not a publish, so the version does not move.
    await expect(page.getByText('v1', { exact: true }).first()).toBeVisible();
  });

  test('edits survive leaving the screen, so nothing is lost by accident', async ({ page }) => {
    // The counterpart to discard: edits auto-save, so an interruption mid-edit
    // keeps the work and backing out stays an explicit choice.
    await signIn(page);
    await createWorkout(page, 'Autosave Workout');
    await addExercise(page, 'barbell squat');

    // In-app navigation, which is how leaving the screen actually happens.
    // A hard page load fired in the same tick as the write is a different
    // test: it can outrun Firestore's IndexedDB flush and is not the claim.
    await page.getByRole('link', { name: 'Back to workouts' }).click();
    await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();

    await page.getByRole('link', { name: 'Autosave Workout' }).click();
    await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue(
      'Autosave Workout',
    );

    await expect(page.getByText('1 exercise', { exact: true })).toBeVisible();
    await expect(page.getByText('Unpublished changes')).toBeVisible();
  });

  test('a never-published workout is offered publish but no discard', async ({ page }) => {
    // With no snapshot there is nothing to revert to, so the only way out is
    // to delete the workout — not a button that silently empties the list.
    await signIn(page);
    await createWorkout(page, 'Never Published');
    await addExercise(page, 'barbell squat');

    await expect(page.getByText('Unpublished changes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish v1' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Discard/u })).toHaveCount(0);
  });
});

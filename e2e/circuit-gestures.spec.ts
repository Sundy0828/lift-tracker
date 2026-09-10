import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * Building a circuit by dragging, leaving one by dragging out, adding an
 * exercise in place, and pacing a round unevenly.
 */

/**
 * The pointer sensor arms on a hold, so a drag has to wait with the button
 * down before the first move counts. Comfortably longer than the sensor's
 * delay: a move before it elapses is simply ignored, and the drag would then
 * start from the wrong place.
 */
const DRAG_HOLD_MS = 260;

async function signIn(page: Page): Promise<void> {
  await signUp(page, 'cg');
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

async function createWorkout(page: Page, name: string): Promise<void> {
  await page.goto('/workouts');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  // Scoped to the dialog: the editor's own name field shares this label.
  await page.getByRole('dialog').getByRole('textbox', { name: 'Workout name' }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue(name);
}

async function buildWorkout(page: Page, name: string): Promise<void> {
  await createWorkout(page, name);

  await addExercise(page, 'bench jump');
  await addExercise(page, 'pushups');
  await addExercise(page, 'crunches');
  await addExercise(page, 'pullups');
  await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
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

async function group(page: Page, name: string, onto: string, members: number): Promise<void> {
  await dragOnto(page, name, onto);
  await expect(page.getByText('release to group')).toBeVisible();
  await page.mouse.up();
  await expect(
    page.getByText(new RegExp(`rounds of these ${String(members)}, in order`, 'u')),
  ).toBeVisible();
}

test.describe('drag to group', () => {
  test('holding over another exercise groups them on release', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Dwell Workout');

    await dragOnto(page, 'Crunches', 'Pushups');
    // The target says what the drop will do before you commit to it.
    await expect(page.getByText('release to group')).toBeVisible();

    await page.mouse.up();
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
    await expect(page.getByText(/3 rounds of these 2, in order/u)).toBeVisible();
  });

  test('holding squarely on the target is enough, with no extra movement', async ({ page }) => {
    // Regression: the dwell timer used to restart every time `over` changed,
    // and it flips back and forth as the list shifts to make room. Holding a
    // row dead centre on another therefore never armed, and joining needed
    // the pointer nudged slightly off the target's edge instead.
    await signIn(page);
    await buildWorkout(page, 'Square Hold Workout');

    const handle = page.getByRole('button', { name: /^Reorder or group Crunches$/u });
    const target = page.getByRole('button', { name: /^Reorder or group Pushups$/u });
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (from === null || to === null) return;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(DRAG_HOLD_MS);
    // Straight there, then completely still.
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });

    await expect(page.getByText('release to group')).toBeVisible();
    await page.mouse.up();
    await expect(page.getByText(/3 rounds of these 2, in order/u)).toBeVisible();
  });

  test('a third exercise joins the same circuit, not a second one', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Three Workout');

    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
  });

  test('a quick drag still reorders instead of grouping', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Quick Drag Workout');

    const handle = page.getByRole('button', { name: /^Reorder or group Pullups$/u });
    const target = page.getByRole('button', { name: /^Reorder or group Crunches$/u });
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (from === null || to === null) return;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(DRAG_HOLD_MS);
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
    await page.mouse.up();

    // Released before the dwell settled, so it stayed a reorder.
    await expect(page.getByTestId('circuit-block')).toHaveCount(0);
    await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
  });

  test('two members of the same circuit offer no grouping', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Same Group Workout');
    await group(page, 'Crunches', 'Pushups', 2);

    // Already together, so however long it hovers it stays a reorder.
    await dragOnto(page, 'Crunches', 'Pushups');
    await page.waitForTimeout(1000);
    await expect(page.getByText('release to group')).toBeHidden();
    await page.mouse.up();
  });

  test('the keyboard can group too, with g', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Keyboard Workout');

    // dnd-kit updates the drop target asynchronously, so the keystrokes are
    // spaced the way a person's would be.
    await page.getByRole('button', { name: /^Reorder or group Crunches$/u }).focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(150);
    await page.keyboard.press('g');
    await page.waitForTimeout(150);
    await page.keyboard.press('Space');

    await expect(page.getByText(/3 rounds of these 2, in order/u)).toBeVisible();
  });

  test('the gesture is explained where it is used', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Hint Workout');
    await expect(page.getByText(/hold for a moment to make them a circuit/u)).toBeVisible();
  });
});

test.describe('drag out of a circuit', () => {
  test('dragging a member clear of the block removes it', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Drag Out Workout');
    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    // Drag the last member up above the warm-up, clear of the circuit.
    const handle = page.getByRole('button', { name: /^Reorder or group Pullups$/u });
    const target = page.getByRole('button', { name: /^Reorder or group Bench Jump$/u });
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (from === null || to === null) return;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(DRAG_HOLD_MS);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 24, { steps: 12 });
    await page.mouse.up();

    // The circuit is down to two and still one block.
    await expect(page.getByText(/3 rounds of these 2, in order/u)).toBeVisible();
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
  });

  test('the keyboard can leave a circuit by arrowing out', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Keyboard Out Workout');
    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    // No button for it: pick the row up and arrow it clear of the block.
    await page.getByRole('button', { name: /^Reorder or group Pullups$/u }).focus();
    await page.keyboard.press('Space');
    for (let step = 0; step < 3; step += 1) {
      await page.waitForTimeout(120);
      await page.keyboard.press('ArrowUp');
    }
    await page.waitForTimeout(120);
    await page.keyboard.press('Space');

    await expect(page.getByText(/rounds of these 2, in order/u)).toBeVisible();
  });
});

test.describe('adding in place, and uneven rests', () => {
  test('the plus on a row inserts directly after it', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Insert Workout');

    await page.getByRole('button', { name: /^Add an exercise after Bench Jump$/u }).click();
    await page.getByRole('textbox', { name: 'Search exercises to add' }).fill('barbell squat');
    await page.getByTestId('exercise-list').getByRole('button').first().click();
    await page.getByRole('button', { name: /^Add to /u }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Second in the list, not appended at the end.
    const names = await page.getByTestId('slot-name').allTextContents();
    expect(names[0]).toContain('Bench Jump');
    expect(names[1]).toContain('Barbell Squat');
    await expect(page.getByText('5 exercises', { exact: true })).toBeVisible();
  });

  test('the plus on a circuit member adds another member', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Insert Circuit Workout');
    await group(page, 'Crunches', 'Pushups', 2);

    await page
      .getByRole('button', { name: /^Add an exercise after Pushups, in the circuit$/u })
      .click();
    await page.getByRole('textbox', { name: 'Search exercises to add' }).fill('barbell squat');
    await page.getByTestId('exercise-list').getByRole('button').first().click();
    await page.getByRole('button', { name: /^Add to /u }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Joined the circuit rather than landing loose inside the block.
    await expect(page.getByText(/3 rounds of these 3, in order/u)).toBeVisible();
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
  });

  test('a rest row can be placed between exercises, with its own length', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Rest Row Workout');
    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    // The 400-then-2k case: a short pause after the first, a long one later.
    await page.getByRole('button', { name: /^Add a rest after Pushups, in the circuit$/u }).click();
    await page.getByRole('textbox', { name: 'Rest length' }).first().fill('15');

    await page
      .getByRole('button', { name: /^Add a rest after Crunches, in the circuit$/u })
      .click();
    const lengths = page.getByRole('textbox', { name: 'Rest length' });
    await expect(lengths).toHaveCount(2);
    await lengths.nth(1).fill('90');
    await lengths.nth(1).blur();
    // Asserted before the reload: the write is fire-and-forget (§2.8), so this
    // is what waits for it instead of racing it.
    await expect(lengths.nth(1)).toHaveValue(/90/);

    // Rests sit inside the circuit but are not exercises: still 3 rounds of 3.
    await expect(page.getByText(/3 rounds of these 3, in order/u)).toBeVisible();
    await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();

    await page.reload();
    const after = page.getByRole('textbox', { name: 'Rest length' });
    await expect(after).toHaveCount(2);
    await expect(after.nth(0)).toHaveValue(/15/);
    await expect(after.nth(1)).toHaveValue(/90/);
  });

  test('a rest row adds no sets and no volume', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Rest Volume Workout');
    await expect(page.getByText('12 sets', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /^Add a rest after Pushups$/u }).click();
    await page.getByRole('textbox', { name: 'Rest length' }).fill('60');

    // Still 12 sets, and the exercise count is unchanged.
    await expect(page.getByText('12 sets', { exact: true })).toBeVisible();
    await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
  });

  test('the round rest label explains itself on hover', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Round Rest Tooltip Workout');
    await group(page, 'Crunches', 'Pushups', 2);

    await page.getByTestId('circuit-block').getByText('round rest').hover();
    await expect(page.getByText(/Pause after a whole round/u)).toBeVisible();
  });
});

test.describe('deleting rows', () => {
  test('an exercise can be deleted from its row', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Delete Workout');

    await page.getByRole('button', { name: /^Delete Crunches$/u }).click();

    await expect(page.getByText('3 exercises', { exact: true })).toBeVisible();
    await expect(page.getByTestId('slot-name').filter({ hasText: 'Crunches' })).toHaveCount(0);
  });

  test('a rest row can be deleted too', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Delete Rest Workout');

    await page.getByRole('button', { name: /^Add a rest after Pushups$/u }).click();
    await expect(page.getByRole('textbox', { name: 'Rest length' })).toHaveCount(1);

    await page.getByRole('button', { name: /^Delete rest$/u }).click();
    await expect(page.getByRole('textbox', { name: 'Rest length' })).toHaveCount(0);
    await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
  });

  test('deleting down to one member dissolves the circuit', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Delete Member Workout');
    await group(page, 'Crunches', 'Pushups', 2);

    // A circuit of one is just an exercise, so the block goes with it.
    await page.getByRole('button', { name: /^Delete Crunches$/u }).click();
    await expect(page.getByTestId('circuit-block')).toHaveCount(0);
    await expect(page.getByText('3 exercises', { exact: true })).toBeVisible();
  });

  test('the round rest label is not truncated', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Label Workout');
    await group(page, 'Crunches', 'Pushups', 2);

    const label = page.getByText('round rest');
    await expect(label).toBeVisible();
    // Rendered width matches its content, so no ellipsis is applied.
    const overflowing = await label.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(overflowing).toBe(false);
  });
});

/**
 * Drags `name`'s row body sideways by `dx`, without releasing. Pressing the
 * body rather than the handle is the point: the drag sensor is armed only on
 * the handle, so a horizontal pull anywhere else can only be a swipe.
 */
async function swipeRow(page: Page, name: string, dx: number): Promise<void> {
  const row = page.getByTestId('slot-name').filter({ hasText: name });
  const box = await row.boundingBox();
  expect(box, `no box for ${name}`).not.toBeNull();
  if (box === null) return;

  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  // Straight across: a move with any vertical bias is left to the page scroll.
  await page.mouse.move(box.x + box.width / 2 + dx, y, { steps: 10 });
}

test.describe('swipe to delete', () => {
  test('swiping a row far enough left deletes it', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Swipe Workout');

    await swipeRow(page, 'Crunches', -140);
    // The action is named under the row before you let go.
    await expect(page.getByText('Delete Crunches', { exact: true })).toBeVisible();
    await page.mouse.up();

    await expect(page.getByTestId('slot-name').filter({ hasText: 'Crunches' })).toHaveCount(0);
    await expect(page.getByText('3 exercises', { exact: true })).toBeVisible();
  });

  test('a short swipe springs back and deletes nothing', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Swipe Back Workout');

    await swipeRow(page, 'Crunches', -40);
    await page.mouse.up();

    await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
    await expect(page.getByTestId('slot-name').filter({ hasText: 'Crunches' })).toHaveCount(1);
    // The swipe swallowed its own click, so the edit sheet never opened.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a circuit member can be swiped away too', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Swipe Circuit Workout');
    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    await swipeRow(page, 'Pullups', -140);
    await page.mouse.up();

    await expect(page.getByText(/3 rounds of these 2, in order/u)).toBeVisible();
  });
});

test.describe('adding at the start', () => {
  test('the insert row above the first exercise adds at the top', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Start Insert Workout');

    await page.getByRole('button', { name: /^Add an exercise at the start$/u }).click();
    await page.getByRole('textbox', { name: 'Search exercises to add' }).fill('barbell squat');
    await page.getByTestId('exercise-list').getByRole('button').first().click();
    await page.getByRole('button', { name: /^Add to /u }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const names = await page.getByTestId('slot-name').allTextContents();
    expect(names[0]).toContain('Barbell Squat');
    await expect(page.getByText('5 exercises', { exact: true })).toBeVisible();
  });

  test('an empty workout is filled from its insert row alone', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Empty Insert Workout');

    // No separate "Add exercise" button any more: the one insert row is it.
    await expect(page.getByText('No exercises yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add exercise' })).toHaveCount(0);
    await expect(page.getByTestId('insert-exercise')).toHaveCount(1);

    await addExercise(page, 'bench jump');
    await expect(page.getByText('1 exercise', { exact: true })).toBeVisible();
  });
});

test.describe('row layout', () => {
  test('the drag handle sits left of the exercise name', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Handle Workout');

    const handle = page.getByRole('button', { name: /^Reorder or group Pushups$/u });
    const name = page.getByTestId('slot-name').filter({ hasText: 'Pushups' });
    const handleBox = await handle.boundingBox();
    const nameBox = await name.boundingBox();
    expect(handleBox).not.toBeNull();
    expect(nameBox).not.toBeNull();
    if (handleBox === null || nameBox === null) return;

    expect(handleBox.x + handleBox.width).toBeLessThanOrEqual(nameBox.x);
  });
});

test.describe('leaving a circuit', () => {
  /**
   * The case drag cannot cover. With two exercises both in the circuit there
   * is no position outside the block to drag to, so reordering only ever
   * swaps them and the group survives. Swipe right is the way out.
   */
  test('a two-exercise workout that is all circuit can still be broken up', async ({ page }) => {
    await signIn(page);
    await createWorkout(page, 'Pair Workout');
    await addExercise(page, 'pushups');
    await addExercise(page, 'crunches');

    await group(page, 'Crunches', 'Pushups', 2);
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);

    await swipeRow(page, 'Crunches', 140);
    // The action names itself before you let go.
    await expect(page.getByText('Leave circuit', { exact: true })).toBeVisible();
    await page.mouse.up();

    // A circuit of one is just an exercise, so the whole block dissolves.
    await expect(page.getByTestId('circuit-block')).toHaveCount(0);
    await expect(page.getByText('2 exercises', { exact: true })).toBeVisible();
  });

  test('swiping a member right leaves the rest of the circuit intact', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Leave Workout');
    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    await swipeRow(page, 'Pullups', 140);
    await page.mouse.up();

    // Down to two members, still one block, and nothing deleted.
    await expect(page.getByText(/3 rounds of these 2, in order/u)).toBeVisible();
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
    await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
  });

  test('a short right swipe springs back and stays in the circuit', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Leave Back Workout');
    await group(page, 'Crunches', 'Pushups', 2);

    await swipeRow(page, 'Crunches', 40);
    await page.mouse.up();

    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
    await expect(page.getByText(/3 rounds of these 2, in order/u)).toBeVisible();
  });

  test('a row outside a circuit has nothing to reveal on the right', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'No Leave Workout');

    await swipeRow(page, 'Pushups', 140);
    await expect(page.getByText('Leave circuit', { exact: true })).toHaveCount(0);
    await page.mouse.up();

    await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
  });
});

/**
 * Picks `name` up by its handle and drags it by (`dx`, `dy`), without
 * releasing.
 *
 * The gesture for leaving a circuit is dragging clear of the block's box in
 * any direction, so both axes matter: sideways needs a wide enough screen,
 * while up and down go out through the block's header and footer and so work
 * on a narrow phone.
 */
async function dragBy(page: Page, name: string, dx: number, dy: number): Promise<void> {
  const handle = page.getByRole('button', { name: new RegExp(`^Reorder or group ${name}$`, 'u') });
  // Hovered first, for the same reason as `dragOnto`: the row has to have
  // stopped moving before the button goes down, or the press misses the
  // handle and no drag starts at all.
  await handle.hover();
  await page.mouse.down();
  await page.waitForTimeout(DRAG_HOLD_MS);

  const from = await handle.boundingBox();
  expect(from, `no box for ${name}`).not.toBeNull();
  if (from === null) return;
  await page.mouse.move(from.x + from.width / 2 + dx, from.y + from.height / 2 + dy, {
    steps: 10,
  });
}

test.describe('dragging out of a circuit', () => {
  test('a workout that is entirely one circuit can still be broken up', async ({ page }) => {
    // The case that has no outside: two exercises, both members, so every
    // reorder leaves them adjacent and still grouped.
    await signIn(page);
    await createWorkout(page, 'Pull Out Workout');
    await addExercise(page, 'pushups');
    await addExercise(page, 'crunches');
    await group(page, 'Crunches', 'Pushups', 2);

    await dragBy(page, 'Crunches', 120, 0);
    // The row says what releasing will do.
    await expect(page.getByText('release to leave')).toBeVisible();
    await page.mouse.up();

    // A circuit of one is just an exercise, so the block dissolves.
    await expect(page.getByTestId('circuit-block')).toHaveCount(0);
    await expect(page.getByText('2 exercises', { exact: true })).toBeVisible();
    await expect(page.getByTestId('slot-name').filter({ hasText: 'Crunches' })).toHaveCount(1);
  });

  test('the row lands on the side it was dropped, not back where it started', async ({ page }) => {
    // Dragging a row out and having it sit where it was reads as the gesture
    // not having worked.
    await signIn(page);
    await buildWorkout(page, 'Landing Workout');
    await group(page, 'Crunches', 'Pushups', 2);

    // Pushups, Crunches is the circuit; pull Crunches out upwards.
    await dragBy(page, 'Crunches', 0, -110);
    await page.mouse.up();

    const names = await page.getByTestId('slot-name').allTextContents();
    const crunches = names.findIndex((name) => name.includes('Crunches'));
    const pushups = names.findIndex((name) => name.includes('Pushups'));
    expect(crunches).toBeLessThan(pushups);
  });

  test('pulling a member down puts it below the block', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Landing Down Workout');
    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    // The first member, dragged downwards, ends up after the whole block.
    await dragBy(page, 'Pushups', 0, 200);
    await page.mouse.up();

    const names = await page.getByTestId('slot-name').allTextContents();
    expect(names.at(-1)).toContain('Pushups');
    // The remaining two closed up and are still a circuit.
    await expect(page.getByText(/3 rounds of these 2, in order/u)).toBeVisible();
  });

  test('pulling one member out leaves the rest of the circuit intact', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Pull One Workout');
    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    await dragBy(page, 'Pullups', 120, 0);
    await page.mouse.up();

    await expect(page.getByText(/3 rounds of these 2, in order/u)).toBeVisible();
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
    // Nothing was deleted — it is just no longer a member.
    await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
  });

  test('dragging up out of the block works too, which is the phone case', async ({ page }) => {
    // A circuit spans nearly the full width of a phone, so sideways can run
    // out of screen before it clears the edge. Up goes out through the
    // block's header instead, and there is always room for that.
    await signIn(page);
    await buildWorkout(page, 'Pull Up Workout');
    await group(page, 'Crunches', 'Pushups', 2);

    await dragBy(page, 'Pushups', 0, -110);
    await expect(page.getByText('release to leave')).toBeVisible();
    await page.mouse.up();

    await expect(page.getByTestId('circuit-block')).toHaveCount(0);
    await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
  });

  test('a small wobble still reorders rather than leaving', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Wobble Workout');
    await group(page, 'Crunches', 'Pushups', 2);

    // Inside the block's padding plus the margin, so it has cleared nothing.
    await dragBy(page, 'Crunches', 20, 0);
    await expect(page.getByText('release to leave')).toHaveCount(0);
    await page.mouse.up();

    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
  });

  test('reordering inside the block does not leave it', async ({ page }) => {
    // Swapping two members is a drag the length of a row, which stays well
    // inside a block that is taller than its rows.
    await signIn(page);
    await buildWorkout(page, 'Inner Reorder Workout');
    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    await dragBy(page, 'Pullups', 0, -40);
    await expect(page.getByText('release to leave')).toHaveCount(0);
    await page.mouse.up();

    await expect(page.getByText(/3 rounds of these 3, in order/u)).toBeVisible();
  });

  test('a row outside a circuit is not freed sideways', async ({ page }) => {
    // Nothing to leave, so the drag stays on the vertical axis and the hint
    // never appears.
    await signIn(page);
    await buildWorkout(page, 'No Pull Workout');

    await dragBy(page, 'Pushups', 120, 0);
    await expect(page.getByText('release to leave')).toHaveCount(0);
    await page.mouse.up();

    await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
  });

  test('the keyboard leaves with u, which needs no sideways room', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Keyboard Leave Workout');
    await group(page, 'Crunches', 'Pushups', 2);

    await page.getByRole('button', { name: /^Reorder or group Crunches$/u }).focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    await page.keyboard.press('u');
    await page.waitForTimeout(120);
    await page.keyboard.press('Space');

    await expect(page.getByTestId('circuit-block')).toHaveCount(0);
    await expect(page.getByText('4 exercises', { exact: true })).toBeVisible();
  });
});

test.describe('adding after a circuit', () => {
  test('the insert row below the block adds outside it', async ({ page }) => {
    // A circuit at the end of a workout used to be a dead end: every
    // insertion point inside the block joins the circuit.
    await signIn(page);
    await buildWorkout(page, 'After Circuit Workout');
    await group(page, 'Pullups', 'Crunches', 2);

    await page.getByRole('button', { name: /^Add an exercise after the circuit$/u }).click();
    await page.getByRole('textbox', { name: 'Search exercises to add' }).fill('barbell squat');
    await page.getByTestId('exercise-list').getByRole('button').first().click();
    await page.getByRole('button', { name: /^Add to /u }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Landed loose after the block, so the circuit is unchanged.
    await expect(page.getByText(/2 rounds of these 2, in order/u)).toBeVisible();
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
    await expect(page.getByText('5 exercises', { exact: true })).toBeVisible();

    const names = await page.getByTestId('slot-name').allTextContents();
    expect(names.at(-1)).toContain('Barbell Squat');
    // Not inside the block: the block lists only its own members.
    const inBlock = await page
      .getByTestId('circuit-block')
      .getByTestId('slot-name')
      .allTextContents();
    expect(inBlock).toHaveLength(2);
  });

  test('a rest can be placed after a circuit rather than inside it', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Rest After Circuit Workout');
    await group(page, 'Pullups', 'Crunches', 2);

    await page.getByRole('button', { name: /^Add a rest after the circuit$/u }).click();

    await expect(page.getByRole('textbox', { name: 'Rest length' })).toHaveCount(1);
    // Outside the block, so the round count is untouched.
    await expect(page.getByText(/2 rounds of these 2, in order/u)).toBeVisible();
    await expect(
      page.getByTestId('circuit-block').getByRole('textbox', { name: 'Rest length' }),
    ).toHaveCount(0);
  });
});

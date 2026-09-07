import { expect, test, type Page } from '@playwright/test';

/**
 * Building a circuit by dragging, leaving one by dragging out, adding an
 * exercise in place, and pacing a round unevenly.
 */

async function signIn(page: Page): Promise<void> {
  const email = `cg-${String(Date.now())}-${String(Math.floor(Math.random() * 100000))}@example.com`;
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Need an account?' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('lifttracker');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

async function addExercise(page: Page, query: string): Promise<void> {
  await page.getByRole('button', { name: 'Add exercise' }).first().click();
  await page.getByRole('textbox', { name: 'Search exercises to add' }).fill(query);
  await page.getByTestId('exercise-list').getByRole('button').first().click();
  const confirm = page.getByRole('button', { name: /^Add to /u });
  await confirm.click();
  await expect(confirm).toBeHidden();
  // Both picker modals must finish closing: while an overlay is still painted
  // it swallows the pointer, so any drag that follows goes nowhere.
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function buildWorkout(page: Page, name: string): Promise<void> {
  await page.goto('/plans');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('textbox', { name: 'Plan name' }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: '+ Add another day' }).click();

  await addExercise(page, 'bench jump');
  await addExercise(page, 'pushups');
  await addExercise(page, 'crunches');
  await addExercise(page, 'pullups');
  await expect(page.getByText('4 exercises')).toBeVisible();
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
  // Clear the 6px activation threshold first, then travel to the target.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
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
    await buildWorkout(page, 'Dwell Plan');

    await dragOnto(page, 'Crunches', 'Pushups');
    // The target says what the drop will do before you commit to it.
    await expect(page.getByText('release to group')).toBeVisible();

    await page.mouse.up();
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
    await expect(page.getByText(/3 rounds of these 2, in order/u)).toBeVisible();
  });

  test('a third exercise joins the same circuit, not a second one', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Three Plan');

    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
  });

  test('a quick drag still reorders instead of grouping', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Quick Drag Plan');

    const handle = page.getByRole('button', { name: /^Reorder or group Pullups$/u });
    const target = page.getByRole('button', { name: /^Reorder or group Crunches$/u });
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (from === null || to === null) return;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
    await page.mouse.up();

    // Released before the dwell settled, so it stayed a reorder.
    await expect(page.getByTestId('circuit-block')).toHaveCount(0);
    await expect(page.getByText('4 exercises')).toBeVisible();
  });

  test('two members of the same circuit offer no grouping', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Same Group Plan');
    await group(page, 'Crunches', 'Pushups', 2);

    // Already together, so however long it hovers it stays a reorder.
    await dragOnto(page, 'Crunches', 'Pushups');
    await page.waitForTimeout(1000);
    await expect(page.getByText('release to group')).toBeHidden();
    await page.mouse.up();
  });

  test('the keyboard can group too, with g', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Keyboard Plan');

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
    await buildWorkout(page, 'Hint Plan');
    await expect(page.getByText(/hold for a moment to make them a circuit/u)).toBeVisible();
  });
});

test.describe('drag out of a circuit', () => {
  test('dragging a member clear of the block removes it', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Drag Out Plan');
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
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 24, { steps: 12 });
    await page.mouse.up();

    // The circuit is down to two and still one block.
    await expect(page.getByText(/3 rounds of these 2, in order/u)).toBeVisible();
    await expect(page.getByTestId('circuit-block')).toHaveCount(1);
  });

  test('the keyboard can leave a circuit by arrowing out', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Keyboard Out Plan');
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
    await buildWorkout(page, 'Insert Plan');

    await page.getByRole('button', { name: /^Add an exercise after Bench Jump$/u }).click();
    await page.getByRole('textbox', { name: 'Search exercises to add' }).fill('barbell squat');
    await page.getByTestId('exercise-list').getByRole('button').first().click();
    await page.getByRole('button', { name: /^Add to /u }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Second in the list, not appended at the end.
    const names = await page.getByTestId('slot-name').allTextContents();
    expect(names[0]).toContain('Bench Jump');
    expect(names[1]).toContain('Barbell Squat');
    await expect(page.getByText('5 exercises')).toBeVisible();
  });

  test('the plus on a circuit member adds another member', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Insert Circuit Plan');
    await group(page, 'Crunches', 'Pushups', 2);

    await page.getByRole('button', { name: /^Add an exercise after Pushups$/u }).click();
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
    await buildWorkout(page, 'Rest Row Plan');
    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    // The 400-then-2k case: a short pause after the first, a long one later.
    await page.getByRole('button', { name: /^Add a rest after Pushups$/u }).click();
    await page.getByRole('textbox', { name: 'Rest length' }).first().fill('15');

    await page.getByRole('button', { name: /^Add a rest after Crunches$/u }).click();
    const lengths = page.getByRole('textbox', { name: 'Rest length' });
    await expect(lengths).toHaveCount(2);
    await lengths.nth(1).fill('90');

    // Rests sit inside the circuit but are not exercises: still 3 rounds of 3.
    await expect(page.getByText(/3 rounds of these 3, in order/u)).toBeVisible();
    await expect(page.getByText('4 exercises')).toBeVisible();

    await page.reload();
    const after = page.getByRole('textbox', { name: 'Rest length' });
    await expect(after).toHaveCount(2);
    await expect(after.nth(0)).toHaveValue(/15/);
    await expect(after.nth(1)).toHaveValue(/90/);
  });

  test('a rest row adds no sets and no volume', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Rest Volume Plan');
    await expect(page.getByText('12 sets', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /^Add a rest after Pushups$/u }).click();
    await page.getByRole('textbox', { name: 'Rest length' }).fill('60');

    // Still 12 sets, and the exercise count is unchanged.
    await expect(page.getByText('12 sets', { exact: true })).toBeVisible();
    await expect(page.getByText('4 exercises')).toBeVisible();
  });

  test('the round rest label explains itself on hover', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Round Rest Tooltip Plan');
    await group(page, 'Crunches', 'Pushups', 2);

    await page.getByText('round rest').hover();
    await expect(page.getByText(/Pause after a whole round/u)).toBeVisible();
  });
});

test.describe('deleting rows', () => {
  test('an exercise can be deleted from its row', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Delete Plan');

    await page.getByRole('button', { name: /^Delete Crunches$/u }).click();

    await expect(page.getByText('3 exercises')).toBeVisible();
    await expect(page.getByTestId('slot-name').filter({ hasText: 'Crunches' })).toHaveCount(0);
  });

  test('a rest row can be deleted too', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Delete Rest Plan');

    await page.getByRole('button', { name: /^Add a rest after Pushups$/u }).click();
    await expect(page.getByRole('textbox', { name: 'Rest length' })).toHaveCount(1);

    await page.getByRole('button', { name: /^Delete rest$/u }).click();
    await expect(page.getByRole('textbox', { name: 'Rest length' })).toHaveCount(0);
    await expect(page.getByText('4 exercises')).toBeVisible();
  });

  test('deleting down to one member dissolves the circuit', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Delete Member Plan');
    await group(page, 'Crunches', 'Pushups', 2);

    // A circuit of one is just an exercise, so the block goes with it.
    await page.getByRole('button', { name: /^Delete Crunches$/u }).click();
    await expect(page.getByTestId('circuit-block')).toHaveCount(0);
    await expect(page.getByText('3 exercises')).toBeVisible();
  });

  test('the round rest label is not truncated', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Label Plan');
    await group(page, 'Crunches', 'Pushups', 2);

    const label = page.getByText('round rest');
    await expect(label).toBeVisible();
    // Rendered width matches its content, so no ellipsis is applied.
    const overflowing = await label.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(overflowing).toBe(false);
  });
});

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
  await page.getByRole('button', { name: 'Add workout' }).click();

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

  test('the remove button is still there for the keyboard', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Remove Button Plan');
    await group(page, 'Crunches', 'Pushups', 2);

    // Dragging out is a pointer gesture, so the explicit control stays.
    await page.getByRole('button', { name: /^Remove Crunches from the circuit$/u }).click();
    await expect(page.getByTestId('circuit-block')).toHaveCount(0);
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

  test('each member takes its own rest, on top of the round rest', async ({ page }) => {
    await signIn(page);
    await buildWorkout(page, 'Uneven Rest Plan');
    await group(page, 'Crunches', 'Pushups', 2);
    await group(page, 'Pullups', 'Crunches', 3);

    // A short pause after the first, a long one after the last — the 400 vs
    // the 2k case.
    const first = page.getByRole('textbox', { name: /^Rest after Pushups$/u });
    const last = page.getByRole('textbox', { name: /^Rest after Pullups$/u });
    await first.fill('15');
    await last.fill('90');
    await expect(first).toHaveValue(/15/);
    await expect(last).toHaveValue(/90/);

    // The round rest is separate and still its own control.
    const roundRest = page.getByRole('textbox', { name: /^Rest between rounds/u });
    await roundRest.fill('120');
    await expect(roundRest).toHaveValue(/120/);

    await page.reload();
    await expect(page.getByRole('textbox', { name: /^Rest after Pushups$/u })).toHaveValue(/15/);
    await expect(page.getByRole('textbox', { name: /^Rest after Pullups$/u })).toHaveValue(/90/);
    await expect(page.getByRole('textbox', { name: /^Rest between rounds/u })).toHaveValue(/120/);
  });
});

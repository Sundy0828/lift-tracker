import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 acceptance: searching 800+ bundled exercises is instant, and a
 * custom exercise can be created and found in search alongside catalog results.
 */

async function signIn(page: Page): Promise<void> {
  const email = `ex-${String(Date.now())}-${String(Math.floor(Math.random() * 10000))}@example.com`;
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Need an account?' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('lifttracker');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

async function openExercises(page: Page): Promise<void> {
  await page.goto('/exercises');
  await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible();
  // Waits for the catalog fetch to resolve and the list to render.
  await expect(page.getByTestId('exercise-list')).toBeVisible();
  await expect(page.getByTestId('result-count')).toContainText(/8\d\d exercises/);
}

test.describe('exercise catalog', () => {
  test('the bundled catalog loads and reports 800+ exercises', async ({ page }) => {
    await signIn(page);
    await openExercises(page);
  });

  test('search narrows to a named lift', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    await page.getByRole('textbox', { name: 'Search exercises' }).fill('bench press');

    const list = page.getByTestId('exercise-list');
    await expect(list.getByText('Barbell Bench Press - Medium Grip')).toBeVisible();
    await expect(page.getByTestId('result-count')).not.toContainText(/8\d\d exercises/);
  });

  test('search is served locally, with no network request per keystroke', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    const requests: string[] = [];
    page.on('request', (request) => {
      requests.push(request.url());
    });

    const box = page.getByRole('textbox', { name: 'Search exercises' });
    for (const chunk of ['b', 'e', 'n', 'c', 'h']) {
      await box.press(chunk);
    }
    await expect(page.getByTestId('exercise-list').getByText(/Bench/).first()).toBeVisible();

    // The catalog is bundled, so typing must not hit the network at all.
    expect(requests.filter((url) => !url.startsWith('data:'))).toEqual([]);
  });

  test('an unmatched query says so instead of showing everything', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    await page.getByRole('textbox', { name: 'Search exercises' }).fill('zzzznotalift');
    await expect(page.getByText('No exercises match.', { exact: false })).toBeVisible();
  });

  test('the muscle filter narrows results', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    await page.getByRole('combobox', { name: 'Muscle' }).click();
    await page.getByRole('option', { name: 'Quads' }).click();
    await page.keyboard.press('Escape');

    const count = await page.getByTestId('result-count').textContent();
    const total = Number(/(\d+)/.exec(count ?? '')?.[1] ?? '0');
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(400);
  });

  test('tapping a catalog exercise loads its instructions on demand', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    await page.getByRole('textbox', { name: 'Search exercises' }).fill('barbell squat');
    await page.getByTestId('exercise-list').getByText('Barbell Squat', { exact: true }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('Instructions')).toBeVisible();
    await expect(drawer.getByRole('listitem').first()).toBeVisible();
  });

  test('a custom exercise is created and found in search alongside catalog results', async ({
    page,
  }) => {
    await signIn(page);
    await openExercises(page);

    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Zulu Cable Y-Raise');

    await page.getByRole('combobox', { name: 'Primary muscles' }).click();
    await page.getByRole('option', { name: 'Shoulders' }).click();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Add exercise' }).click();

    // Found by search, marked as custom.
    await page.getByRole('textbox', { name: 'Search exercises' }).fill('zulu');
    const list = page.getByTestId('exercise-list');
    await expect(list.getByText('Zulu Cable Y-Raise')).toBeVisible();
    await expect(list.getByText('Custom')).toBeVisible();

    // And it sorts ahead of catalog entries on a shared query.
    await page.getByRole('textbox', { name: 'Search exercises' }).fill('y-raise');
    await expect(list.getByRole('button').first()).toContainText('Zulu Cable Y-Raise');
  });

  test('a custom exercise rejects a blank name and a duplicate name', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('button', { name: 'Add exercise' }).click();
    await expect(page.getByText('Give it a name')).toBeVisible();
    await expect(page.getByText('Pick at least one primary muscle')).toBeVisible();

    // Create one, then try the same name again.
    await page.getByRole('textbox', { name: 'Name' }).fill('Dup Test Lift');
    await page.getByRole('combobox', { name: 'Primary muscles' }).click();
    await page.getByRole('option', { name: 'Biceps' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add exercise' }).click();

    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('dup test lift');
    await page.getByRole('combobox', { name: 'Primary muscles' }).click();
    await page.getByRole('option', { name: 'Biceps' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add exercise' }).click();

    await expect(page.getByText('You already have one with this name')).toBeVisible();
  });

  test('a custom exercise can be deleted', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Temp Delete Lift');
    await page.getByRole('combobox', { name: 'Primary muscles' }).click();
    await page.getByRole('option', { name: 'Calves' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add exercise' }).click();

    await page.getByRole('textbox', { name: 'Search exercises' }).fill('temp delete');
    const list = page.getByTestId('exercise-list');
    await list.getByText('Temp Delete Lift').click();

    // Scoped to the drawer: the row's own label contains the word "Delete".
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('No exercises match.', { exact: false })).toBeVisible();
  });
});

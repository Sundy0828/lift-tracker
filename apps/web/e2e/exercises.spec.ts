import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * Phase 1 acceptance: searching 800+ bundled exercises is instant, and a
 * custom exercise can be created and found in search alongside catalog results.
 */

async function signIn(page: Page): Promise<void> {
  await signUp(page, 'ex');
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

  test('search is served locally, with no data request per keystroke', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    const dataRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      // Row thumbnails are lazy images fetched as rows scroll into view, and
      // Firestore keeps a background connection it retries on its own clock.
      // Neither is part of answering the query; anything else would be.
      if (request.resourceType() === 'image') return;
      if (url.startsWith('data:')) return;
      if (/firestore|:8080|:9099/u.test(url)) return;
      dataRequests.push(url);
    });

    const box = page.getByRole('textbox', { name: 'Search exercises' });
    for (const chunk of ['b', 'e', 'n', 'c', 'h']) {
      await box.press(chunk);
    }
    await expect(page.getByTestId('exercise-list').getByText(/Bench/).first()).toBeVisible();

    // The catalog is bundled and already loaded, so typing fetches nothing
    // from this origin — in particular it never re-requests the catalog.
    expect(dataRequests).toEqual([]);
  });

  test('an unmatched query says so instead of showing everything', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    await page.getByRole('textbox', { name: 'Search exercises' }).fill('zzzznotalift');
    await expect(page.getByText('No exercises match.', { exact: false })).toBeVisible();
  });

  test('the body-part rail narrows results', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    const rail = page.getByRole('group', { name: 'Filter by body part' });
    await rail.getByRole('button', { name: 'Legs' }).click();
    await expect(rail.getByRole('button', { name: 'Legs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const count = await page.getByTestId('result-count').textContent();
    const total = Number(/(\d+)/.exec(count ?? '')?.[1] ?? '0');
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(400);

    // Tapping the active region clears it, as it does in the picker.
    await rail.getByRole('button', { name: 'Legs' }).click();
    await expect(page.getByTestId('result-count')).toContainText(/8\d\d exercises/);
  });

  test('the search box clears from its own button', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    const box = page.getByRole('textbox', { name: 'Search exercises' });
    await box.fill('bench press');
    await expect(page.getByTestId('result-count')).not.toContainText(/8\d\d exercises/);

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(box).toHaveValue('');
    await expect(page.getByTestId('result-count')).toContainText(/8\d\d exercises/);
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

  test('a custom exercise can use a finer muscle the source vocabulary lacks', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    // The case that motivated the second muscle tier: tibialis anterior is the
    // calves' antagonist, so tagging it `calves` would corrupt calf volume.
    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Zeta Tibialis Raise');
    await page.getByRole('combobox', { name: 'Primary muscles' }).click();
    await page.getByRole('option', { name: 'Tibialis', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add exercise' }).click();

    await page.getByRole('textbox', { name: 'Search exercises' }).fill('zeta tibialis');
    const list = page.getByTestId('exercise-list');
    const row = list.getByRole('button', { name: /Zeta Tibialis Raise/u });
    await expect(row).toBeVisible();
    // The muscle line reads Tibialis, not folded into Calves.
    await expect(row).toContainText('Tibialis ·');
    await expect(row).not.toContainText('Calves');
  });

  test('the catalog separates rear delts from the generic shoulders bucket', async ({ page }) => {
    await signIn(page);
    await openExercises(page);

    // The rail filters by region, so the refinement shows on the row itself:
    // a face pull is tagged rear delts, not the generic shoulders bucket.
    await page
      .getByRole('group', { name: 'Filter by body part' })
      .getByRole('button', {
        name: 'Shoulders',
      })
      .click();
    await page.getByRole('textbox', { name: 'Search exercises' }).fill('face pull');

    const row = page.getByTestId('exercise-list').getByRole('button').first();
    await expect(row).toContainText('Face Pull');
    await expect(row).toContainText('Rear delts');
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

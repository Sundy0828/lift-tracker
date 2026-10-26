import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * The add-an-exercise picker: getting to the exercise library at all, finding
 * a lift by body part, and inventing one the catalog does not have.
 *
 * The nav test is here rather than in a shell spec on purpose. Every other
 * suite reaches the library with `page.goto('/exercises')`, which passes
 * whether or not anything in the app links there — and for a while nothing
 * did, so the only route to "create a custom exercise" was typing the URL.
 */

const CUSTOM = 'Yankee Cable Y-Raise';

async function createWorkout(page: Page, name: string): Promise<void> {
  await page.goto('/workouts');
  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Workout name' }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue(name);
}

/** Opens the picker from the end of the slot list. */
async function openPicker(page: Page): Promise<void> {
  await page.getByTestId('insert-exercise').last().click();
  await expect(page.getByRole('textbox', { name: 'Search exercises to add' })).toBeVisible();
}

async function addExercise(page: Page, query: string): Promise<void> {
  await openPicker(page);
  await page.getByRole('textbox', { name: 'Search exercises to add' }).fill(query);
  await page.getByTestId('exercise-list').getByRole('button').first().click();
  const confirm = page.getByRole('button', { name: 'Add to workout' });
  await confirm.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('exercise picker', () => {
  test('the exercise library is reachable from settings', async ({ page }) => {
    await signUp(page, 'pick-a');

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click();
    await page.getByRole('link', { name: 'Exercise library' }).click();

    await expect(page).toHaveURL(/\/exercises$/u);
    await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible();
    // The whole point of the link: this button creates a custom exercise.
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
  });

  test('the body-part rail narrows results to that region', async ({ page }) => {
    await signUp(page, 'pick-b');
    await createWorkout(page, 'RAIL');
    await openPicker(page);

    const rail = page.getByRole('group', { name: 'Filter by body part' });
    const list = page.getByTestId('exercise-list');
    const bench = list.getByText('Barbell Bench Press - Medium Grip');

    // Searched rather than scrolled to. The list is virtualised, so a match
    // forty rows down an unfiltered catalog is not in the DOM to assert on.
    await page.getByRole('textbox', { name: 'Search exercises to add' }).fill('bench press');
    await expect(bench).toBeVisible();

    // Chest keeps it, which is what makes the next step mean something: the
    // rail filters by region rather than just hiding things.
    await rail.getByRole('button', { name: 'Chest' }).click();
    await expect(rail.getByRole('button', { name: 'Chest' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(bench).toBeVisible();

    // Legs covers quads, hamstrings, glutes, calves and the adductor groups,
    // so a bench press must drop out of it.
    await rail.getByRole('button', { name: 'Legs' }).click();
    await expect(bench).toBeHidden();

    // Tapping the active region clears it, with no separate "off" control.
    await rail.getByRole('button', { name: 'Legs' }).click();
    await expect(bench).toBeVisible();
  });

  test('a custom exercise is created from the picker and lands in the workout', async ({
    page,
  }) => {
    await signUp(page, 'pick-c');
    await createWorkout(page, 'INVENT');
    await openPicker(page);

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(CUSTOM);
    await page.getByRole('combobox', { name: 'Primary muscles' }).click();
    await page.getByRole('option', { name: 'Rear delts' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add exercise' }).click();

    // Straight into the workout, without a second trip through search.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('slot-name').filter({ hasText: CUSTOM })).toBeVisible();

    // And it really exists in their library, not just in this workout.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click();
    await page.getByRole('link', { name: 'Exercise library' }).click();
    await page.getByRole('textbox', { name: 'Search exercises' }).fill('yankee');
    await expect(page.getByTestId('exercise-list').getByText(CUSTOM)).toBeVisible();
  });

  test('the search box is empty on reopening, however the picker was left', async ({ page }) => {
    await signUp(page, 'pick-d');
    await createWorkout(page, 'CLEAR');

    // Left by adding something.
    await addExercise(page, 'barbell bench press');
    await openPicker(page);
    await expect(page.getByRole('textbox', { name: 'Search exercises to add' })).toHaveValue('');

    // Left by dismissing it.
    const box = page.getByRole('textbox', { name: 'Search exercises to add' });
    await box.fill('squat');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await openPicker(page);
    await expect(page.getByRole('textbox', { name: 'Search exercises to add' })).toHaveValue('');
  });

  test('a search that led to an exercise comes back as a recent chip', async ({ page }) => {
    await signUp(page, 'pick-e');
    await createWorkout(page, 'RECENT');

    await addExercise(page, 'barbell squat');
    await openPicker(page);

    // Offered only with the box empty, which is the only time it helps.
    const recents = page.getByRole('group', { name: 'Recent searches' });
    await expect(recents.getByRole('button', { name: 'barbell squat' })).toBeVisible();

    await recents.getByRole('button', { name: 'barbell squat' }).click();
    await expect(page.getByRole('textbox', { name: 'Search exercises to add' })).toHaveValue(
      'barbell squat',
    );
    // The chips make way for results as soon as there is a query.
    await expect(recents).toBeHidden();
  });
});

import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * The two screens added for looking further than a week ahead or back: the
 * History calendar, and the weekly plan that narrows Today.
 *
 * Both are driven through the UI rather than seeded, so what is asserted is
 * what a session actually produces — a day that goes from empty to shaded, and
 * a workout that goes from "one of the ones you own" to "what today is for".
 */

const WORKOUT = 'PLAN DAY';
const OTHER = 'OFF DAY';

test.describe.configure({ timeout: 120_000 });

async function createWorkout(page: Page, name: string): Promise<void> {
  await page.goto('/workouts');
  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Workout name' }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue(name);
}

async function addExercise(page: Page, query: string): Promise<void> {
  await page.getByTestId('insert-exercise').last().click();
  await page.getByRole('textbox', { name: 'Search exercises to add' }).fill(query);
  await page.getByTestId('exercise-list').getByRole('button').first().click();
  const confirm = page.getByRole('button', { name: 'Add to workout' });
  await confirm.click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** A published one-exercise workout, ready to start. */
async function publishedWorkout(page: Page, name: string): Promise<void> {
  await createWorkout(page, name);
  await addExercise(page, 'barbell bench press');
  await page.getByRole('button', { name: 'Publish v1' }).click();
  await expect(page.getByText('unpublished', { exact: true })).toBeHidden();
}

/** Logs one whole session of `name`, so History has something in it. */
async function logSession(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start', exact: true }).first().click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  for (const ordinal of ['1', '2', '3']) {
    await page.getByRole('spinbutton', { name: `Set ${ordinal} weight` }).fill('100');
    await page.getByRole('spinbutton', { name: `Set ${ordinal} reps` }).fill('8');
    await page.getByRole('button', { name: `Complete set ${ordinal}` }).click();
    await expect(page.getByRole('button', { name: `Set ${ordinal} done, undo` })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Finish session' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

/** Today as History labels a day, in the browser's own zone and locale. */
async function todayLabel(page: Page): Promise<string> {
  return page.evaluate(() =>
    new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date()),
  );
}

/** The weekday name of today, as the plan screen labels it. */
async function todayWeekday(page: Page): Promise<string> {
  return page.evaluate(() =>
    new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date()),
  );
}

test.describe('the history calendar', () => {
  test('a logged session shades today, and the totals and streak follow it', async ({ page }) => {
    await signUp(page, 'cal');
    await publishedWorkout(page, WORKOUT);
    await logSession(page, WORKOUT);

    await page.goto('/history');
    await page.getByRole('tab', { name: 'Calendar' }).click();

    // The month grid, with today carrying a shaded square rather than an empty
    // one. Stop 0 is "nothing here"; anything above it is a day you trained.
    const grid = page.getByTestId('month-calendar');
    await expect(grid).toBeVisible();

    // The label carries the day's own summary, so "1 session" identifies the
    // one square that was trained without the test knowing today's date.
    const today = grid.getByRole('button', { name: /1 session/u });
    await expect(today).toHaveCount(1);
    await expect(today).not.toHaveAttribute('data-stop', '0');

    // The period totals, and the streak that never counts an open week against
    // you — this week has a session in it, so it counts already.
    await expect(page.getByText('This week', { exact: true })).toBeVisible();
    await expect(page.getByText('All time', { exact: true })).toBeVisible();
    await expect(page.getByTestId('streak-card')).toContainText('1 week in a row');
    await expect(page.getByTestId('streak-card')).toContainText('This week counts already');

    // Deliberately no assertion on the time: Playwright finishes a session in
    // under a second, so the row correctly reads as a dash. Asserting on it
    // would be testing how fast the test runs.
    await expect(page.getByTestId('period-total').first()).toContainText('This week');

    // Opening the day lists what was done on it.
    await today.click();
    await expect(page.getByTestId('history-session')).toHaveCount(1);
    // Exact, because the session row below it repeats the same date.
    await expect(page.getByText(await todayLabel(page), { exact: true })).toBeVisible();
  });

  test('the year view draws the whole year, in colour', async ({ page }) => {
    await signUp(page, 'cal-year');
    await publishedWorkout(page, WORKOUT);
    await logSession(page, WORKOUT);

    await page.goto('/history');
    await page.getByRole('tab', { name: 'Calendar' }).click();
    await page.getByRole('radiogroup', { name: 'Calendar view' }).getByText('Year').click();

    const year = page.getByTestId('year-calendar');
    await expect(year).toBeVisible();
    await expect(page.getByTestId('month-calendar')).toHaveCount(0);

    // Two bands of week columns — the contribution-graph shape, stacked so a
    // whole year fits without scrolling sideways.
    await expect(year.locator('> div')).toHaveCount(2);

    // Whole weeks: every square in the grid, blanks included, is one of 7 rows
    // across some number of columns.
    const squares = await year.locator('span[data-stop], span[data-outside]').count();
    expect(squares % 7, 'the year should be whole week columns').toBe(0);
    expect(squares).toBeGreaterThanOrEqual(365);

    /*
      The trained day is actually painted.

      The shading runs off `--stop-*` custom properties, and those are declared
      on their own class precisely because they once lived on the month grid's
      layout class — which the year view does not use, so every square came out
      unpainted. A count of squares would not have caught that; a computed
      colour does.
    */
    const painted = year.locator('span[data-stop]:not([data-stop="0"])');
    await expect(painted).toHaveCount(1);

    const background = await painted
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(background, 'a trained day should be painted, not transparent').not.toBe(
      'rgba(0, 0, 0, 0)',
    );
    expect(background).not.toBe('transparent');
  });
});

test.describe('the weekly plan', () => {
  test('narrows Today to what the day is for, and opens back out on request', async ({ page }) => {
    await signUp(page, 'plan');
    await publishedWorkout(page, WORKOUT);
    await publishedWorkout(page, OTHER);

    // Both are offered before anything is scheduled.
    await page.goto('/');
    await expect(page.getByText(WORKOUT, { exact: true })).toBeVisible();
    await expect(page.getByText(OTHER, { exact: true })).toBeVisible();

    // Put one of them on today.
    await page.goto('/schedule');
    await expect(page.getByRole('heading', { name: 'Weekly plan' })).toBeVisible();
    const weekday = await todayWeekday(page);
    const row = page.locator('[data-testid^="schedule-day-"]').filter({ hasText: weekday }).first();
    await row.getByRole('button', { name: WORKOUT }).click();
    await expect(row.getByRole('button', { name: WORKOUT })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Today now leads with what the day is for, and the other workout is
    // collapsed out of the way rather than gone.
    await page.goto('/');
    await expect(page.getByText(`${weekday} — what you planned`)).toBeVisible();
    await expect(page.getByText(WORKOUT, { exact: true })).toBeVisible();
    await expect(page.getByText(OTHER, { exact: true })).toBeHidden();

    // The planned one is first on the screen, which is the whole point of the
    // section: no scrolling a list to find the thing you came to do.
    const options = page.getByTestId('workout-option');
    await expect(options.first()).toContainText(WORKOUT);

    await page.getByTestId('show-rest').click();
    await expect(page.getByText(OTHER, { exact: true })).toBeVisible();
  });

  test('a workout archived mid-week comes off the plan', async ({ page }) => {
    await signUp(page, 'plan-archive');
    await publishedWorkout(page, WORKOUT);

    await page.goto('/schedule');
    const weekday = await todayWeekday(page);
    const row = page.locator('[data-testid^="schedule-day-"]').filter({ hasText: weekday }).first();
    await row.getByRole('button', { name: WORKOUT }).click();

    await page.goto('/workouts');
    await page.getByRole('button', { name: `Archive ${WORKOUT}` }).click();
    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();

    // A day that looks scheduled but starts nothing is worse than an empty one.
    await page.goto('/schedule');
    await expect(page.getByRole('heading', { name: 'Weekly plan' })).toBeVisible();
    await expect(page.getByRole('button', { name: WORKOUT })).toHaveCount(0);
  });
});

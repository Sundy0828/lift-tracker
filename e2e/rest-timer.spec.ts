import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * The rest timer as it is used mid-workout: read the instructions without
 * leaving the session, watch a rest run over rather than vanish, and end it
 * by hand. Also covers the rest starting on a fully entered set, starting one
 * manually with the automatic one off, and the nudge for a load and a rep
 * count entered the wrong way round.
 *
 * The profile default rest is dropped to its minimum first, so the overrun is
 * reached in seconds rather than in a minute and a half.
 */

const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const PROJECT_ID = 'demo-lift-tracker';

const WORKOUT = 'REST DAY';
const EXERCISE = 'Barbell Bench Press';
const SHORT_REST = '15';

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
async function publishedWorkout(page: Page): Promise<void> {
  await createWorkout(page, WORKOUT);
  await addExercise(page, 'barbell bench press');
  await page.getByRole('button', { name: 'Publish v1' }).click();
  await expect(page.getByText('unpublished', { exact: true })).toBeHidden();
}

/** Shortens the profile default so a rest runs out inside a test. */
async function useShortRest(page: Page): Promise<void> {
  await page.goto('/settings');
  await page.getByLabel('Default rest seconds').fill(SHORT_REST);
  await expect(page.getByText(`${SHORT_REST}s`, { exact: true })).toBeVisible();
}

async function startSession(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: WORKOUT })).toBeVisible();
}

async function logSet(page: Page, ordinal: number, weight: string, reps: string): Promise<void> {
  const n = String(ordinal);
  await page.getByRole('spinbutton', { name: `Set ${n} weight` }).fill(weight);
  await page.getByRole('spinbutton', { name: `Set ${n} reps` }).fill(reps);
  await page.getByRole('button', { name: `Complete set ${n}` }).click();
  await expect(page.getByRole('button', { name: `Set ${n} done, undo` })).toBeVisible();
}

/** A REST view of Firestore's own value encoding, narrowed to what is read. */
type Value = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  arrayValue?: { values?: Value[] };
  mapValue?: { fields?: Record<string, Value> };
};

type Document = { fields?: Record<string, Value> };

/** The uid behind a test address, straight from the auth emulator. */
async function uidFor(page: Page, email: string): Promise<string> {
  const response = await page.request.post(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    { headers: { Authorization: 'Bearer owner' }, data: { email: [email] } },
  );
  expect(response.ok(), `the auth emulator should resolve ${email}`).toBe(true);

  const { users = [] } = (await response.json()) as { users?: { localId: string }[] };
  return users[0]?.localId ?? '';
}

/** Every recorded rest in the stored session, in the order the sets are in. */
async function storedRests(page: Page, uid: string): Promise<number[]> {
  const response = await page.request.get(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/sessions`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  const { documents = [] } = (await response.json()) as { documents?: Document[] };

  const rests: number[] = [];
  for (const session of documents) {
    for (const entry of session.fields?.['entries']?.arrayValue?.values ?? []) {
      for (const set of entry.mapValue?.fields?.['sets']?.arrayValue?.values ?? []) {
        const taken = set.mapValue?.fields?.['restTakenSeconds'];
        if (taken === undefined) continue;
        const value = taken.doubleValue ?? Number(taken.integerValue ?? NaN);
        if (!Number.isNaN(value)) rests.push(value);
      }
    }
  }
  return rests;
}

test.describe('the rest timer', () => {
  test('instructions open over the session, and the rest keeps running past zero', async ({
    page,
  }) => {
    const email = await signUp(page, 'rest');
    await publishedWorkout(page);
    await useShortRest(page);
    await startSession(page);

    await logSet(page, 1, '100', '8');

    const clock = page.getByTestId('rest-clock');
    await expect(clock).toBeVisible();
    const beforeDrawer = await clock.textContent();

    // --- the instructions, over the session rather than instead of it
    await page.getByRole('button', { name: `How to do ${EXERCISE}` }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(EXERCISE).first()).toBeVisible();

    // The session is still underneath, and the timer is still on top of the
    // drawer and still counting. Neither is what a navigation would do.
    await expect(page.getByRole('heading', { name: WORKOUT })).toBeVisible();
    await expect(clock).toBeVisible();
    await expect
      .poll(async () => clock.textContent(), {
        message: 'the rest should keep counting while the instructions are open',
      })
      .not.toBe(beforeDrawer);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: 'Complete set 2' })).toBeVisible();

    // --- past zero the bar stays, and counts the overrun up
    await expect
      .poll(async () => clock.textContent(), {
        timeout: 40_000,
        intervals: [1000],
        message: 'a rest that runs out should count up rather than disappear',
      })
      .toMatch(/^\+\d+:\d\d$/u);

    // Skipping past zero ends the rest and nothing else; the set stays done.
    await page.getByRole('button', { name: 'Done resting' }).click();
    await expect(clock).toBeHidden();
    await expect(page.getByRole('button', { name: 'Set 1 done, undo' })).toBeVisible();

    // The rest that just ended is recorded on the set that earned it. Read
    // from the emulator, because nothing on screen shows it.
    const uid = await uidFor(page, email);
    await expect(page.getByText(/· saving/u)).toHaveCount(0);
    await expect
      .poll(async () => storedRests(page, uid), {
        timeout: 20_000,
        message: 'the rest actually taken should reach the session document',
      })
      .toEqual([expect.any(Number)]);

    const [recorded] = await storedRests(page, uid);
    expect(recorded).toBeGreaterThanOrEqual(Number(SHORT_REST));
  });

  test('a set that holds every number ticks itself and starts its own rest', async ({ page }) => {
    await signUp(page, 'rest-entered');
    await publishedWorkout(page);
    await useShortRest(page);
    await startSession(page);

    // Weight, reps and the effort the row asks for. The tick box is untouched.
    await page.getByRole('spinbutton', { name: 'Set 1 weight' }).fill('100');
    await page.getByRole('spinbutton', { name: 'Set 1 reps' }).fill('8');
    await page.getByRole('button', { name: 'Set 1: 2 reps left' }).click();

    // The rest runs and the box is already ticked: one answer, not two.
    await expect(page.getByTestId('rest-clock')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set 1 done, undo' })).toBeVisible();
  });

  test('the timer can be turned off and started by hand, and a swapped set is queried', async ({
    page,
  }) => {
    await signUp(page, 'rest-manual');
    await publishedWorkout(page);
    await useShortRest(page);

    // Clicked and then waited on: the switch is driven by the stored profile,
    // so it flips a beat after the tap rather than with it.
    const autoStart = page.getByLabel('Start the rest timer on its own');
    await autoStart.click();
    await expect(autoStart).not.toBeChecked();

    await startSession(page);

    // A load of 8 for 135 reps: the two boxes the wrong way round.
    await logSet(page, 1, '8', '135');
    await expect(page.getByText('Double-check that set')).toBeVisible();

    // Nothing started on its own, so the bar offers the rest instead.
    await expect(page.getByTestId('rest-clock')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start rest' }).click();
    await expect(page.getByTestId('rest-clock')).toBeVisible();
  });
});

import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * Deleting a past session, and the records it set.
 *
 * `bestE1rm` is maxed into `exerciseStats/{id}` when the record is set, so a
 * delete cannot subtract from it. The record has to be recomputed from the
 * sessions that remain, and that is what this test proves: two sessions, the
 * heavier one deleted, the record expected to fall back to the lighter.
 *
 * The rebuild reads from the server, so each session is followed to the
 * emulator before the next step rather than raced against the flush.
 */

const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const PROJECT_ID = 'demo-lift-tracker';

const WORKOUT = 'DELETE DAY';

type Account = { localId: string; email: string };

/** The uid behind a test address, straight from the auth emulator. */
async function uidFor(page: Page, email: string): Promise<string> {
  const response = await page.request.post(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    { headers: { Authorization: 'Bearer owner' }, data: { email: [email] } },
  );
  expect(response.ok(), `the auth emulator should resolve ${email}`).toBe(true);

  const { users = [] } = (await response.json()) as { users?: Account[] };
  const uid = users[0]?.localId;
  expect(uid, `${email} should have an account`).toBeTruthy();
  return uid ?? '';
}

type SessionDocument = { fields?: Record<string, { stringValue?: string }> };

/** The session documents the emulator itself holds. */
async function serverSessions(page: Page, uid: string): Promise<SessionDocument[]> {
  const response = await page.request.get(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/sessions`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  if (!response.ok()) return [];
  const { documents = [] } = (await response.json()) as { documents?: SessionDocument[] };
  return documents;
}

async function serverCompletedCount(page: Page, uid: string): Promise<number> {
  const documents = await serverSessions(page, uid);
  return documents.filter((one) => one.fields?.['status']?.stringValue === 'completed').length;
}

/**
 * Waits for the completion batch to reach the emulator.
 *
 * Completion is not awaited by the app, and a reload while the mutation is
 * still queued can lose it — so every step that reloads waits here first.
 */
async function expectCompleted(page: Page, uid: string, count: number): Promise<void> {
  await expect
    .poll(async () => serverCompletedCount(page, uid), {
      timeout: 30_000,
      message: `${String(count)} completed session(s) should reach the emulator`,
    })
    .toBe(count);
}

async function createWorkout(page: Page, name: string): Promise<string> {
  await page.goto('/workouts');
  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Workout name' }).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue(name);

  const workoutId = /\/workouts\/([^/?]+)/u.exec(page.url())?.[1];
  expect(workoutId, 'the editor URL should carry the workout id').toBeTruthy();
  return workoutId ?? '';
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

/** Fills one set and ticks it done. */
async function logSet(page: Page, ordinal: number, weight: string, reps: string): Promise<void> {
  const n = String(ordinal);
  await page.getByRole('spinbutton', { name: `Set ${n} weight` }).fill(weight);
  await page.getByRole('spinbutton', { name: `Set ${n} reps` }).fill(reps);
  await page.getByRole('button', { name: `Complete set ${n}` }).click();
  await expect(page.getByRole('button', { name: `Set ${n} done, undo` })).toBeVisible();
}

/**
 * Logs a whole backdated session and returns its id.
 *
 * Backdated from the start link, so the two sessions land on different days
 * and which one is newest is decided by the data rather than by clock timing.
 */
async function logSession(
  page: Page,
  workoutId: string,
  performedOn: string,
  weight: string,
): Promise<string> {
  await page.goto(`/session/start/${workoutId}?on=${performedOn}`);
  await expect(page.getByRole('heading', { name: WORKOUT })).toBeVisible();

  // Matched on the id itself, so the start route cannot be mistaken for it.
  const sessionId = /\/session\/([0-9a-f-]{36})/u.exec(page.url())?.[1];
  expect(sessionId, 'the session URL should carry its id').toBeTruthy();

  await logSet(page, 1, weight, '5');
  await logSet(page, 2, weight, '5');
  await logSet(page, 3, weight, '5');

  await page.getByRole('button', { name: /^Finish session/u }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  return sessionId ?? '';
}

test.describe('history delete', () => {
  test('deleting the record session falls the record back to the next best', async ({ page }) => {
    const email = await signUp(page, 'histdel');
    const uid = await uidFor(page, email);

    const workoutId = await createWorkout(page, WORKOUT);
    await addExercise(page, 'barbell bench press');
    await page.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText('unpublished', { exact: true })).toBeHidden();

    await logSession(page, workoutId, '2025-01-06', '200');
    await expectCompleted(page, uid, 1);

    const recordSessionId = await logSession(page, workoutId, '2025-01-13', '225');
    await expectCompleted(page, uid, 2);

    // The heavier session owns the record.
    await page.goto('/history');
    await expect(page.getByTestId('history-session')).toHaveCount(2);
    await page.getByRole('tab', { name: 'Records' }).click();
    await expect(page.getByTestId('record-row')).toHaveCount(1);
    await expect(page.getByTestId('record-row')).toContainText('225 lb');

    await page.goto(`/history/session/${recordSessionId}`);
    await expect(page.getByTestId('delete-session')).toBeVisible();
    // Two taps, as everywhere destructive in this app.
    await page.getByRole('button', { name: 'Delete session' }).click();
    await page.getByRole('button', { name: 'Delete for good' }).click();

    await expect(page).toHaveURL(/\/history$/u);

    // The record is recomputed, not zeroed and not left claiming 225.
    await page.getByRole('tab', { name: 'Records' }).click();
    await expect(page.getByTestId('record-row')).toHaveCount(1);
    await expect(page.getByTestId('record-row')).toContainText('200 lb');
    await expect(page.getByTestId('record-row')).not.toContainText('225 lb');

    // And the session itself is gone, from the timeline and from the server.
    await page.getByRole('tab', { name: 'Sessions' }).click();
    await expect(page.getByTestId('history-session')).toHaveCount(1);
    await expectCompleted(page, uid, 1);
  });

  test('a session discarded with nothing logged never reaches history', async ({ page }) => {
    const email = await signUp(page, 'histempty');
    const uid = await uidFor(page, email);
    const workoutId = await createWorkout(page, WORKOUT);
    await addExercise(page, 'bench press');
    await page.getByRole('button', { name: /^Publish v1$/u }).click();

    // Started and quit without ticking a single set. The create is followed to
    // the emulator first, so the delete is not racing an unflushed write.
    await page.goto(`/session/start/${workoutId}`);
    await expect(page.getByRole('heading', { name: WORKOUT })).toBeVisible();
    await expect
      .poll(async () => (await serverSessions(page, uid)).length, {
        timeout: 30_000,
        message: 'the started session should reach the emulator',
      })
      .toBe(1);

    await page.getByRole('button', { name: 'Discard this session' }).click();
    await page.getByRole('button', { name: /^Tap again to discard/u }).click();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

    // Nothing to resume, and nothing filed under abandoned either.
    await expect(page.getByText('Session in progress')).toHaveCount(0);
    await page.goto('/history');
    await expect(page.getByTestId('history-session')).toHaveCount(0);

    // The document is deleted outright, not kept with an abandoned status.
    await expect
      .poll(async () => (await serverSessions(page, uid)).length, {
        timeout: 30_000,
        message: 'the discarded session should leave no document behind',
      })
      .toBe(0);
  });
});

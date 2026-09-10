import { expect, test, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * Phase 5 acceptance, and the test §2.8 asks for by name: go offline, log a
 * complete session, **reload while still offline**, confirm the data survived,
 * then reconnect and confirm it reaches the emulator.
 *
 * Two choices worth defending:
 *
 * - `context.setOffline` cuts the transport rather than mocking
 *   `navigator.onLine`. Firestore's websocket actually drops and its client
 *   enters the same offline mode a basement gym produces, so the app has no
 *   choice but to serve from cache.
 * - The final check reads the **Firestore emulator over REST**, not the app's
 *   own UI. A cleared sync chip is the app's claim that the queue drained;
 *   asking the server is the only way to test that the claim is true.
 *
 * The reload in the middle is the point of the whole test. Firestore's
 * in-memory state would carry a session across a client-side navigation on its
 * own; only a reload with no network proves the shell came from the service
 * worker's precache and the sets came back out of IndexedDB.
 */

const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const PROJECT_ID = 'demo-lift-tracker';

const WORKOUT = 'OFFLINE DAY';

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
  const confirm = page.getByRole('button', { name: /^Add to /u });
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
 * Loads the shell twice so the service worker is actually in control.
 *
 * The worker does not call `clients.claim()` — deliberately, so an update
 * cannot swap the app out from under a running workout — which means the page
 * that registers it is never controlled by it. Control arrives on the next
 * navigation, exactly as it would on a real second visit, and until then a
 * reload would go to the network and fail offline for a reason that has
 * nothing to do with this app.
 */
async function takeControl(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 20_000,
      message: 'the service worker should take control on the second load',
    })
    .toBe(true);
}

type Account = { localId: string; email: string };

/**
 * The uid behind a test address, straight from the auth emulator.
 *
 * Looked up **by email** rather than by downloading the account list and
 * filtering: `accounts:batchGet` pages, so with the rest of the suite creating
 * accounts alongside this one the address is not reliably on the first page.
 * `Bearer owner` is the emulator's stand-in for an admin credential.
 */
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

/**
 * A REST view of Firestore's own value encoding, narrowed to what is read
 * below. Reaching into it is verbose, but the alternative — trusting the
 * client that wrote the data to also report it arrived — tests nothing.
 */
type Value = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  arrayValue?: { values?: Value[] };
  mapValue?: { fields?: Record<string, Value> };
};

type Document = { name: string; fields?: Record<string, Value> };

async function serverSessions(page: Page, uid: string): Promise<Document[]> {
  const response = await page.request.get(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/sessions`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  expect(response.ok(), 'the firestore emulator should answer for the session collection').toBe(
    true,
  );
  const { documents = [] } = (await response.json()) as { documents?: Document[] };
  return documents;
}

/** Every weight in a session document, in the order they were logged. */
function loggedWeights(session: Document): number[] {
  const weights: number[] = [];
  for (const entry of session.fields?.['entries']?.arrayValue?.values ?? []) {
    for (const set of entry.mapValue?.fields?.['sets']?.arrayValue?.values ?? []) {
      const weight = set.mapValue?.fields?.['weight']?.mapValue?.fields?.['value'];
      if (weight === undefined) continue;
      const value = weight.doubleValue ?? Number(weight.integerValue ?? NaN);
      if (!Number.isNaN(value)) weights.push(value);
    }
  }
  return weights;
}

test.describe('offline', () => {
  test('a whole session is logged offline, survives a reload, and syncs on reconnect', async ({
    page,
    context,
  }) => {
    const email = await signUp(page, 'offline');
    await createWorkout(page, WORKOUT);
    await addExercise(page, 'barbell bench press');
    await page.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText('unpublished', { exact: true })).toBeHidden();

    // Everything the session needs has to be cached before the network goes:
    // the shell, the catalog, the workout, and the overlay documents.
    await takeControl(page);
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    const uid = await uidFor(page, email);

    // --- the network goes away
    await context.setOffline(true);
    await expect(page.getByText(/^Offline/u)).toBeVisible();

    await page.getByRole('link', { name: 'Start', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: WORKOUT })).toBeVisible();
    const sessionUrl = page.url();

    await logSet(page, 1, '100', '8');
    await logSet(page, 2, '100', '7');
    await logSet(page, 3, '95', '6');

    // All three logged, by the app's own count.
    await expect(page.getByText(/3 of 3 sets · 3 logged/u)).toBeVisible();

    // The strip says both halves at once: no network, and the sets are safe.
    await expect(page.getByText(/saved on this device/iu)).toBeVisible();

    // Nothing can have reached the server yet — the session document does not
    // exist there at all. Asserting this is what stops the test passing on a
    // transport that never actually went down.
    expect(await serverSessions(page, uid)).toHaveLength(0);

    // --- reload, still offline: the shell comes from the precache and the
    // sets come back out of IndexedDB.
    //
    // Waited on rather than raced: the set grid is a debounced draft, and until
    // the screen stops saying "saving" the write has not been handed to
    // Firestore at all. Reloading before that tests nothing about the cache.
    await expect(page.getByText(/· saving/u)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: WORKOUT })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Set 1 weight' })).toHaveValue('100');
    await expect(page.getByRole('spinbutton', { name: 'Set 2 reps' })).toHaveValue('7');
    await expect(page.getByRole('spinbutton', { name: 'Set 3 weight' })).toHaveValue('95');
    await expect(page.getByRole('button', { name: 'Set 3 done, undo' })).toBeVisible();

    // Finishing offline writes the session and its PRs to the cache. It must
    // not wait on the server, so it is the same interaction as online.
    await page.getByRole('button', { name: /^Finish session/u }).click();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

    // --- back online. The queue flushes on its own, with no user action.
    await context.setOffline(false);
    await expect(page.getByText(/^Offline/u)).toBeHidden();

    await expect
      .poll(async () => (await serverSessions(page, uid)).length, {
        timeout: 30_000,
        message: 'the queued session should reach the emulator once reconnected',
      })
      .toBe(1);

    const [synced] = await serverSessions(page, uid);
    expect(synced).toBeTruthy();
    expect(synced?.fields?.['status']?.stringValue).toBe('completed');
    expect(synced?.fields?.['workoutName']?.stringValue).toBe(WORKOUT);
    // The sets themselves, not just the document: an empty session that synced
    // would satisfy every assertion above it.
    expect(loggedWeights(synced ?? { name: '' })).toEqual([100, 100, 95]);

    // The session is still readable in the app at the same URL it was logged at.
    await page.goto(sessionUrl);
    await expect(page.getByRole('heading', { name: WORKOUT })).toBeVisible();
  });

  test('the precache holds the exercise catalog, not just the shell', async ({ page }) => {
    // §2.8: a cold offline start has to be able to search and add an exercise,
    // so the catalog files must be precached assets rather than lazy fetches
    // that happened to be warmed by an earlier visit.
    await takeControl(page);

    const precached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) urls.push(request.url);
      }
      return urls;
    });

    // Emitted as hashed assets, so match on the stem.
    expect(
      precached.some((url) => /exercises-[^/]*\.json/u.test(url)),
      `the searchable catalog should be precached, saw ${String(precached.length)} entries`,
    ).toBe(true);
    expect(
      precached.some((url) => /details-[^/]*\.json/u.test(url)),
      'the exercise details should be precached',
    ).toBe(true);
  });
});

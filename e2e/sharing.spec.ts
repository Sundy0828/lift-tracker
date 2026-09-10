import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signUp } from './signUp';

/**
 * Phase 6 acceptance (§2.9): a workout shared from one account imports into
 * another that lacks the custom exercises; merging into an existing workout
 * produces a new version with a correct change summary while keeping the
 * target's identity.
 *
 * Two **browser contexts**, not two sign-ins in one. The recipient must not
 * share a Firestore cache, an IndexedDB, or a service worker with the sender,
 * or "the importer did not have this custom exercise" is not actually being
 * tested — the definition would already be sitting in the cache. Separate
 * contexts is the only way to make the payload do the work.
 */

const CUSTOM = 'Zulu Copenhagen Plank';

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

/**
 * Creates a custom exercise, so the share has something to inline.
 *
 * Asserts it is searchable before returning. The exercise library is what the
 * next step depends on, and a helper that returns before its own postcondition
 * holds pushes the failure into an unrelated line.
 */
async function createCustomExercise(page: Page, name: string): Promise<void> {
  await page.goto('/exercises');
  await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible();
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('combobox', { name: 'Primary muscles' }).click();
  await page.getByRole('option', { name: 'Abs' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Search exercises' }).fill('zulu');
  await expect(page.getByTestId('exercise-list').getByText(name)).toBeVisible();
}

/** Publishes the editor's pending changes as the next version. */
async function publish(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Publish v/u }).click();
  await expect(page.getByText('Unpublished changes')).toBeHidden();
}

/** Shares the published version and returns the link. */
async function shareLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: /^Create a link to v/u }).click();

  // The row renders the URL as text, which is also what a person would copy.
  const url = page.getByText(/\/share\/[0-9a-f-]{36}$/u).first();
  await expect(url).toBeVisible();
  const link = (await url.textContent()) ?? '';
  expect(link, 'the share row should show a link').toContain('/share/');
  return link.trim();
}

/** A second account, in its own context. Returns its page. */
async function otherAccount(context: BrowserContext, prefix: string): Promise<Page> {
  const fresh = await context.browser()?.newContext();
  expect(fresh, 'a second browser context should be available').toBeTruthy();
  if (fresh === undefined) throw new Error('no browser available');
  const page = await fresh.newPage();
  await signUp(page, prefix);
  return page;
}

test.describe('sharing', () => {
  test('a shared workout imports into an account that lacks its custom exercise', async ({
    page,
    context,
  }) => {
    // --- sender: a workout mixing a catalog lift with one they invented
    await signUp(page, 'share-a');
    await createCustomExercise(page, CUSTOM);
    await createWorkout(page, 'SHARED PUSH');
    await addExercise(page, 'barbell bench press');
    await addExercise(page, 'zulu copenhagen');
    await publish(page);
    const link = await shareLink(page);

    // --- recipient: a different account, its own cache, no such exercise
    const other = await otherAccount(context, 'share-b');
    try {
      await other.goto('/exercises');
      await other.getByRole('textbox', { name: 'Search exercises' }).fill('zulu');
      await expect(other.getByText(/no exercises match/iu)).toBeVisible();

      await other.goto(link);
      await expect(other.getByRole('heading', { name: 'SHARED PUSH' })).toBeVisible();
      // The inlined definition is what makes this render at all: the recipient
      // cannot resolve the sender's custom id.
      await expect(other.getByText(CUSTOM, { exact: true })).toBeVisible();
      await expect(other.getByText('1 custom exercise')).toBeVisible();

      // Importing writes to their exercise library, and says so first.
      await expect(other.getByText(new RegExp(`adds one exercise.*${CUSTOM}`, 'iu'))).toBeVisible();
      await other.getByRole('button', { name: 'Import as a new workout' }).click();

      // Lands in their own editor, published, with both lifts.
      await expect(other.getByRole('textbox', { name: 'Workout name' })).toHaveValue('SHARED PUSH');
      await expect(other.getByText('v1', { exact: true }).first()).toBeVisible();
      await expect(other.getByTestId('slot-name').filter({ hasText: CUSTOM })).toBeVisible();

      // And the custom exercise now really exists under their account.
      await other.goto('/exercises');
      await other.getByRole('textbox', { name: 'Search exercises' }).fill('zulu');
      await expect(other.getByTestId('exercise-list').getByRole('button').first()).toContainText(
        CUSTOM,
      );
    } finally {
      await other.context().close();
    }
  });

  test('importing twice reuses the exercise rather than duplicating it', async ({
    page,
    context,
  }) => {
    await signUp(page, 'share-c');
    await createCustomExercise(page, CUSTOM);
    await createWorkout(page, 'DEDUPE');
    await addExercise(page, 'zulu copenhagen');
    await publish(page);
    const link = await shareLink(page);

    const other = await otherAccount(context, 'share-d');
    try {
      await other.goto(link);
      await other.getByRole('button', { name: 'Import as a new workout' }).click();
      await expect(other.getByRole('textbox', { name: 'Workout name' })).toHaveValue('DEDUPE');

      // Second time: they now own it, so it is matched by name, not remade.
      await other.goto(link);
      await expect(other.getByText(/matched to exercises you already have/iu)).toBeVisible();
      await other.getByRole('button', { name: 'Import as a new workout' }).click();
      await expect(other.getByRole('textbox', { name: 'Workout name' })).toHaveValue('DEDUPE');

      await other.goto('/exercises');
      await other.getByRole('textbox', { name: 'Search exercises' }).fill('zulu');
      // One entry, not two.
      await expect(other.getByTestId('exercise-list').getByRole('button')).toHaveCount(1);
    } finally {
      await other.context().close();
    }
  });

  test('merging publishes a new version of the target and keeps its identity', async ({
    page,
    context,
  }) => {
    // --- sender: bench at 4 sets, plus a lift the recipient will not have
    await signUp(page, 'share-e');
    await createWorkout(page, 'THEIR PUSH');
    await addExercise(page, 'barbell bench press');
    await addExercise(page, 'barbell squat');
    await publish(page);
    const link = await shareLink(page);

    // --- recipient: their own PUSH, already published as v1
    const other = await otherAccount(context, 'share-f');
    try {
      await createWorkout(other, 'MY PUSH');
      await addExercise(other, 'barbell bench press');
      await publish(other);
      const targetUrl = other.url();

      await other.goto(link);
      await other.getByRole('combobox', { name: 'How' }).click();
      await other.getByRole('option', { name: 'Merge into one of mine' }).click();
      await other.getByRole('combobox', { name: 'Merge into' }).click();
      await other.getByRole('option', { name: 'MY PUSH' }).click();

      // The preview must read as a change list, not as "removed everything,
      // added everything" — which is what an unaligned diff would say.
      await expect(other.getByText(/added Barbell Squat/iu)).toBeVisible();
      await other.getByRole('button', { name: /^Merge \d+ change/u }).click();

      // --- the target, still the target: same URL, now at v2
      await expect(other).toHaveURL(targetUrl);
      await expect(other.getByRole('textbox', { name: 'Workout name' })).toHaveValue('MY PUSH');
      await expect(other.getByText('v2', { exact: true }).first()).toBeVisible();
      await expect(
        other.getByTestId('slot-name').filter({ hasText: 'Barbell Squat' }),
      ).toBeVisible();

      // The version history carries a summary of what the merge actually did.
      await other.getByRole('button', { name: 'Version history' }).click();
      const history = other.getByLabel('Version history');
      await expect(history.getByText(/^v2$/u)).toBeVisible();
      await expect(history.getByText(/Added Barbell Squat/iu)).toBeVisible();
      // v1 is untouched: a merge never rewrites an existing snapshot (§2.5).
      await expect(history.getByText(/^v1$/u)).toBeVisible();
    } finally {
      await other.context().close();
    }
  });

  test('a revoked link says so rather than going missing', async ({ page, context }) => {
    await signUp(page, 'share-g');
    await createWorkout(page, 'REVOKE ME');
    await addExercise(page, 'barbell bench press');
    await publish(page);
    const link = await shareLink(page);

    const other = await otherAccount(context, 'share-h');
    try {
      await other.goto(link);
      await expect(other.getByRole('heading', { name: 'REVOKE ME' })).toBeVisible();

      await page.getByRole('button', { name: 'Turn off' }).click();
      await expect(page.getByText(/has been turned off/u)).toBeVisible();

      // The rules refuse a revoked share to anyone but its owner, so the
      // recipient cannot be told which of the two it was — and should not be.
      await other.goto(link);
      await expect(other.getByText(/this link does not work/iu)).toBeVisible();
      await expect(other.getByRole('heading', { name: 'REVOKE ME' })).toBeHidden();

      // The owner, who can still read it, gets the specific reason.
      await page.goto(link);
      await expect(page.getByText(/this link is turned off/iu)).toBeVisible();
    } finally {
      await other.context().close();
    }
  });

  test('a share opens signed out, and offers a way in', async ({ page, context }) => {
    await signUp(page, 'share-i');
    await createWorkout(page, 'PUBLIC PUSH');
    await addExercise(page, 'barbell bench press');
    await publish(page);
    const link = await shareLink(page);

    // A fresh context with no account at all — the person you sent it to.
    const fresh = await context.browser()?.newContext();
    expect(fresh, 'a second browser context should be available').toBeTruthy();
    if (fresh === undefined) return;
    try {
      const stranger = await fresh.newPage();
      await stranger.goto(link);

      // §2.9: public-read, no auth needed to view.
      await expect(stranger.getByRole('heading', { name: 'PUBLIC PUSH' })).toBeVisible();
      await expect(stranger.getByText('Barbell Bench Press')).toBeVisible();
      // No import without an account, but a route to one.
      await expect(stranger.getByRole('button', { name: 'Import as a new workout' })).toBeHidden();
      await stranger.getByRole('link', { name: 'Sign in to import' }).click();
      await expect(stranger).toHaveURL(/\/sign-in$/u);
    } finally {
      await fresh.close();
    }
  });
});

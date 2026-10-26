import type { Session, SessionEntry, SetRef } from './sessions';
import {
  entryFor,
  isLastOfRound,
  lastCompletedSet,
  nextUnfinishedSet,
  restAfter,
} from './sessions';

/**
 * The rest timer's rules that do not depend on a screen: how long a set's rest
 * is, what comes after it, how often the end of it is announced, and whether a
 * rest is still owed after the app was closed.
 *
 * Both apps' session screens call these, so the phone and the browser agree on
 * every number.
 */

/** Seconds between repeats of the end-of-rest notification. */
export const REST_ALERT_REPEAT_SECONDS = 25;

/**
 * How many times the end of a rest is announced, the first included.
 *
 * One buzz through a jacket pocket, with music playing, is missed often enough
 * to be worth saying twice, and a notification that keeps going is worse than
 * one that is missed, so it stops after three.
 */
export const REST_ALERT_LIMIT = 3;

/**
 * When each end-of-rest notification fires, in seconds after the deadline.
 *
 * A list rather than a loop, so a platform that schedules every notification
 * up front (a phone, where the app is not running to fire the next one) and a
 * platform that chains them (the web's service worker) follow the same policy.
 */
export function restAlertOffsets(): number[] {
  return Array.from({ length: REST_ALERT_LIMIT }, (_unused, index) => {
    return index * REST_ALERT_REPEAT_SECONDS;
  });
}

/** The rest a set has earned, and the exercise to walk to after it. */
export type RestPlan = {
  seconds: number;
  /** Null when nothing is left to do: the set ended the session. */
  nextExerciseName: string | null;
};

/**
 * How long to rest after a given entry's set, and what comes next.
 *
 * `entries` is passed separately from the session because the screen holds a
 * working copy that runs ahead of the stored document.
 */
export function restPlan(
  session: Session,
  entries: readonly SessionEntry[],
  key: string,
  defaultRestSeconds: number,
): RestPlan | null {
  const entry = entryFor(entries, key);
  if (entry === null) return null;

  const seconds = restAfter(
    { ...session, entries: [...entries] },
    entry,
    defaultRestSeconds,
    isLastOfRound(entries, key),
  );
  const upNext = nextUnfinishedSet(entries, key);
  const upNextEntry = upNext === null ? null : entryFor(entries, upNext.entryKey);
  return { seconds, nextExerciseName: upNextEntry?.exerciseName ?? null };
}

/** A rest still running, worked out from the stored sets alone. */
export type OwedRest = RestPlan & {
  owner: SetRef;
  /** ISO instant the set was finished, which is when the rest began. */
  startedAt: string;
  /** Epoch ms the rest ends. `seconds` is the whole rest, start to here. */
  endsAt: number;
};

/**
 * Names the rest a set earned, for whatever outlives the app and has to say
 * which rest it belongs to (the phone's scheduled alerts carry it).
 */
export function restTag(owner: SetRef): string {
  return `${owner.entryKey}#${String(owner.setIndex)}`;
}

/** The set whose rest may still be running: the last one finished, rest not yet ended. */
export function restOwner(entries: readonly SessionEntry[]): SetRef | null {
  const last = lastCompletedSet(entries);
  if (last === null) return null;
  const set = entryFor(entries, last.entryKey)?.sets.find(
    (candidate) => candidate.setIndex === last.setIndex,
  );
  if (set?.restTakenSeconds !== null) return null;
  return { entryKey: last.entryKey, setIndex: last.setIndex };
}

/**
 * The rest still running for the most recently finished set, if there is one.
 *
 * When a phone kills the app mid-rest, this rebuilds the countdown on
 * relaunch. The rest began when the set was finished (`completedAt`). It ends
 * at `knownEndsAt` when the deadline survived the app (that includes any
 * −15s/+15s), and otherwise after the planned `restPlan` seconds.
 *
 * A set with `restTakenSeconds` already recorded has had its rest ended, by
 * the next set or by a skip, so it owes nothing. Neither does a rest that has
 * elapsed, or a planned rest of zero (a circuit flowing into its next
 * exercise).
 */
export function restToResume(
  session: Session,
  entries: readonly SessionEntry[],
  defaultRestSeconds: number,
  now: number = Date.now(),
  knownEndsAt: number | null = null,
): OwedRest | null {
  const owner = restOwner(entries);
  const last = lastCompletedSet(entries);
  if (owner === null || last === null) return null;

  const plan = restPlan(session, entries, owner.entryKey, defaultRestSeconds);
  if (plan === null) return null;

  const startedAt = Date.parse(last.completedAt);
  if (Number.isNaN(startedAt)) return null;

  // A surviving deadline is trusted only if it falls after the set finished;
  // anything else belongs to some other rest.
  const known = knownEndsAt !== null && knownEndsAt > startedAt ? knownEndsAt : null;
  if (known === null && plan.seconds <= 0) return null;

  const endsAt = known ?? startedAt + plan.seconds * 1000;
  if (endsAt <= now) return null;

  return {
    ...plan,
    seconds: Math.round((endsAt - startedAt) / 1000),
    endsAt,
    owner,
    startedAt: last.completedAt,
  };
}

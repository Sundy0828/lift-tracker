import { Timestamp, type DocumentData } from 'firebase/firestore';
import { DEFAULT_PROFILE, type UserProfile } from '@/domain/types';
import { isUnit } from '@/domain/units';

/**
 * Narrows an untrusted Firestore document into a `UserProfile`, falling back
 * field-by-field so a partially-written or older document still renders.
 */
export function parseProfile(data: DocumentData | undefined): UserProfile {
  if (data === undefined) return DEFAULT_PROFILE;

  const displayUnit: unknown = data['displayUnit'];
  const defaultRestSeconds: unknown = data['defaultRestSeconds'];
  const createdAt: unknown = data['createdAt'];

  return {
    displayUnit: isUnit(displayUnit) ? displayUnit : DEFAULT_PROFILE.displayUnit,
    defaultRestSeconds:
      typeof defaultRestSeconds === 'number' && Number.isFinite(defaultRestSeconds)
        ? defaultRestSeconds
        : DEFAULT_PROFILE.defaultRestSeconds,
    createdAt: createdAt instanceof Timestamp ? createdAt.toDate().toISOString() : null,
  };
}

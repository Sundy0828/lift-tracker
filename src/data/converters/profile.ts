import { Timestamp, type DocumentData } from 'firebase/firestore';
import { DEFAULT_PROFILE, isHandedness, type UserProfile } from '@/domain/types';
import { isUnit } from '@/domain/units';

/**
 * Narrows an untrusted Firestore document into a `UserProfile`, falling back
 * field-by-field so a partially-written or older document still renders.
 */
export function parseProfile(data: DocumentData | undefined): UserProfile {
  if (data === undefined) return DEFAULT_PROFILE;

  const displayUnit: unknown = data['displayUnit'];
  const defaultRestSeconds: unknown = data['defaultRestSeconds'];
  const autoStartRest: unknown = data['autoStartRest'];
  const restChime: unknown = data['restChime'];
  const scheduleFilter: unknown = data['scheduleFilter'];
  const handedness: unknown = data['handedness'];
  const friendCode: unknown = data['friendCode'];
  const displayName: unknown = data['displayName'];
  const dayIndexVersion: unknown = data['dayIndexVersion'];
  const tourVersion: unknown = data['tourVersion'];
  const createdAt: unknown = data['createdAt'];

  return {
    displayUnit: isUnit(displayUnit) ? displayUnit : DEFAULT_PROFILE.displayUnit,
    defaultRestSeconds:
      typeof defaultRestSeconds === 'number' && Number.isFinite(defaultRestSeconds)
        ? defaultRestSeconds
        : DEFAULT_PROFILE.defaultRestSeconds,
    autoStartRest:
      typeof autoStartRest === 'boolean' ? autoStartRest : DEFAULT_PROFILE.autoStartRest,
    restChime: typeof restChime === 'boolean' ? restChime : DEFAULT_PROFILE.restChime,
    scheduleFilter:
      typeof scheduleFilter === 'boolean' ? scheduleFilter : DEFAULT_PROFILE.scheduleFilter,
    handedness: isHandedness(handedness) ? handedness : DEFAULT_PROFILE.handedness,
    friendCode: typeof friendCode === 'string' && friendCode !== '' ? friendCode : null,
    displayName: typeof displayName === 'string' ? displayName : DEFAULT_PROFILE.displayName,
    dayIndexVersion:
      typeof dayIndexVersion === 'number' && Number.isFinite(dayIndexVersion)
        ? Math.max(0, Math.round(dayIndexVersion))
        : DEFAULT_PROFILE.dayIndexVersion,
    tourVersion:
      typeof tourVersion === 'number' && Number.isFinite(tourVersion)
        ? Math.max(0, Math.round(tourVersion))
        : DEFAULT_PROFILE.tourVersion,
    createdAt: createdAt instanceof Timestamp ? createdAt.toDate().toISOString() : null,
  };
}

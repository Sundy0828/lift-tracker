import { describe, expect, it } from 'vitest';
import { isAccountDeleted, markAccountDeleted } from './deletedAccounts';

describe('deletedAccounts', () => {
  it('reports an untouched account as live', () => {
    expect(isAccountDeleted('never-seen')).toBe(false);
  });

  it('remembers an account once it is marked', () => {
    markAccountDeleted('uid-a');
    expect(isAccountDeleted('uid-a')).toBe(true);
  });

  it('does not tar other accounts with it', () => {
    // The guard sits inside `initializeProfile`, which every signed-in user
    // reaches. Marking one account must not stop anybody else's profile from
    // being seeded.
    markAccountDeleted('uid-b');
    expect(isAccountDeleted('uid-c')).toBe(false);
  });

  it('is idempotent, since a retried delete marks again', () => {
    markAccountDeleted('uid-d');
    markAccountDeleted('uid-d');
    expect(isAccountDeleted('uid-d')).toBe(true);
  });
});

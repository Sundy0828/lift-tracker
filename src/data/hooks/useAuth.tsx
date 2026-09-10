import {
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, googleProvider } from '../firebase';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

export type AuthValue = {
  user: User | null;
  status: AuthStatus;
  /**
   * Whether the address behind this sign-in has been confirmed.
   *
   * Google accounts arrive verified, so in practice this is only ever false
   * for a password account that has not clicked its link yet. Read from state
   * rather than straight off `user`, because `reload()` mutates the existing
   * `User` object in place and React would never see the change.
   */
  isEmailVerified: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  /** Sends (or resends) the confirmation link to the signed-in address. */
  sendVerification: () => Promise<void>;
  /** Re-reads the account from Firebase. True once the address is confirmed. */
  refreshVerification: () => Promise<boolean>;
  /**
   * The providers this account can sign in with, as state.
   *
   * Linking mutates `user.providerData` in place, so a component reading it
   * off `user` would never re-render. This is the copy React can see.
   */
  providerIds: readonly string[];
  /** Re-reads the account after its shape changes — linking, unlinking. */
  refreshUser: () => Promise<void>;
  /** Sends a reset link. Never reveals whether the address has an account. */
  sendPasswordReset: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [providerIds, setProviderIds] = useState<readonly string[]>([]);

  useEffect(() => {
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setStatus(next === null ? 'signed-out' : 'signed-in');
      setIsEmailVerified(next?.emailVerified ?? false);
      setProviderIds(next?.providerData.map((entry) => entry.providerId) ?? []);
      // No profile write happens here on purpose. This provider renders on
      // first paint, so touching Firestore would pull its SDK (~149 kB
      // gzipped — larger than the whole initial-JS budget in §3) into the
      // entry chunk. `useProfile` seeds the document instead, from the
      // snapshot it already subscribes to.
    });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      status,
      isEmailVerified,
      signInWithGoogle: async () => {
        await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
      },
      signInWithEmail: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      registerWithEmail: async (email, password) => {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        // Sent here rather than from the gate screen, so the link is already
        // in flight by the time the new account lands on it.
        await sendEmailVerification(credential.user);
      },
      signOutUser: async () => {
        await signOut(auth);
      },
      sendVerification: async () => {
        if (auth.currentUser === null) throw new Error('Not signed in.');
        await sendEmailVerification(auth.currentUser);
      },
      refreshVerification: async () => {
        const current = auth.currentUser;
        if (current === null) return false;
        // Clicking the link verifies the address on Firebase's servers, not in
        // this tab — nothing tells this session about it. Re-reading the
        // account is the only way to find out.
        await current.reload();
        const verified = current.emailVerified;
        setIsEmailVerified(verified);
        return verified;
      },
      providerIds,
      refreshUser: async () => {
        const current = auth.currentUser;
        if (current === null) return;
        await current.reload();
        setIsEmailVerified(current.emailVerified);
        setProviderIds(current.providerData.map((entry) => entry.providerId));
      },
      sendPasswordReset: async (email) => {
        try {
          await sendPasswordResetEmail(auth, email);
        } catch (cause) {
          // `auth/user-not-found` would turn this form into an oracle for
          // which addresses have accounts. Swallowed so every address gets the
          // same answer; anything else is a real failure worth reporting.
          const code =
            typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;
          if (code !== 'auth/user-not-found' && code !== 'auth/invalid-email') throw cause;
        }
      },
    }),
    [user, status, isEmailVerified, providerIds],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}

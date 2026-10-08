import { useEffect, useState } from 'react';
import { onIdTokenChanged, getIdTokenResult, type User } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase';
import { resolveRole, type Role } from '../lib/access';

export interface AccessState {
  /** False until Firebase has told us who (if anyone) is signed in. */
  ready: boolean;
  user: User | null;
  role: Role;
  /** Re-reads the ID token, so a role just granted with setClaims takes effect without signing out. */
  refresh: () => Promise<void>;
}

/**
 * The signed-in user and their role, read from the ID token's claims.
 *
 * `onIdTokenChanged`, not `onAuthStateChanged`: a custom claim arrives with a refreshed token,
 * which changes the token but not the auth state - listening to the auth state alone would keep
 * showing the old role until the next sign-in.
 */
export function useAccess(): AccessState {
  const [state, setState] = useState<Omit<AccessState, 'refresh'>>({ ready: !isFirebaseConfigured, user: null, role: 'none' });

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setState({ ready: true, user: null, role: 'none' });
        return;
      }
      try {
        const token = await getIdTokenResult(user);
        setState({
          ready: true,
          user,
          role: resolveRole({ email: user.email, emailVerified: user.emailVerified, claims: token.claims }),
        });
      } catch (error) {
        console.error('Could not read the ID token; treating the session as having no access:', error);
        setState({ ready: true, user, role: 'none' });
      }
    });
  }, []);

  const refresh = async () => {
    if (auth?.currentUser) await auth.currentUser.getIdToken(true);
  };

  return { ...state, refresh };
}

import React, { useState } from 'react';
import { LogIn, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import type { User } from 'firebase/auth';
import { signInWithGoogle, signOutAndClearDevice } from '../firebase';
import { ROLE_LABEL, STAFF_EMAIL_DOMAIN, type Role } from '../lib/access';
import { Banner, btn } from './ui';

/**
 * Who you are, and what to do when the answer is "nobody yet" or "nobody with access".
 *
 * The app used to render every screen to a signed-out visitor, each one failing with a permission
 * error, and the sign-in button was invisible (an unregistered Tailwind colour). Now a signed-out
 * device shows only this, and an account without a role is told exactly that.
 */

function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Sign-in was cancelled.';
  if (code === 'auth/popup-blocked') return 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.';
  if (code === 'auth/network-request-failed') return 'No connection. Check the Wi-Fi and try again.';
  return (error as Error)?.message || 'Sign-in failed.';
}

export const SignInScreen: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md bg-white rounded-2xl border border-border shadow-luxury p-8 space-y-5 text-center">
        <div>
          <p className="label-mono">Novotel & ibis Chiang Mai Nimman</p>
          <h1 className="text-3xl font-bold font-display text-foreground mt-1">Breakfast door</h1>
        </div>
        <p className="text-base text-muted-foreground">Sign in with your Accor Google account.</p>
        <button className={`${btn.primary} w-full`} onClick={signIn} disabled={busy}>
          <LogIn size={18} /> {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {error && (
          <Banner tone="critical" role="alert">
            {error}
          </Banner>
        )}
      </div>
    </main>
  );
};

export const NoAccessScreen: React.FC<{ user: User; onRetry: () => Promise<void> }> = ({ user, onRetry }) => {
  const [busy, setBusy] = useState(false);
  const verified = user.emailVerified;
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-border shadow-luxury p-8 space-y-4">
        <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
          <ShieldAlert size={24} /> No access yet
        </h1>
        <p className="text-base">
          You are signed in as <strong>{user.email}</strong>, but this account has no role in the app.
        </p>
        <p className="text-sm text-muted-foreground">
          {verified
            ? `Verified @${STAFF_EMAIL_DOMAIN} accounts get door access automatically. Any other account needs a role from an administrator (scripts/setClaims.ts). Once it is granted, press Check again.`
            : 'This address has not been verified by Google, so it cannot be given access by its domain.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={btn.secondary}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRetry();
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={16} /> Check again
          </button>
          <button className={btn.secondary} onClick={() => void signOutAndClearDevice()}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </main>
  );
};

export const UserBox: React.FC<{ user: User; role: Role }> = ({ user, role }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center font-bold">
          {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{user.displayName || user.email}</p>
          <p className="text-xs text-muted-foreground truncate">{ROLE_LABEL[role]}</p>
        </div>
      </div>
      <button
        className={`${btn.quiet} w-full justify-start`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOutAndClearDevice();
        }}
      >
        <LogOut size={16} /> {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
};

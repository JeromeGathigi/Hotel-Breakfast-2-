import React, { useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, signIn, logOut } from '../firebase';
import { LogIn, LogOut, User as UserIcon, AlertCircle } from 'lucide-react';

export const Auth: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [user, loading] = useAuthState(auth);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signIn();
    } catch (err: any) {
      console.error('Google Sign-in error:', err);
      if (err.code === 'auth/popup-blocked') {
        setAuthError('Popup was blocked by your browser. Please allow popups and try again.');
      } else {
        setAuthError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  if (loading) return <div className="animate-pulse h-10 w-28 bg-card rounded-lg border border-border" />;

  if (user) {
    const displayName = user.email || 'Staff User';
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground truncate max-w-[150px]">
            <UserIcon size={14} className="text-accent shrink-0" />
            <span className="truncate">{displayName}</span>
          </div>
          <button
            onClick={logOut}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-accent rounded-xl hover:bg-accent/10 transition-all text-xs font-bold shrink-0"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleGoogleSignIn}
        disabled={isSigningIn}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-on-primary rounded-xl hover:opacity-95 transition-all text-xs font-black uppercase tracking-wider shadow-md active:scale-95 disabled:opacity-50"
      >
        <LogIn size={14} />
        {isSigningIn ? 'Connecting...' : 'Google login'}
      </button>
      {authError && (
        <p className="text-[10px] text-amber-400 mt-1 leading-tight flex items-start gap-1">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          {authError}
        </p>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { 
  auth, 
  signIn, 
  logOut, 
  signInAsStaff, 
  signInAsAdmin 
} from '../firebase';
import { 
  LogIn, 
  LogOut, 
  Shield, 
  User, 
  AlertCircle 
} from 'lucide-react';

export const ADMIN_EMAILS = [
  'jeromegathigi@gmail.com',
  'admin@novotel-chiangmai.com',
  'gm@novotel-chiangmai.com',
  'manager@ibis-chiangmai.com',
];

export const isAdminUser = (email: string | null | undefined): boolean => {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  return ADMIN_EMAILS.includes(e) || e.includes('admin') || e.includes('manager');
};

export const Auth: React.FC = () => {
  const [user, setUser] = useState<any>(auth.currentUser);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (auth.onAuthStateChanged) {
      return auth.onAuthStateChanged((u: any) => {
        setUser(u);
      });
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    try {
      await signIn();
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please use an authorized Accor account.');
    }
  };

  const handleSignOut = async () => {
    setErrorMessage(null);
    await logOut();
  };

  const isAdmin = user?.email ? isAdminUser(user.email) : false;

  return (
    <div className="space-y-3">
      {user ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center font-bold font-display text-sm">
              {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold font-sans text-foreground truncate">{user.displayName || 'Accor Colleague'}</p>
              <p className="text-[10px] font-mono-custom text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono-custom font-semibold uppercase ${
              isAdmin 
                ? 'bg-accent/15 text-accent border border-accent/30' 
                : 'bg-[#F2EBE4]/80 text-muted-foreground border border-border'
            }`}>
              {isAdmin ? <Shield size={10} /> : <User size={10} />}
              {isAdmin ? 'Property Manager' : 'Host Stand Staff'}
            </span>

            <button
              onClick={handleSignOut}
              className="text-[10px] font-mono-custom text-muted-foreground hover:text-rose-600 flex items-center gap-1 transition-all"
            >
              <LogOut size={12} />
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 px-3 rounded-xl bg-accent text-white font-mono-custom font-medium text-xs flex items-center justify-center gap-2 shadow-xs hover:bg-accent-hover transition-all"
          >
            <LogIn size={13} />
            Sign in with Accor Account
          </button>

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              onClick={() => signInAsAdmin('jeromegathigi@gmail.com', 'Jerome Gathigi (Admin)')}
              className="px-2 py-1.5 rounded-lg border border-border bg-white hover:bg-[#F2EBE4]/60 text-foreground font-mono-custom font-semibold text-[10px] text-center"
            >
              Manager Access
            </button>
            <button
              onClick={() => signInAsStaff('Host Stand Staff')}
              className="px-2 py-1.5 rounded-lg border border-border bg-white hover:bg-[#F2EBE4]/60 text-muted-foreground hover:text-foreground font-mono-custom font-semibold text-[10px] text-center"
            >
              Staff Access
            </button>
          </div>

          {errorMessage && (
            <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] flex items-center gap-1.5">
              <AlertCircle size={12} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

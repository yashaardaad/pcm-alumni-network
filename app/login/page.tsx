'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth';
import { ErrorNote, Logo } from '@/components/ui';
import { errorMessage } from '@/lib/format';
import { isConfigured, supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup' | 'forgot';

export default function LoginPage() {
  const { session, ready } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupType, setSignupType] = useState<'member' | 'alumni' | 'mentor'>('member');
  const [gradYear, setGradYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) router.replace('/directory');
  }, [ready, session, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/directory`,
            data: {
              full_name: fullName.trim(),
              role: signupType,
              grad_year: signupType === 'mentor' ? '' : gradYear.trim(),
            },
          },
        });
        if (error) throw error;
        if (!data.session) setNotice('Check your email and click the link to confirm your address.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset`,
        });
        if (error) throw error;
        setNotice('If that address has an account, a reset link is on its way.');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset your password';

  return (
    <main className="auth">
      <Logo width={170} />
      <div className="stack">
        <h1 className="auth-title">{title}</h1>
        <p className="muted">
          {mode === 'signup'
            ? 'A club officer approves each new account before it can see the directory.'
            : 'The alumni network for Plintus Capital Management.'}
        </p>
      </div>

      {!isConfigured && (
        <p className="note">
          The app is not connected to a database yet. Add your Supabase keys to .env.local (see the
          README).
        </p>
      )}

      <form className="stack loose" onSubmit={submit}>
        {mode === 'signup' && (
          <>
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" required maxLength={80} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <span className="field-label" id="role-label">
                I am
              </span>
              <div className="radio-row" role="group" aria-labelledby="role-label">
                <button type="button" className={signupType === 'member' ? 'btn selected' : 'btn'} aria-pressed={signupType === 'member'} onClick={() => setSignupType('member')}>
                  A current member
                </button>
                <button type="button" className={signupType === 'alumni' ? 'btn selected' : 'btn'} aria-pressed={signupType === 'alumni'} onClick={() => setSignupType('alumni')}>
                  An alum
                </button>
                <button type="button" className={signupType === 'mentor' ? 'btn selected' : 'btn'} aria-pressed={signupType === 'mentor'} onClick={() => setSignupType('mentor')}>
                  A mentor
                </button>
              </div>
            </div>
            {signupType !== 'mentor' && (
              <div className="field">
                <label htmlFor="year">Class year</label>
                <input id="year" required inputMode="numeric" pattern="(19|20)[0-9]{2}" placeholder="2027" value={gradYear} onChange={(e) => setGradYear(e.target.value)} />
              </div>
            )}
          </>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== 'forgot' && (
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
        {notice && (
          <p className="note" role="status">
            {notice}
          </p>
        )}
        <button className="btn primary big block" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
      </form>

      <div className="stack center">
        {mode === 'signin' ? (
          <>
            <button className="link-btn" onClick={() => setMode('signup')}>
              New here? Create an account
            </button>
            <button className="link-btn" onClick={() => setMode('forgot')}>
              Forgot your password?
            </button>
          </>
        ) : (
          <button className="link-btn" onClick={() => setMode('signin')}>
            Back to sign in
          </button>
        )}
      </div>
    </main>
  );
}

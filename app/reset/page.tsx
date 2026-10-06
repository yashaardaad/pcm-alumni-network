'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/auth';
import { ErrorNote, Loading, Logo } from '@/components/ui';
import { errorMessage } from '@/lib/format';
import { supabase } from '@/lib/supabase';

/** The link in a password-reset email lands here, already signed in. */
export default function ResetPage() {
  const { session, ready } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else router.replace('/directory');
  }

  if (!ready) return <Loading />;

  return (
    <main className="auth">
      <Logo width={170} />
      <h1 className="auth-title">Choose a new password</h1>
      {session ? (
        <form className="stack loose" onSubmit={submit}>
          <div className="field">
            <label htmlFor="password">New password</label>
            <input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <ErrorNote>{error}</ErrorNote>
          <button className="btn primary big block" disabled={busy}>
            Save password
          </button>
        </form>
      ) : (
        <>
          <p className="muted">This reset link has expired or was already used. Request a new one from the sign-in screen.</p>
          <Link className="btn" href="/login">
            Back to sign in
          </Link>
        </>
      )}
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMe } from '@/components/auth';
import { Avatar, BackHeader, Empty, ErrorNote, Icon, Loading } from '@/components/ui';
import { REQUEST_TYPES, errorMessage, nextResetLabel } from '@/lib/format';
import { getResumeUrl } from '@/lib/resume';
import { supabase, unwrap } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error, loading } = useLoad(async () => {
    const [person, used, resumeUrl] = await Promise.all([
      unwrap<Profile | null>(supabase.from('profiles').select('*').eq('id', id).maybeSingle()),
      unwrap<number>(supabase.rpc('slots_used', { p_alum: id })),
      getResumeUrl(id),
    ]);
    return { person, used, resumeUrl };
  }, [id]);

  async function message() {
    setBusy(true);
    setActionError(null);
    try {
      const conversation = await unwrap<string>(supabase.rpc('start_dm', { p_other: id }));
      router.push(`/chat/${conversation}`);
    } catch (e) {
      setActionError(errorMessage(e));
      setBusy(false);
    }
  }

  const person = data?.person;
  const isAlum = person?.role === 'alumni';
  const open = person ? Math.max(person.monthly_cap - (data?.used ?? 0), 0) : 0;
  const firstName = person?.full_name.split(' ')[0] ?? '';

  return (
    <>
      <BackHeader href="/directory" label="Directory" />
      <main className="content" style={{ gap: 22 }}>
        {loading && <Loading />}
        <ErrorNote>{error}</ErrorNote>
        {data && !person && <Empty title="This profile is not available" />}

        {person && (
          <>
            <div className="row-start" style={{ gap: 16 }}>
              <Avatar name={person.full_name} size={68} />
              <div className="stack tight grow">
                <h1 className="back-title" style={{ fontSize: 24, lineHeight: '30px' }}>
                  {person.full_name}
                </h1>
                <span className="muted" style={{ fontSize: 14 }}>
                  {[person.headline, person.company].filter(Boolean).join(' · ') ||
                    (isAlum ? 'Alum' : 'Current member')}
                </span>
                <span className="label">
                  {[person.grad_year ? `Class of ${person.grad_year}` : null, person.city].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>

            {isAlum && person.open_to.length > 0 && (
              <div className="card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="stack tight">
                  <span className="strong">
                    {open > 0 ? `${open} of ${person.monthly_cap} request slots open` : 'At capacity this month'}
                  </span>
                  <span className="small muted">Resets {nextResetLabel()}</span>
                </div>
                <div className="pips" aria-hidden="true">
                  {Array.from({ length: Math.min(person.monthly_cap, 8) }, (_, i) => (
                    <span key={i} className={i < open ? 'pip open' : 'pip'} />
                  ))}
                </div>
              </div>
            )}

            {person.bio && (
              <section className="stack">
                <h2 className="label">About</h2>
                <p className="pre-line">{person.bio}</p>
              </section>
            )}
            {person.fund_role && (
              <section className="stack">
                <h2 className="label">On the fund</h2>
                <p>{person.fund_role}</p>
              </section>
            )}
            {person.linkedin_url && (
              <a className="row-start" style={{ gap: 8 }} href={person.linkedin_url} target="_blank" rel="noopener noreferrer">
                <Icon name="link" size={18} />
                <span>LinkedIn</span>
              </a>
            )}
            {!isAlum && data?.resumeUrl && (
              <a className="row-start" style={{ gap: 8 }} href={data.resumeUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="file" size={18} />
                <span>Resume (PDF)</span>
              </a>
            )}
            {isAlum && (
              <section className="stack tight">
                <h2 className="label" style={{ marginBottom: 4 }}>
                  Open to
                </h2>
                {REQUEST_TYPES.map((t) => {
                  const on = person.open_to.includes(t.value);
                  return (
                    <div key={t.value} className={on ? 'offer' : 'offer off'}>
                      <Icon name={on ? 'check' : 'dash'} size={20} />
                      <span>
                        {t.label}
                        <span className="muted">{on ? (t.detail ? ` · ${t.detail}` : '') : ' · not offering'}</span>
                      </span>
                    </div>
                  );
                })}
              </section>
            )}

            <ErrorNote>{actionError}</ErrorNote>

            {person.id === me.id ? (
              <Link className="btn big block" href="/me">
                Edit your profile
              </Link>
            ) : isAlum && me.role === 'member' ? (
              <div className="stack">
                {person.open_to.length > 0 && open > 0 ? (
                  <Link className="btn primary big block" href={`/directory/${person.id}/request`}>
                    Request a conversation
                  </Link>
                ) : (
                  <button className="btn primary big block" disabled>
                    {person.open_to.length === 0 ? 'Not taking requests right now' : `At capacity until ${nextResetLabel()}`}
                  </button>
                )}
                <p className="small muted center">
                  {firstName} reviews your request and chooses whether to accept.
                </p>
              </div>
            ) : isAlum && me.role === 'alumni' ? (
              <button className="btn primary big block" onClick={message} disabled={busy}>
                Message {firstName}
              </button>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}

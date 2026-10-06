'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMe } from '@/components/auth';
import { Avatar, BackHeader, Empty, ErrorNote, Icon, Loading } from '@/components/ui';
import { MAX_OPEN_REQUESTS, REQUEST_EXPIRY_DAYS, REQUEST_TYPES, errorMessage } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';
import type { Profile, RequestType } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const TIMES = ['Weekday evenings', 'Weekends', 'Flexible'];
const MAX_MESSAGE = 500;

export default function NewRequestPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const router = useRouter();
  const [type, setType] = useState<RequestType | null>(null);
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [availability, setAvailability] = useState('Flexible');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data, error, loading } = useLoad(async () => {
    const [alum, pending] = await Promise.all([
      unwrap<Profile | null>(
        supabase.from('profiles').select('*').eq('id', id).eq('role', 'alumni').maybeSingle(),
      ),
      supabase
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', me.id)
        .eq('status', 'pending'),
    ]);
    return { alum, openCount: pending.count ?? 0 };
  }, [id, me.id]);

  const alum = data?.alum;
  const offered = REQUEST_TYPES.filter((t) => alum?.open_to.includes(t.value));
  const chosen = type ?? offered[0]?.value ?? null;
  const left = Math.max(MAX_OPEN_REQUESTS - (data?.openCount ?? 0), 0);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await unwrap(
        supabase.rpc('create_request', {
          p_alum: id,
          p_type: chosen,
          p_topic: topic,
          p_message: message,
          p_availability: availability,
        }),
      );
      router.push('/requests');
    } catch (err) {
      setSubmitError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <BackHeader href={`/directory/${id}`} label="profile" title="New request" />
      <main className="content">
        {loading && <Loading />}
        <ErrorNote>{error}</ErrorNote>
        {data && !alum && <Empty title="This alum is not available" />}
        {me.role !== 'member' && <Empty title="Requests are for current members">Alumni can message each other directly from a profile.</Empty>}

        {alum && me.role === 'member' && (
          <form className="stack" style={{ gap: 18 }} onSubmit={send}>
            <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
              <Avatar name={alum.full_name} size={40} />
              <div className="stack tight grow">
                <span className="strong">To {alum.full_name}</span>
                <span className="small muted">{[alum.headline, alum.company].filter(Boolean).join(' · ')}</span>
              </div>
            </div>

            <div className="field">
              <span className="field-label" id="type-label">
                What would you like?
              </span>
              <div className="chips wrap" role="group" aria-labelledby="type-label">
                {offered.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={chosen === t.value ? 'btn selected' : 'btn'}
                    aria-pressed={chosen === t.value}
                    onClick={() => setType(t.value)}
                    style={{ flex: 1, minHeight: 48, whiteSpace: 'nowrap' }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="topic">Topic</label>
              <input id="topic" required maxLength={120} placeholder="Getting into equity research" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="message">Message</label>
              <textarea
                id="message"
                required
                rows={5}
                maxLength={MAX_MESSAGE}
                placeholder="Say who you are, what you want to talk about, and why you picked them."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <span className="small muted">
                Keep it short and specific. {message.length} of {MAX_MESSAGE} characters.
              </span>
            </div>

            <div className="field">
              <span className="field-label" id="when-label">
                When works for you?
              </span>
              <div className="chips wrap" role="group" aria-labelledby="when-label">
                {TIMES.map((t) => (
                  <button key={t} type="button" className="chip" aria-pressed={availability === t} onClick={() => setAvailability(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="note">
              <Icon name="clock" size={20} />
              <span>
                You have {left} of {MAX_OPEN_REQUESTS} open requests left. A request expires after{' '}
                {REQUEST_EXPIRY_DAYS} days without a reply.
              </span>
            </div>

            <ErrorNote>{submitError}</ErrorNote>
            <button className="btn primary big block" disabled={busy || left === 0 || !chosen}>
              Send request
            </button>
          </form>
        )}
      </main>
    </>
  );
}

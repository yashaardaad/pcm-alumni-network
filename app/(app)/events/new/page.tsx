'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMe } from '@/components/auth';
import { BackHeader, Empty, ErrorNote } from '@/components/ui';
import { AUDIENCE_LABEL, errorMessage } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';
import type { Audience } from '@/lib/types';

export default function NewEventPage() {
  const me = useMe();
  const router = useRouter();
  const canPost = me.is_admin || me.role === 'alumni';
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // The date and times are in the poster's own time zone; store them as exact moments.
    const startsAt = new Date(`${date}T${start}`);
    const endsAt = end ? new Date(`${date}T${end}`) : null;
    if (Number.isNaN(startsAt.getTime())) return setError('Choose a date and start time.');
    if (endsAt && endsAt <= startsAt) return setError('The end time needs to be after the start time.');

    setBusy(true);
    try {
      await unwrap(
        supabase.from('events').insert({
          title: title.trim(),
          starts_at: startsAt.toISOString(),
          ends_at: endsAt?.toISOString() ?? null,
          location: location.trim() || null,
          description: description.trim() || null,
          audience,
        }),
      );
      router.push('/events');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <BackHeader href="/events" label="events" title="Post an event" />
      <main className="content">
        {!canPost ? (
          <Empty title="Only alumni and admins can post events">Ask a club officer to post it for you.</Empty>
        ) : (
          <form className="stack" style={{ gap: 18 }} onSubmit={post}>
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="date">Date</label>
              <input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="start">Starts</label>
                <input id="start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="end">Ends (optional)</label>
                <input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="location">Where</label>
              <input id="location" maxLength={160} placeholder="Venue and city, or a video link" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="audience">Who can see it</label>
              <select id="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                {(['all', 'alumni', 'members'] as Audience[]).map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCE_LABEL[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="description">Details (optional)</label>
              <textarea id="description" rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <ErrorNote>{error}</ErrorNote>
            <button className="btn primary big block" disabled={busy}>
              Post event
            </button>
          </form>
        )}
      </main>
    </>
  );
}

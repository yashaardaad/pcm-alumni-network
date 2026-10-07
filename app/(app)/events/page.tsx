'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMe } from '@/components/auth';
import { Empty, ErrorNote, Icon, Loading, PageHeader, Tag } from '@/components/ui';
import { AUDIENCE_LABEL, downloadIcs, errorMessage, eventParts } from '@/lib/format';
import { MAX_EVENT_FILES, getEventFileUrl, isAllowedEventFile, removeEventFile, uploadEventFile } from '@/lib/event-files';
import { supabase, unwrap } from '@/lib/supabase';
import type { EventRow } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const EVENT_SELECT =
  '*, event_rsvps(user_id, profile:profiles(full_name)), event_files(id, event_id, storage_path, file_name, content_type, size_bytes, uploaded_by, created_at)';

type Tab = 'upcoming' | 'going' | 'past';

export default function EventsPage() {
  const me = useMe();
  const canPost = me.is_admin || me.role === 'alumni';
  const [tab, setTab] = useState<Tab>('upcoming');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fileBusyKey, setFileBusyKey] = useState<string | null>(null);

  const { data, error, loading, reload } = useLoad(
    () => unwrap<EventRow[]>(supabase.from('events').select(EVENT_SELECT).order('starts_at')),
    [],
  );

  async function act(id: string, run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    setBusyId(id);
    setActionError(null);
    try {
      await unwrap(run());
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  function toggleAttendees(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function openFile(path: string) {
    const url = await getEventFileUrl(path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleFileUpload(eventId: string, file: File | undefined) {
    if (!file) return;
    if (!isAllowedEventFile(file)) {
      setActionError('Files must be PDF, Word, Excel, or PowerPoint, and under 20 MB.');
      return;
    }
    setFileBusyKey(eventId);
    setActionError(null);
    try {
      await uploadEventFile(eventId, me.id, file);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setFileBusyKey(null);
    }
  }

  async function handleFileRemove(fileId: string, storagePath: string) {
    setFileBusyKey(fileId);
    setActionError(null);
    try {
      await removeEventFile(fileId, storagePath);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setFileBusyKey(null);
    }
  }

  // An event stays under "Upcoming" until it ends (or two hours after it starts).
  const [now] = useState(() => Date.now());
  const isPast = (e: EventRow) => (e.ends_at ? new Date(e.ends_at).getTime() : new Date(e.starts_at).getTime() + 2 * 3600_000) < now;
  const going = (e: EventRow) => e.event_rsvps.some((r) => r.user_id === me.id);

  const events = data ?? [];
  const shown =
    tab === 'past'
      ? events.filter(isPast).reverse()
      : events.filter((e) => !isPast(e) && (tab === 'upcoming' || going(e)));

  return (
    <>
      <PageHeader
        title="Events"
        me={me}
        action={
          canPost ? (
            <Link href="/events/new" className="btn pill">
              <Icon name="plus" size={20} />
              Post event
            </Link>
          ) : undefined
        }
      >
        <div className="seg" role="group" aria-label="Filter events">
          <button aria-pressed={tab === 'upcoming'} onClick={() => setTab('upcoming')}>
            Upcoming
          </button>
          <button aria-pressed={tab === 'going'} onClick={() => setTab('going')}>
            Going
          </button>
          <button aria-pressed={tab === 'past'} onClick={() => setTab('past')}>
            Past
          </button>
        </div>
      </PageHeader>

      <main className="content" style={{ gap: 12, paddingTop: 0 }}>
        {loading && <Loading label="Loading events" />}
        <ErrorNote>{error ?? actionError}</ErrorNote>
        {data && shown.length === 0 && (
          <Empty title={tab === 'upcoming' ? 'No upcoming events' : tab === 'going' ? 'You have not RSVPed to anything yet' : 'No past events'}>
            {tab === 'upcoming' && canPost ? 'Post the first one with the button above.' : undefined}
          </Empty>
        )}

        {shown.map((e) => {
          const d = eventParts(e.starts_at);
          const count = e.event_rsvps.length;
          const mine = going(e);
          const busy = busyId === e.id;
          const canDelete = e.created_by === me.id || me.is_admin;
          return (
            <article key={e.id} className="card" style={{ gap: 12 }}>
              <div className="row-start" style={{ alignItems: 'flex-start', gap: 14 }}>
                <div className="date-block">
                  <span className="label">{d.month}</span>
                  <span className="date-day">{d.day}</span>
                  <span className="label" style={{ fontSize: 10 }}>
                    {d.weekday}
                  </span>
                </div>
                <div className="grow stack" style={{ gap: 4 }}>
                  <h2 className="strong" style={{ fontSize: 16, lineHeight: '22px' }}>
                    {e.title}
                  </h2>
                  <span className="small muted">{[d.time, e.location].filter(Boolean).join(' · ')}</span>
                  <div>
                    <Tag tone={e.audience === 'alumni' ? 'brand' : 'neutral'}>{AUDIENCE_LABEL[e.audience]}</Tag>
                  </div>
                </div>
              </div>
              {e.description && <p className="pre-line small" style={{ color: 'var(--ink-soft)' }}>{e.description}</p>}
              <div className="row-between">
                <div className="row-start small muted" style={{ gap: 14, whiteSpace: 'nowrap' }}>
                  <button className="link-btn" onClick={() => toggleAttendees(e.id)}>
                    {count} going
                  </button>
                  <button className="link-btn" onClick={() => downloadIcs(e)}>
                    Add to calendar
                  </button>
                </div>
                {!isPast(e) &&
                  (mine ? (
                    <button
                      className="btn selected"
                      aria-pressed="true"
                      disabled={busy}
                      onClick={() => act(e.id, () => supabase.from('event_rsvps').delete().eq('event_id', e.id).eq('user_id', me.id))}
                    >
                      <Icon name="check" size={18} />
                      Going
                    </button>
                  ) : (
                    <button
                      className="btn primary"
                      disabled={busy}
                      onClick={() => act(e.id, () => supabase.from('event_rsvps').insert({ event_id: e.id }))}
                    >
                      RSVP
                    </button>
                  ))}
              </div>

              {expanded.has(e.id) && (
                <div className="stack tight" style={{ paddingLeft: 2 }}>
                  {e.event_rsvps.length === 0 ? (
                    <span className="small muted">No one yet.</span>
                  ) : (
                    e.event_rsvps.map((r) => (
                      <span key={r.user_id} className="small muted">
                        {r.profile?.full_name ?? 'Someone'}
                      </span>
                    ))
                  )}
                </div>
              )}

              <div className="stack tight">
                <span className="field-label">Files</span>
                {e.event_files.length === 0 && <span className="small muted">No files attached.</span>}
                {e.event_files.map((f) => (
                  <div key={f.id} className="row-between" style={{ gap: 8 }}>
                    <button
                      className="link-btn"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'left' }}
                      onClick={() => openFile(f.storage_path)}
                    >
                      <Icon name="file" size={16} />
                      {f.file_name}
                    </button>
                    {me.role === 'alumni' && (
                      <button
                        className="link-btn"
                        style={{ color: 'var(--danger)' }}
                        disabled={fileBusyKey === f.id}
                        onClick={() => handleFileRemove(f.id, f.storage_path)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {me.role === 'alumni' && e.event_files.length < MAX_EVENT_FILES && (
                  <input
                    type="file"
                    accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
                    disabled={fileBusyKey === e.id}
                    onChange={(ev) => {
                      const file = ev.target.files?.[0];
                      ev.target.value = '';
                      void handleFileUpload(e.id, file);
                    }}
                  />
                )}
              </div>

              {canDelete && (
                <button
                  className="link-btn"
                  style={{ color: 'var(--danger)', alignSelf: 'flex-start', minHeight: 32 }}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete "${e.title}"? This removes it for everyone.`)) {
                      void act(e.id, () => supabase.from('events').delete().eq('id', e.id));
                    }
                  }}
                >
                  Delete event
                </button>
              )}
            </article>
          );
        })}
      </main>
    </>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth, useMe } from '@/components/auth';
import { Avatar, Empty, ErrorNote, Loading, PageHeader, Tag } from '@/components/ui';
import { REQUEST_EXPIRY_DAYS, errorMessage, requestLabel, timeAgo } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';
import type { RequestRow, RequestStatus } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const PERSON = 'id, full_name, role, grad_year, headline, company, fund_role';
const SELECT = `*, requester:profiles!requests_requester_id_fkey(${PERSON}), alum:profiles!requests_alum_id_fkey(${PERSON})`;

type Tab = 'pending' | 'accepted' | 'past';
const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export default function RequestsPage() {
  const me = useMe();
  const { refreshProfile } = useAuth();
  const isAlum = me.role === 'alumni';
  const [tab, setTab] = useState<Tab>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingCap, setEditingCap] = useState(false);

  const { data, error, loading, reload } = useLoad(async () => {
    await supabase.rpc('expire_stale_requests');
    const [rows, used] = await Promise.all([
      unwrap<RequestRow[]>(supabase.from('requests').select(SELECT).order('created_at', { ascending: false })),
      isAlum ? unwrap<number>(supabase.rpc('slots_used', { p_alum: me.id })) : Promise.resolve(0),
    ]);
    // Alumni see what they have received; members see what they have sent.
    return { rows: rows.filter((r) => (isAlum ? r.alum_id : r.requester_id) === me.id), used };
  }, [me.id, isAlum]);

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

  async function setCap(next: number) {
    if (next < 0 || next > 20) return;
    const { error } = await supabase.from('profiles').update({ monthly_cap: next }).eq('id', me.id);
    if (error) setActionError(error.message);
    else await refreshProfile();
  }

  const rows = data?.rows ?? [];
  const inTab = (r: RequestRow) =>
    tab === 'pending' ? r.status === 'pending' : tab === 'accepted' ? r.status === 'accepted' : !['pending', 'accepted'].includes(r.status);
  const shown = rows.filter(inTab);
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  return (
    <>
      <PageHeader title="Requests" me={me}>
        <div className="seg" role="group" aria-label="Filter requests">
          <button aria-pressed={tab === 'pending'} onClick={() => setTab('pending')}>
            Pending{pendingCount > 0 ? ` · ${pendingCount}` : ''}
          </button>
          <button aria-pressed={tab === 'accepted'} onClick={() => setTab('accepted')}>
            Accepted
          </button>
          <button aria-pressed={tab === 'past'} onClick={() => setTab('past')}>
            Past
          </button>
        </div>

        {isAlum && (
          <div className="row-between small muted">
            <span>
              Monthly cap: {me.monthly_cap} {me.monthly_cap === 1 ? 'request' : 'requests'} · {data?.used ?? 0} used
            </span>
            {editingCap ? (
              <span className="stepper">
                <button aria-label="Lower cap" onClick={() => setCap(me.monthly_cap - 1)}>
                  −
                </button>
                <output>{me.monthly_cap}</output>
                <button aria-label="Raise cap" onClick={() => setCap(me.monthly_cap + 1)}>
                  +
                </button>
                <button className="link-btn" style={{ marginLeft: 8 }} onClick={() => setEditingCap(false)}>
                  Done
                </button>
              </span>
            ) : (
              <button className="link-btn" onClick={() => setEditingCap(true)}>
                Edit cap
              </button>
            )}
          </div>
        )}
      </PageHeader>

      <main className="content" style={{ gap: 12, paddingTop: 0 }}>
        {loading && <Loading label="Loading requests" />}
        <ErrorNote>{error ?? actionError}</ErrorNote>

        {data && shown.length === 0 && (
          <Empty title={tab === 'pending' ? 'Nothing waiting' : tab === 'accepted' ? 'No accepted requests yet' : 'No past requests'}>
            {tab !== 'pending'
              ? undefined
              : isAlum
                ? me.open_to.length === 0
                  ? 'You are not listed as open to requests. Choose what you offer on your profile.'
                  : 'When a member asks for your time, it shows up here.'
                : 'Find an alum in the Directory and send a request.'}
          </Empty>
        )}
        {data && tab === 'pending' && shown.length === 0 && isAlum && me.open_to.length === 0 && (
          <Link className="btn block" href="/me">
            Edit your profile
          </Link>
        )}

        {shown.map((r) => {
          const other = isAlum ? r.requester : r.alum;
          const name = other?.full_name ?? 'Someone';
          const subtitle = isAlum
            ? [`Member${other?.grad_year ? `, class of ${other.grad_year}` : ''}`, other?.fund_role].filter(Boolean).join(' · ')
            : [other?.headline, other?.company].filter(Boolean).join(' · ');
          const busy = busyId === r.id;
          return (
            <article key={r.id} className="card">
              <div className="row-start">
                <Avatar name={name} size={40} />
                <div className="grow stack tight">
                  <span className="strong">{name}</span>
                  <span className="small muted">{subtitle}</span>
                </div>
                <Tag>{requestLabel(r.type)}</Tag>
              </div>
              <div className="stack" style={{ gap: 4 }}>
                <span className="strong">{r.topic}</span>
                <p className="pre-line" style={{ fontSize: 14, lineHeight: '20px', color: 'var(--ink-soft)' }}>
                  {r.message}
                </p>
              </div>
              <span className="label">
                {r.availability} · Sent {timeAgo(r.created_at)}
              </span>

              {r.status === 'pending' && isAlum && (
                <div className="btn-pair">
                  <button className="btn" disabled={busy} onClick={() => act(r.id, () => supabase.rpc('respond_to_request', { p_request: r.id, p_accept: false }))}>
                    Decline
                  </button>
                  <button className="btn primary" disabled={busy} onClick={() => act(r.id, () => supabase.rpc('respond_to_request', { p_request: r.id, p_accept: true }))}>
                    Accept
                  </button>
                </div>
              )}
              {r.status === 'pending' && !isAlum && (
                <div className="row-between">
                  <span className="small muted">Expires {REQUEST_EXPIRY_DAYS} days after sending</span>
                  <button className="btn" disabled={busy} onClick={() => act(r.id, () => supabase.rpc('cancel_request', { p_request: r.id }))}>
                    Cancel request
                  </button>
                </div>
              )}
              {r.status === 'accepted' && r.conversation_id && (
                <Link className="btn primary" href={`/chat/${r.conversation_id}`}>
                  Open thread
                </Link>
              )}
              {!['pending', 'accepted'].includes(r.status) && (
                <div>
                  <Tag tone="neutral">{STATUS_LABEL[r.status]}</Tag>
                </div>
              )}
            </article>
          );
        })}

        {data && tab === 'pending' && shown.length > 0 && isAlum && (
          <p className="small muted center">Accepting opens a private thread in Chat. Declining needs no reason.</p>
        )}
      </main>
    </>
  );
}

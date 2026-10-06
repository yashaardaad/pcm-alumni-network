'use client';

import { useState } from 'react';
import { useMe } from '@/components/auth';
import { BackHeader, Empty, ErrorNote, Loading, Tag } from '@/components/ui';
import { errorMessage } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';
import type { AdminUser, Channel, Role, Status } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

type Query = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export default function AdminPage() {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [channel, setChannel] = useState({ name: '', description: '', audience: 'alumni' });

  const { data, error, loading, reload } = useLoad(async () => {
    if (!me.is_admin) return null;
    const [users, channels] = await Promise.all([
      unwrap<AdminUser[]>(supabase.rpc('admin_list_users')),
      unwrap<Channel[]>(
        supabase.from('conversations').select('id, name, description, audience').eq('kind', 'channel').order('name'),
      ),
    ]);
    return { users, channels };
  }, [me.is_admin]);

  async function run(query: () => Query, done?: (result: unknown) => string) {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await unwrap<unknown>(query());
      if (done) setNotice(done(result));
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const update = (user: AdminUser, change: { status?: Status; role?: Role; is_admin?: boolean }) =>
    run(() =>
      supabase.rpc('admin_update_user', {
        p_user: user.id,
        p_status: change.status ?? null,
        p_role: change.role ?? null,
        p_is_admin: change.is_admin ?? null,
      }),
    );

  if (!me.is_admin) {
    return (
      <>
        <BackHeader href="/directory" label="directory" title="Admin" />
        <Empty title="This page is for club admins" />
      </>
    );
  }

  const users = data?.users ?? [];
  const pending = users.filter((u) => u.status === 'pending');
  const approved = users.filter((u) => u.status === 'approved');
  const rejected = users.filter((u) => u.status === 'rejected');

  return (
    <>
      <BackHeader href="/me" label="your profile" title="Admin" />
      <main className="content" style={{ gap: 24 }}>
        {loading && <Loading />}
        <ErrorNote>{error ?? actionError}</ErrorNote>
        {notice && (
          <p className="note" role="status">
            {notice}
          </p>
        )}

        <section className="stack">
          <h2 className="label">Waiting for approval · {pending.length}</h2>
          {data && pending.length === 0 && <p className="muted">No one is waiting.</p>}
          {pending.map((u) => (
            <div key={u.id} className="card">
              <div className="stack tight">
                <span className="strong">{u.full_name}</span>
                <span className="small muted">{u.email}</span>
                <span className="small muted">
                  Says they are {u.role === 'alumni' ? 'an alum' : 'a current member'}
                  {u.grad_year ? `, class of ${u.grad_year}` : ''}
                </span>
              </div>
              <div className="btn-pair">
                <button className="btn primary" disabled={busy} onClick={() => update(u, { status: 'approved', role: 'alumni' })}>
                  Approve as alum
                </button>
                <button className="btn primary" disabled={busy} onClick={() => update(u, { status: 'approved', role: 'member' })}>
                  Approve as member
                </button>
              </div>
              <button className="btn danger" disabled={busy} onClick={() => update(u, { status: 'rejected' })}>
                Reject
              </button>
            </div>
          ))}
        </section>

        <section className="stack">
          <h2 className="label">Yearly rollover</h2>
          <p className="small muted">Moves every current member with this class year to alumni. Do it after graduation.</p>
          <div className="row-start">
            <input className="input" style={{ width: 96 }} aria-label="Class year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
            <button
              className="btn"
              disabled={busy || !/^(19|20)\d{2}$/.test(year)}
              onClick={() => {
                if (window.confirm(`Move every current member in the class of ${year} to alumni?`)) {
                  void run(
                    () => supabase.rpc('admin_graduate_class', { p_year: Number(year) }),
                    (moved) => `${moved} ${moved === 1 ? 'person' : 'people'} moved to alumni.`,
                  );
                }
              }}
            >
              Move to alumni
            </button>
          </div>
        </section>

        <section className="stack">
          <h2 className="label">Channels</h2>
          <p className="small muted">
            Alumni-only channels are private to alumni. Admins who are current members can manage the list but cannot read
            them.
          </p>
          {(data?.channels ?? []).map((c) => (
            <div key={c.id} className="row-between">
              <div className="stack tight grow">
                <span className="strong"># {c.name}</span>
                <span className="small muted">{c.audience === 'all' ? 'Alumni and members' : 'Alumni only'}</span>
              </div>
              <button
                className="link-btn"
                style={{ color: 'var(--danger)' }}
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Delete #${c.name} and every message in it? This cannot be undone.`)) {
                    void run(() => supabase.from('conversations').delete().eq('id', c.id));
                  }
                }}
              >
                Delete
              </button>
            </div>
          ))}
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  supabase.from('conversations').insert({
                    kind: 'channel',
                    name: channel.name,
                    description: channel.description.trim() || null,
                    audience: channel.audience,
                  }),
                () => {
                  setChannel({ name: '', description: '', audience: 'alumni' });
                  return 'Channel added.';
                },
              );
            }}
          >
            <div className="field">
              <label htmlFor="ch-name">New channel name</label>
              <input
                id="ch-name"
                required
                pattern="[a-z0-9\-]{2,40}"
                title="Lowercase letters, numbers and dashes"
                placeholder="new-york or class-of-2019"
                value={channel.name}
                onChange={(e) => setChannel((c) => ({ ...c, name: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
              />
            </div>
            <div className="field">
              <label htmlFor="ch-desc">What it is for (optional)</label>
              <input id="ch-desc" maxLength={140} value={channel.description} onChange={(e) => setChannel((c) => ({ ...c, description: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="ch-aud">Who can read and post</label>
              <select id="ch-aud" value={channel.audience} onChange={(e) => setChannel((c) => ({ ...c, audience: e.target.value }))}>
                <option value="alumni">Alumni only</option>
                <option value="all">Alumni and members</option>
              </select>
            </div>
            <button className="btn" disabled={busy}>
              Add channel
            </button>
          </form>
        </section>

        <section className="stack">
          <h2 className="label">People · {approved.length}</h2>
          {approved.map((u) => (
            <div key={u.id} className="card" style={{ gap: 8 }}>
              <div className="row-between">
                <div className="stack tight grow">
                  <span className="strong">{u.full_name}</span>
                  <span className="small muted truncate">{u.email}</span>
                </div>
                {u.is_admin && <Tag>Admin</Tag>}
              </div>
              <div className="row-between">
                <select
                  className="chip"
                  aria-label={`Role for ${u.full_name}`}
                  value={u.role}
                  disabled={busy}
                  onChange={(e) => update(u, { role: e.target.value as Role })}
                >
                  <option value="member">Current member{u.grad_year ? ` ’${String(u.grad_year).slice(-2)}` : ''}</option>
                  <option value="alumni">Alum{u.grad_year ? ` ’${String(u.grad_year).slice(-2)}` : ''}</option>
                </select>
                {u.id !== me.id && (
                  <div className="row-start" style={{ gap: 14 }}>
                    <button className="link-btn" disabled={busy} onClick={() => update(u, { is_admin: !u.is_admin })}>
                      {u.is_admin ? 'Remove admin' : 'Make admin'}
                    </button>
                    <button
                      className="link-btn"
                      style={{ color: 'var(--danger)' }}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Remove ${u.full_name}'s access? They will be locked out of the network until you restore it.`)) {
                          void update(u, { status: 'rejected' });
                        }
                      }}
                    >
                      Remove access
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>

        {rejected.length > 0 && (
          <section className="stack">
            <h2 className="label">No access · {rejected.length}</h2>
            {rejected.map((u) => (
              <div key={u.id} className="row-between">
                <div className="stack tight grow">
                  <span className="strong">{u.full_name}</span>
                  <span className="small muted truncate">{u.email}</span>
                </div>
                <button className="btn" disabled={busy} onClick={() => update(u, { status: 'approved' })}>
                  Restore
                </button>
              </div>
            ))}
          </section>
        )}
      </main>
    </>
  );
}

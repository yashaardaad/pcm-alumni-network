'use client';

import Link from 'next/link';
import { useMe } from '@/components/auth';
import { Avatar, Empty, ErrorNote, Icon, Loading, PageHeader, Tag } from '@/components/ui';
import { supabase, unwrap } from '@/lib/supabase';
import type { Conversation } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

export default function ChatPage() {
  const me = useMe();
  const { data, error, loading } = useLoad(
    () => unwrap<Conversation[]>(supabase.rpc('my_conversations')),
    [],
  );

  const channels = (data ?? []).filter((c) => c.kind === 'channel');
  const dms = (data ?? [])
    .filter((c) => c.kind === 'dm')
    .sort((a, b) => (b.last_at ?? '').localeCompare(a.last_at ?? ''));

  return (
    <>
      <PageHeader
        title="Chat"
        me={me}
        action={
          me.role === 'alumni' ? (
            <Link href="/directory" className="btn pill">
              <Icon name="plus" size={20} />
              New message
            </Link>
          ) : undefined
        }
      />
      <main className="content flush">
        {loading && <Loading label="Loading chat" />}
        <ErrorNote>{error}</ErrorNote>

        {data && (
          <>
            <h2 className="label section-label" style={{ paddingTop: 6 }}>
              Channels
            </h2>
            {channels.length === 0 ? (
              <Empty title="No channels yet">An admin can add channels from the Admin page.</Empty>
            ) : (
              <div className="list">
                {channels.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </div>
            )}

            <h2 className="label section-label">Direct messages</h2>
            {dms.length === 0 ? (
              <Empty title="No direct messages yet">
                {me.role === 'alumni'
                  ? 'Open an alum in the Directory and choose Message. Accepted requests also open a thread here.'
                  : 'When an alum accepts one of your requests, your private thread appears here.'}
              </Empty>
            ) : (
              <div className="list">
                {dms.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function Row({ c }: { c: Conversation }) {
  const isChannel = c.kind === 'channel';
  const title = isChannel ? c.name : (c.other_name ?? 'Former member');
  const preview = c.last_body
    ? `${isChannel && c.last_sender ? `${c.last_sender.split(' ')[0]}: ` : ''}${c.last_body}`
    : isChannel
      ? (c.description ?? 'No messages yet')
      : 'No messages yet';
  const shared = isChannel && c.audience === 'all';

  return (
    <Link href={`/chat/${c.id}`} className="list-row mid">
      {isChannel ? (
        <span className={shared ? 'channel-icon neutral' : 'channel-icon'} aria-hidden="true">
          <Icon name="hash" size={18} />
        </span>
      ) : (
        <Avatar name={title ?? '?'} size={38} />
      )}
      <div className="grow stack tight">
        <div className="row-start" style={{ gap: 8 }}>
          <span style={{ fontWeight: c.unread > 0 ? 700 : 500 }}>{title}</span>
          {shared && <Tag tone="neutral">Members can post</Tag>}
          {!isChannel && c.from_request && <Tag>From request</Tag>}
        </div>
        <span className="small muted truncate">{preview}</span>
      </div>
      {c.unread > 0 && (
        <span className="badge" aria-label={`${c.unread} unread`}>
          {c.unread > 99 ? '99+' : c.unread}
        </span>
      )}
    </Link>
  );
}

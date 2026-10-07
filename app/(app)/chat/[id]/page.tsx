'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMe } from '@/components/auth';
import { Empty, ErrorNote, Icon, Loading } from '@/components/ui';
import { errorMessage, messageTime } from '@/lib/format';
import { fire, supabase, unwrap } from '@/lib/supabase';
import type { Conversation, Message } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const MESSAGE = 'id, conversation_id, sender_id, body, created_at, sender:profiles!messages_sender_id_fkey(full_name)';
const PAGE = 100;

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const add = useCallback((incoming: Message[]) => {
    setMessages((current) => {
      const seen = new Set(current.map((m) => m.id));
      const merged = [...current, ...incoming.filter((m) => !seen.has(m.id))];
      return merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const { data: conversation, error, loading } = useLoad(async () => {
    const [all, latest] = await Promise.all([
      unwrap<Conversation[]>(supabase.rpc('my_conversations')),
      unwrap<Message[]>(
        supabase.from('messages').select(MESSAGE).eq('conversation_id', id).order('created_at', { ascending: false }).limit(PAGE),
      ),
    ]);
    setMessages([]);
    add(latest);
    fire(supabase.rpc('mark_read', { p_conversation: id }));
    return all.find((c) => c.id === id) ?? null;
  }, [id]);

  // Live updates: new messages in this thread arrive without reloading.
  useEffect(() => {
    const channel = supabase
      .channel(`thread-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        async (payload) => {
          const row = payload.new as { id: string; sender_id: string };
          if (row.sender_id === me.id) return; // already added when we sent it
          const { data } = await supabase.from('messages').select(MESSAGE).eq('id', row.id).maybeSingle();
          if (data) add([data as unknown as Message]);
          fire(supabase.rpc('mark_read', { p_conversation: id }));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, me.id, add]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const saved = await unwrap<Omit<Message, 'sender'>>(
        supabase.from('messages').insert({ conversation_id: id, body }).select('id, conversation_id, sender_id, body, created_at').single(),
      );
      add([{ ...saved, sender: { full_name: me.full_name } }]);
      setDraft('');
    } catch (e) {
      setSendError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  const isChannel = conversation?.kind === 'channel';
  const title = conversation ? (isChannel ? `# ${conversation.name}` : (conversation.other_name ?? 'Former member')) : '';
  const subtitle = conversation
    ? isChannel
      ? conversation.audience === 'all'
        ? 'Alumni and current members'
        : 'Alumni only'
      : conversation.from_request
        ? 'Private thread from a request'
        : 'Private thread'
    : '';

  return (
    <>
      <header className="thread-head">
        <Link href="/chat" className="icon-btn" aria-label="Back to chat">
          <Icon name="back" />
        </Link>
        <div className="stack tight grow">
          <h1 className="strong truncate" style={{ fontSize: 16 }}>
            {!isChannel && conversation?.other_id ? (
              <Link href={`/directory/${conversation.other_id}`}>{title}</Link>
            ) : (
              title
            )}
          </h1>
          <span className="small muted">{subtitle}</span>
        </div>
      </header>

      <main className="thread">
        {loading && <Loading label="Loading messages" />}
        <ErrorNote>{error}</ErrorNote>
        {!loading && !error && !conversation && <Empty title="This conversation is not available" />}
        {conversation && messages.length === 0 && <Empty title="No messages yet">Say hello to get things started.</Empty>}

        {messages.map((m, i) => {
          const mine = m.sender_id === me.id;
          const previous = messages[i - 1];
          const startsGroup =
            !previous ||
            previous.sender_id !== m.sender_id ||
            new Date(m.created_at).getTime() - new Date(previous.created_at).getTime() > 10 * 60 * 1000;
          return (
            <div key={m.id} className={mine ? 'msg mine' : 'msg'}>
              {startsGroup && (
                <span className="msg-meta">
                  {mine ? (
                    'You'
                  ) : (
                    <Link href={`/directory/${m.sender_id}`}>{m.sender?.full_name ?? 'Former member'}</Link>
                  )}{' '}
                  · {messageTime(m.created_at)}
                </span>
              )}
              <div className="bubble">{m.body}</div>
            </div>
          );
        })}
        <div ref={bottom} />
      </main>

      {conversation && (
        <div>
          {sendError && (
            <div style={{ padding: '6px 16px' }}>
              <ErrorNote>{sendError}</ErrorNote>
            </div>
          )}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              aria-label="Message"
              rows={1}
              maxLength={4000}
              placeholder={isChannel ? `Message #${conversation.name}` : `Message ${title.split(' ')[0]}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button className="send" aria-label="Send message" disabled={sending || !draft.trim()}>
              <Icon name="send" size={20} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

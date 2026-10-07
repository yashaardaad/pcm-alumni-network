import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendMail } from '@/lib/mailer';
import { requestLabel } from '@/lib/format';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

async function emailFor(userId: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret');
  if (!secret || secret !== process.env.NOTIFY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { event, payload } = await req.json();
  const requestId: string | undefined = payload?.request_id;
  if (!requestId) return NextResponse.json({ error: 'Missing request_id' }, { status: 400 });

  const { data: r } = await supabaseAdmin
    .from('requests')
    .select(
      'id, type, topic, status, conversation_id, requester:requester_id(id, full_name), alum:alum_id(id, full_name)',
    )
    .eq('id', requestId)
    .single();
  if (!r) return NextResponse.json({ ok: true });

  const requester = Array.isArray(r.requester) ? r.requester[0] : r.requester;
  const alum = Array.isArray(r.alum) ? r.alum[0] : r.alum;

  if (event === 'request_created') {
    const to = alum?.id ? await emailFor(alum.id) : null;
    if (to) {
      await sendMail(
        to,
        `New request: ${requester?.full_name ?? 'A member'} wants a ${requestLabel(r.type)}`,
        `<p><strong>${requester?.full_name ?? 'A member'}</strong> sent you a ${requestLabel(r.type)} request:</p>
         <p style="padding:12px 16px;background:#F7F4EC;border-radius:8px;">"${r.topic}"</p>
         <p><a href="${APP_URL}/requests" style="color:#5A242C;">Review it in your inbox &rarr;</a></p>`,
      );
    }
  }

  if (event === 'request_accepted') {
    const to = requester?.id ? await emailFor(requester.id) : null;
    if (to) {
      const link = r.conversation_id ? `${APP_URL}/chat/${r.conversation_id}` : `${APP_URL}/chat`;
      await sendMail(
        to,
        `${alum?.full_name ?? 'The alum'} accepted your request`,
        `<p><strong>${alum?.full_name ?? 'The alum'}</strong> accepted your ${requestLabel(r.type)} request.</p>
         <p>A private thread is open and waiting.</p>
         <p><a href="${link}" style="color:#5A242C;">Open the conversation &rarr;</a></p>`,
      );
    }
  }

  return NextResponse.json({ ok: true });
}

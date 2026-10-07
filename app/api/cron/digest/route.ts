import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendMail } from '@/lib/mailer';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('status', 'approved');

  let sent = 0;
  for (const profile of profiles ?? []) {
    const parts: string[] = [];

    if (profile.role === 'alumni') {
      const { count } = await supabaseAdmin
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .eq('alum_id', profile.id)
        .eq('status', 'pending');
      if (count) {
        parts.push(
          `<p>You have <strong>${count}</strong> request${count === 1 ? '' : 's'} waiting for your response.</p>`,
        );
      }
    } else {
      const { count } = await supabaseAdmin
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', profile.id)
        .eq('status', 'pending');
      if (count) {
        parts.push(
          `<p>You have <strong>${count}</strong> request${count === 1 ? '' : 's'} still awaiting a reply.</p>`,
        );
      }
    }

    const { data: unread } = await supabaseAdmin.rpc('unread_count_for_user', { p_user: profile.id });
    if (typeof unread === 'number' && unread > 0) {
      parts.push(`<p>You have <strong>${unread}</strong> unread message${unread === 1 ? '' : 's'} in chat.</p>`);
    }

    if (parts.length === 0) continue;

    const { data: user } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    const email = user?.user?.email;
    if (!email) continue;

    await sendMail(
      email,
      'Your weekly PCM Alumni digest',
      `${parts.join('')}
       <p><a href="${APP_URL}/requests" style="color:#5A242C;">Open the app &rarr;</a></p>`,
    );
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}

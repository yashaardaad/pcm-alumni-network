import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendMail } from '@/lib/mailer';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: pending } = await supabaseAdmin
    .from('profiles')
    .select('full_name, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const { data: admins } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('is_admin', true)
    .eq('status', 'approved');

  const rows = pending
    .map((p) => `<li>${p.full_name} &mdash; waiting since ${new Date(p.created_at).toLocaleDateString()}</li>`)
    .join('');

  let sent = 0;
  for (const admin of admins ?? []) {
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(admin.id);
    const email = user?.user?.email;
    if (!email) continue;

    await sendMail(
      email,
      `${pending.length} account${pending.length === 1 ? '' : 's'} waiting for approval`,
      `<p><strong>${pending.length}</strong> account${pending.length === 1 ? '' : 's'} ${pending.length === 1 ? 'is' : 'are'} waiting on the Admin page:</p>
       <ul style="padding-left:20px;">${rows}</ul>
       <p><a href="${APP_URL}/admin" style="color:#5A242C;">Review on the Admin page &rarr;</a></p>`,
    );
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendMail } from '@/lib/mailer';
import type { Profile } from '@/lib/types';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

type ReminderProfile = Pick<
  Profile,
  | 'id' | 'role' | 'grad_year' | 'city' | 'fund_role' | 'linkedin_url' | 'bio'
  | 'headline' | 'company' | 'sector'
>;

// Labels match the ones on the profile page (app/(app)/me/page.tsx).
const SHARED_FIELDS = [
  ['grad_year', 'Class year'],
  ['city', 'City'],
  ['fund_role', 'Your role on the fund'],
  ['linkedin_url', 'LinkedIn'],
  ['bio', 'About'],
] as const;

const ALUM_FIELDS = [
  ['headline', 'Job title'],
  ['company', 'Firm'],
  ['sector', 'Sector'],
  ['fund_role', 'What you did on the fund'],
] as const;

/** Profile page fields this person has left empty. */
async function missingProfileFields(profile: ReminderProfile) {
  const isAlum = profile.role === 'alumni';
  const fields = new Map<string, string>(SHARED_FIELDS);
  if (isAlum) ALUM_FIELDS.forEach(([key, label]) => fields.set(key, label));

  const missing = [...fields]
    .filter(([key]) => profile[key as keyof ReminderProfile] == null)
    .map(([, label]) => label);

  if (!isAlum) {
    const { data } = await supabaseAdmin.storage.from('resumes').list('', { search: `${profile.id}.pdf` });
    if (!data?.some((f) => f.name === `${profile.id}.pdf`)) missing.push('Resume (PDF)');
  }
  return missing;
}

/** Twice a week, emails alumni and current members (never mentors) the profile fields they have left empty. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, role, grad_year, city, fund_role, linkedin_url, bio, headline, company, sector')
    .eq('status', 'approved')
    .eq('is_mentor', false)
    .returns<ReminderProfile[]>();

  let sent = 0;
  for (const profile of profiles ?? []) {
    const missing = await missingProfileFields(profile);
    if (missing.length === 0) continue;

    const { data: user } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    const email = user?.user?.email;
    if (!email) continue;

    await sendMail(
      email,
      'Finish your PCM Alumni profile',
      `<p>Your profile is missing ${missing.length === 1 ? 'this field' : 'these fields'}:</p>
       <ul style="padding-left:20px;">${missing.map((m) => `<li>${m}</li>`).join('')}</ul>
       <p>A complete profile helps ${profile.role === 'alumni' ? 'students find and reach you' : 'alumni get to know you before a request'}.</p>
       <p><a href="${APP_URL}/me" style="color:#5A242C;">Update your profile &rarr;</a></p>`,
    );
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}

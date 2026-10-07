'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth, useMe } from '@/components/auth';
import { BackHeader, ErrorNote, Icon } from '@/components/ui';
import { REQUEST_TYPES, SECTORS, errorMessage, normalizeUrl } from '@/lib/format';
import { getResumeUrl, removeResume, uploadResume } from '@/lib/resume';
import { supabase } from '@/lib/supabase';
import type { RequestType } from '@/lib/types';

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export default function MePage() {
  const me = useMe();
  const { refreshProfile, signOut, session } = useAuth();
  const isAlum = me.role === 'alumni';

  const [form, setForm] = useState({
    full_name: me.full_name,
    grad_year: me.grad_year ? String(me.grad_year) : '',
    headline: me.headline ?? '',
    company: me.company ?? '',
    sector: me.sector ?? '',
    city: me.city ?? '',
    fund_role: me.fund_role ?? '',
    bio: me.bio ?? '',
    linkedin_url: me.linkedin_url ?? '',
  });
  const [openTo, setOpenTo] = useState<RequestType[]>(me.open_to);
  const [cap, setCap] = useState(me.monthly_cap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  useEffect(() => {
    getResumeUrl(me.id).then(setResumeUrl);
  }, [me.id]);

  async function handleResumeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') return setResumeError('Resume must be a PDF.');
    if (file.size > MAX_RESUME_BYTES) return setResumeError('Resume must be under 5 MB.');

    setResumeBusy(true);
    setResumeError(null);
    try {
      await uploadResume(me.id, file);
      setResumeUrl(await getResumeUrl(me.id));
    } catch (err) {
      setResumeError(errorMessage(err));
    } finally {
      setResumeBusy(false);
    }
  }

  async function handleResumeRemove() {
    setResumeBusy(true);
    setResumeError(null);
    try {
      await removeResume(me.id);
      setResumeUrl(null);
    } catch (err) {
      setResumeError(errorMessage(err));
    } finally {
      setResumeBusy(false);
    }
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const text = (v: string) => v.trim() || null;
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        grad_year: form.grad_year ? Number(form.grad_year) : null,
        headline: text(form.headline),
        company: text(form.company),
        sector: text(form.sector),
        city: text(form.city),
        fund_role: text(form.fund_role),
        bio: text(form.bio),
        linkedin_url: normalizeUrl(form.linkedin_url),
        open_to: isAlum ? openTo : [],
        monthly_cap: cap,
      })
      .eq('id', me.id);
    setBusy(false);
    if (error) return setError(error.message);
    await refreshProfile();
    setSaved(true);
  }

  return (
    <>
      <BackHeader href="/directory" label="directory" title="Your profile" />
      <main className="content">
        <p className="small muted">
          Signed in as {session?.user.email} · {isAlum ? 'Alum' : 'Current member'}
          {me.is_admin ? ' · Admin' : ''}
        </p>

        {me.is_admin && (
          <Link className="btn block" href="/admin">
            Open the Admin page
          </Link>
        )}

        <form className="stack" style={{ gap: 18 }} onSubmit={save}>
          <div className="field">
            <label htmlFor="full_name">Full name</label>
            <input id="full_name" required maxLength={80} value={form.full_name} onChange={set('full_name')} />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="grad_year">Class year</label>
              <input id="grad_year" inputMode="numeric" pattern="(19|20)[0-9]{2}" value={form.grad_year} onChange={set('grad_year')} />
            </div>
            <div className="field">
              <label htmlFor="city">City</label>
              <input id="city" maxLength={60} value={form.city} onChange={set('city')} />
            </div>
          </div>

          {isAlum && (
            <>
              <div className="field">
                <label htmlFor="headline">Job title</label>
                <input id="headline" maxLength={80} placeholder="Equity Research Associate" value={form.headline} onChange={set('headline')} />
              </div>
              <div className="field">
                <label htmlFor="company">Firm</label>
                <input id="company" maxLength={80} value={form.company} onChange={set('company')} />
              </div>
              <div className="field">
                <label htmlFor="sector">Sector</label>
                <input id="sector" list="sectors" maxLength={40} value={form.sector} onChange={set('sector')} />
                <datalist id="sectors">
                  {SECTORS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="fund_role">{isAlum ? 'What you did on the fund' : 'Your role on the fund'}</label>
            <input id="fund_role" maxLength={120} placeholder="Consumer sector analyst" value={form.fund_role} onChange={set('fund_role')} />
          </div>
          <div className="field">
            <label htmlFor="linkedin_url">LinkedIn</label>
            <input
              id="linkedin_url"
              type="text"
              inputMode="url"
              maxLength={200}
              placeholder="linkedin.com/in/yourname"
              value={form.linkedin_url}
              onChange={set('linkedin_url')}
            />
          </div>
          <div className="field">
            <label htmlFor="bio">About</label>
            <textarea id="bio" rows={4} maxLength={600} placeholder={isAlum ? 'What you cover and what you are happy to talk about.' : 'What you are working on and interested in.'} value={form.bio} onChange={set('bio')} />
          </div>

          <div className="field">
            <span className="field-label">Resume (PDF)</span>
            {resumeUrl ? (
              <div className="row-start" style={{ gap: 10 }}>
                <a className="btn" href={resumeUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="file" size={18} />
                  View resume
                </a>
                <button type="button" className="btn" onClick={handleResumeRemove} disabled={resumeBusy}>
                  Remove
                </button>
              </div>
            ) : (
              <span className="small muted">No resume uploaded yet.</span>
            )}
            <input type="file" accept="application/pdf" onChange={handleResumeFile} disabled={resumeBusy} />
            <ErrorNote>{resumeError}</ErrorNote>
          </div>

          {isAlum && (
            <>
              <div className="field">
                <span className="field-label">Open to requests for</span>
                <div>
                  {REQUEST_TYPES.map((t) => (
                    <label key={t.value} className="check">
                      <input
                        type="checkbox"
                        checked={openTo.includes(t.value)}
                        onChange={(e) => {
                          setSaved(false);
                          setOpenTo((cur) => (e.target.checked ? [...cur, t.value] : cur.filter((v) => v !== t.value)));
                        }}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
                <span className="small muted">Leave all unticked to pause requests. You stay in the directory.</span>
              </div>
              <div className="field">
                <span className="field-label" id="cap-label">
                  Requests you will accept each month
                </span>
                <span className="stepper" role="group" aria-labelledby="cap-label">
                  <button type="button" aria-label="Fewer" onClick={() => setCap((c) => Math.max(c - 1, 0))}>
                    −
                  </button>
                  <output>{cap}</output>
                  <button type="button" aria-label="More" onClick={() => setCap((c) => Math.min(c + 1, 20))}>
                    +
                  </button>
                </span>
              </div>
            </>
          )}

          <ErrorNote>{error}</ErrorNote>
          {saved && (
            <p className="note" role="status">
              Profile saved.
            </p>
          )}
          <button className="btn primary big block" disabled={busy}>
            Save profile
          </button>
        </form>

        <button className="btn block" onClick={signOut}>
          Sign out
        </button>
      </main>
    </>
  );
}

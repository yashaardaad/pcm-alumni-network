'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMe } from '@/components/auth';
import { Avatar, Empty, ErrorNote, Icon, Loading, PageHeader, Tag } from '@/components/ui';
import { nextResetLabel, requestLabel, shortYear } from '@/lib/format';
import { supabase, unwrap } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const uniqueSorted = <T extends string | number>(values: (T | null)[]) =>
  [...new Set(values.filter((v): v is T => v !== null && v !== ''))].sort();

export default function DirectoryPage() {
  const me = useMe();
  const [query, setQuery] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [sector, setSector] = useState('');
  const [city, setCity] = useState('');
  const [year, setYear] = useState('');

  const { data, error, loading } = useLoad(async () => {
    const [alumni, used] = await Promise.all([
      unwrap<Profile[]>(
        supabase.from('profiles').select('*').eq('role', 'alumni').eq('status', 'approved').order('full_name'),
      ),
      unwrap<{ alum_id: string; used: number }[]>(supabase.rpc('alumni_slots_used')),
    ]);
    return { alumni, used: new Map(used.map((u) => [u.alum_id, u.used])) };
  }, []);

  const alumni = useMemo(() => data?.alumni ?? [], [data]);
  const sectors = useMemo(() => uniqueSorted(alumni.map((a) => a.sector)), [alumni]);
  const cities = useMemo(() => uniqueSorted(alumni.map((a) => a.city)), [alumni]);
  const years = useMemo(() => uniqueSorted(alumni.map((a) => a.grad_year)).reverse(), [alumni]);

  const atCapacity = (a: Profile) => (data?.used.get(a.id) ?? 0) >= a.monthly_cap;
  const filtering = Boolean(query || openOnly || sector || city || year);

  const shown = alumni.filter((a) => {
    const text = `${a.full_name} ${a.headline ?? ''} ${a.company ?? ''}`.toLowerCase();
    if (query && !text.includes(query.trim().toLowerCase())) return false;
    if (openOnly && (a.open_to.length === 0 || atCapacity(a))) return false;
    if (sector && a.sector !== sector) return false;
    if (city && a.city !== city) return false;
    if (year && String(a.grad_year) !== year) return false;
    return true;
  });

  function clear() {
    setQuery('');
    setOpenOnly(false);
    setSector('');
    setCity('');
    setYear('');
  }

  return (
    <>
      <PageHeader title="Directory" me={me}>
        <label className="search">
          <Icon name="search" size={20} />
          <input
            type="search"
            aria-label="Search alumni"
            placeholder="Search by name, firm or role"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="chips">
          <button className="chip" aria-pressed={!filtering} onClick={clear}>
            All
          </button>
          <button className="chip" aria-pressed={openOnly} onClick={() => setOpenOnly((v) => !v)}>
            Open to chats
          </button>
          <select className={sector ? 'chip active' : 'chip'} aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">Sector</option>
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className={city ? 'chip active' : 'chip'} aria-label="City" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">City</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className={year ? 'chip active' : 'chip'} aria-label="Class year" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Class year</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
      </PageHeader>

      <main className="content flush">
        {loading && <Loading label="Loading alumni" />}
        <ErrorNote>{error}</ErrorNote>
        {data && shown.length === 0 && (
          <Empty title={filtering ? 'No alumni match those filters' : 'No alumni have joined yet'}>
            {filtering ? 'Try clearing a filter or searching for something broader.' : 'Invite alumni to create an account, then approve them from the Admin page.'}
          </Empty>
        )}
        {shown.length > 0 && (
          <div className="list">
            {shown.map((a) => (
              <Link key={a.id} href={`/directory/${a.id}`} className="list-row">
                <Avatar name={a.full_name} />
                <div className="grow stack tight">
                  <div className="row-between" style={{ alignItems: 'baseline' }}>
                    <span className="strong" style={{ fontSize: 16 }}>
                      {a.full_name}
                    </span>
                    <span className="label" style={{ whiteSpace: 'nowrap' }}>
                      {[shortYear(a.grad_year), a.city].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <span className="small muted">
                    {[a.headline, a.company].filter(Boolean).join(' · ') || 'Profile not filled in yet'}
                  </span>
                  {a.open_to.length > 0 && (
                    <div className="tags" style={{ marginTop: 6 }}>
                      {atCapacity(a) ? (
                        <Tag tone="neutral">At capacity until {nextResetLabel()}</Tag>
                      ) : (
                        a.open_to.map((t) => <Tag key={t}>{requestLabel(t)}</Tag>)
                      )}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

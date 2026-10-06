import type { Audience, EventRow, RequestType } from './types';

/** House rules. Keep these in step with supabase/schema.sql. */
export const MAX_OPEN_REQUESTS = 3;
export const REQUEST_EXPIRY_DAYS = 14;

export const REQUEST_TYPES: { value: RequestType; label: string; detail?: string }[] = [
  { value: 'coffee_chat', label: 'Coffee chat', detail: '30 min video call' },
  { value: 'resume_review', label: 'Resume review' },
  { value: 'mock_interview', label: 'Mock interview' },
];

export const requestLabel = (t: RequestType) =>
  REQUEST_TYPES.find((r) => r.value === t)?.label ?? t;

export const AUDIENCE_LABEL: Record<Audience, string> = {
  alumni: 'Alumni only',
  members: 'Members only',
  all: 'Alumni + members',
};

export const SECTORS = [
  'Investment Banking',
  'Equity Research',
  'Asset Management',
  'Private Equity',
  'Hedge Fund',
  'Venture Capital',
  'Private Credit',
  'Consulting',
  'Corporate Finance',
  'Fintech',
  'Other',
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** 2019 -> '19 */
export const shortYear = (year: number | null) =>
  year ? `\u2019${String(year).slice(-2)}` : null;

export function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return 'Something went wrong. Try again.';
}

/** "Nov 1": the day monthly request slots reset. */
export function nextResetLabel(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function timeAgo(iso: string, now = new Date()) {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function messageTime(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function eventParts(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString(undefined, { month: 'short' }),
    day: String(d.getDate()),
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** Download a calendar file the phone or laptop can add to any calendar app. */
export function downloadIcs(ev: Pick<EventRow, 'id' | 'title' | 'description' | 'location' | 'starts_at' | 'ends_at'>) {
  const start = new Date(ev.starts_at);
  const end = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PCM Alumni Network//EN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@pcm-alumni-network`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(ev.title)}`,
    ev.location ? `LOCATION:${icsText(ev.location)}` : null,
    ev.description ? `DESCRIPTION:${icsText(ev.description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ev.title.replace(/[^\w]+/g, '-').toLowerCase() || 'event'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

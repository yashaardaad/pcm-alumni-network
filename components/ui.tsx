import Link from 'next/link';
import Image from 'next/image';
import { initials } from '@/lib/format';

const PATHS: Record<string, React.ReactNode> = {
  directory: (
    <>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
      <circle cx="10" cy="7.5" r="3.5" />
      <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6" />
    </>
  ),
  requests: (
    <>
      <path d="M4 13l2.5-7.5h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" />
      <path d="M4 13h4.5l1 2h5l1-2H20" />
    </>
  ),
  chat: <path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" />,
  events: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  back: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  dash: <path d="M6 12h12" />,
  hash: <path d="M9.5 4l-2 16M16.5 4l-2 16M4.5 9h16M3.5 15h16" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  send: <path d="M5 12h13M12.5 6l6 6-6 6" />,
};

export function Icon({ name, size = 24 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {initials(name)}
    </span>
  );
}

export function Tag({ tone = 'brand', children }: { tone?: 'brand' | 'neutral'; children: React.ReactNode }) {
  return <span className={tone === 'neutral' ? 'tag neutral' : 'tag'}>{children}</span>;
}

export function Logo({ width = 109 }: { width?: number }) {
  return (
    <Image
      src="/pcm-logo.png"
      alt="Plintus Capital Management"
      width={632}
      height={256}
      priority
      style={{ width, height: 'auto', display: 'block' }}
    />
  );
}

/** Top of each main tab: logo, title, and a slot on the right (defaults to your avatar). */
export function PageHeader({
  title,
  me,
  action,
  children,
}: {
  title: string;
  me: { full_name: string };
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-top">
        <div>
          <Logo />
          <h1 className="page-title">{title}</h1>
        </div>
        <div className="page-head-actions">
          {action}
          <Link href="/me" className="avatar-link" aria-label="Your profile">
            <Avatar name={me.full_name} />
          </Link>
        </div>
      </div>
      {children}
    </header>
  );
}

/** Top of a pushed screen: back arrow plus a title. */
export function BackHeader({ href, label, title }: { href: string; label: string; title?: string }) {
  return (
    <header className="back-head">
      <Link href={href} className="icon-btn" aria-label={`Back to ${label}`}>
        <Icon name="back" />
      </Link>
      {title ? <h1 className="back-title">{title}</h1> : <span className="muted">{label}</span>}
    </header>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="state" role="status">
      {label}…
    </p>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="error" role="alert">
      {children}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children ? <p className="muted">{children}</p> : null}
    </div>
  );
}

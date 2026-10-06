'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth';
import { Icon, Loading, Logo } from '@/components/ui';
import { isConfigured, supabase } from '@/lib/supabase';
import type { Conversation, Profile } from '@/lib/types';

const TABS = [
  { href: '/directory', label: 'Directory', icon: 'directory' },
  { href: '/requests', label: 'Requests', icon: 'requests' },
  { href: '/chat', label: 'Chat', icon: 'chat' },
  { href: '/events', label: 'Events', icon: 'events' },
] as const;

/** Everything in app/(app) is for signed-in, approved people. This layout enforces that. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, profile, ready, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isConfigured && ready && !session) router.replace('/login');
  }, [ready, session, router]);

  if (!isConfigured) {
    return (
      <Gate title="Connect your database">
        Add your Supabase project URL and key to <code>.env.local</code>, then restart the app. The
        README walks through it.
      </Gate>
    );
  }
  if (!ready || !session) return <Loading />;

  if (!profile) {
    return (
      <Gate title="Your profile could not be loaded" onSignOut={signOut}>
        Check your connection and reload. If this keeps happening, ask a club officer to check that
        the database setup script has been run.
      </Gate>
    );
  }
  if (profile.status === 'pending') {
    return (
      <Gate title="Your account is waiting for approval" onSignOut={signOut}>
        A club officer reviews every new account so the directory stays trusted. You will be able to
        sign in as soon as yours is approved.
      </Gate>
    );
  }
  if (profile.status === 'rejected') {
    return (
      <Gate title="This account was not approved" onSignOut={signOut}>
        If you think that is a mistake, contact a club officer.
      </Gate>
    );
  }

  // A chat thread takes the whole screen so the message box can sit at the bottom.
  const inThread = /^\/chat\/[^/]+$/.test(pathname);
  return (
    <div className={inThread ? 'app no-tabs' : 'app'}>
      {children}
      {!inThread && <TabBar profile={profile} pathname={pathname} />}
    </div>
  );
}

function Gate({
  title,
  children,
  onSignOut,
}: {
  title: string;
  children: React.ReactNode;
  onSignOut?: () => void;
}) {
  return (
    <main className="auth">
      <Logo width={150} />
      <h1 className="auth-title">{title}</h1>
      <p className="muted">{children}</p>
      {onSignOut && (
        <button className="btn" onClick={onSignOut}>
          Sign out
        </button>
      )}
    </main>
  );
}

function TabBar({ profile, pathname }: { profile: Profile; pathname: string }) {
  const [badges, setBadges] = useState({ requests: 0, chat: 0 });

  // Refresh the little counts whenever you move between screens.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [pending, conversations] = await Promise.all([
        profile.role === 'alumni'
          ? supabase
              .from('requests')
              .select('id', { count: 'exact', head: true })
              .eq('alum_id', profile.id)
              .eq('status', 'pending')
          : Promise.resolve({ count: 0 }),
        supabase.rpc('my_conversations'),
      ]);
      if (!alive) return;
      const rows = (conversations.data as Conversation[] | null) ?? [];
      setBadges({
        requests: pending.count ?? 0,
        chat: rows.reduce((sum, c) => sum + c.unread, 0),
      });
    })();
    return () => {
      alive = false;
    };
  }, [pathname, profile.id, profile.role]);

  return (
    <nav className="tabbar" aria-label="Primary">
      <div className="tabbar-inner">
        {TABS.map((tab) => {
          const count = tab.href === '/requests' ? badges.requests : tab.href === '/chat' ? badges.chat : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="tab"
              aria-current={pathname.startsWith(tab.href) ? 'page' : undefined}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
              {count > 0 && (
                <span className="badge tab-badge" aria-label={`${count} new`}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

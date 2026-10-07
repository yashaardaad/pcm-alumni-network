# PCM Alumni Network

A mobile-first web app for Plintus Capital Management that does three things:

1. **Connects current members with alumni** through a request flow, so alumni choose who they talk to and are never spammed.
2. **Keeps alumni in touch** with channels and direct messages.
3. **Lists events** for alumni, current members, or both, with RSVP and add-to-calendar.

Built with Next.js (App Router, TypeScript) and Supabase (Postgres, auth, live chat). It also sends email notifications (new request, request accepted, a weekly digest, and a daily admin approval reminder) via your own SMTP account.

## Set it up

You need Node.js 20 or newer and a free Supabase account.

1. **Create a Supabase project** at supabase.com.
2. **Create the database.** In the project, open the SQL Editor, paste in all of `supabase/schema.sql`, and run it once.
3. **Connect the app.** Copy `.env.example` to `.env.local` and fill in your project URL and publishable key (both are in the project's Connect dialog).
4. **Run it.**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000.
5. **Create your own account first.** The first account ever created becomes an approved admin. Everyone after that waits for an admin to approve them.

### Auth settings to check in Supabase

These live under Authentication in the dashboard (labels move around between dashboard versions):

- **Site URL and Redirect URLs.** Set the Site URL to where the app runs, and add `http://localhost:3000/**` and `https://your-domain/**` to the allowed redirect URLs. Confirmation and password-reset emails link back to these.
- **Confirm email.** On by default: new users must click a link in an email before they can sign in. You can switch it off while testing.
- **Email sending.** Supabase's built-in email is heavily rate limited and meant for testing. Before inviting the club, connect your own SMTP provider in the auth email settings.

### Put it online

Push the project to GitHub, import it into Vercel (or any host that runs Next.js), and add the same two environment variables there. Then update the Site URL in Supabase to your live address.

### Email notifications

People get an email when a request comes in or gets accepted, a weekly digest of open requests and unread chat, and admins get a daily reminder if any accounts are waiting for approval. None of this uses Supabase's Auth SMTP (that's only for signup/reset emails) — it's a separate mailer the app controls.

1. **Run the second schema file.** In the SQL Editor, paste in `supabase/notifications.sql` and run it. Before running, replace the two placeholder values in the `insert into public.app_config` statement near the top: `webhook_url` (your deployed app's `/api/notify` address) and `webhook_secret` (see below).
2. **Set these environment variables** on Vercel (and in `.env.local` for local testing) — see `.env.example` for the full list: `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `APP_URL`, `NOTIFY_WEBHOOK_SECRET`, `CRON_SECRET`.
3. **Generate the two secrets** with `openssl rand -hex 32`: one becomes `NOTIFY_WEBHOOK_SECRET` (must match the `webhook_secret` value from step 1 exactly) and the other becomes `CRON_SECRET` (Vercel sends it automatically as a bearer token when it runs the cron jobs below — nothing else to configure).
4. **Cron schedule** lives in `vercel.json`: the weekly digest and the daily approval reminder. Times are UTC, so they'll drift about an hour across daylight saving.

If you ever change the app's domain, update the `webhook_url` row in `app_config` (SQL Editor: `update public.app_config set value = '...' where key = 'webhook_url';`) and the `APP_URL` environment variable to match.

### Resumes

Current members can upload one resume (PDF, up to 5 MB) from their profile page; any approved signed-in user, including alumni, can view it (so an alum can review it), same as the rest of a profile. Alumni do not get this option. Run `supabase/resumes.sql` once in the SQL Editor to create the storage bucket and its access rules. No new environment variables needed.

## How it works

**Accounts.** People sign up as a current member or an alum. An admin approves each account on the Admin page (reached from your profile) and can correct the role. People cannot change their own role, status or admin flag.

**Requests.** A member opens an alum's profile and sends a structured request (type, topic, short message, availability). The alum accepts or declines. Accepting opens a private thread that starts with the member's request.

| Rule | Value | Where to change it |
| --- | --- | --- |
| Open requests per member | 3 | `create_request` in `schema.sql`, `MAX_OPEN_REQUESTS` in `lib/format.ts` |
| Alum monthly cap (counts accepted requests) | 3 by default, each alum sets their own | `monthly_cap` default in `schema.sql` |
| Request expiry | 14 days | `expire_stale_requests` and `respond_to_request` in `schema.sql`, `REQUEST_EXPIRY_DAYS` in `lib/format.ts` |

**Chat.** Channels are alumni-only unless marked "Alumni and members". Alumni can message each other directly. Members can only reach an alum privately through an accepted request. Admins who are current members can create and delete channels but cannot read alumni-only messages.

**Events.** Alumni and admins can post. Each event is visible to alumni, members, or both.

**Yearly rollover.** On the Admin page, enter a class year to move every current member in that class to alumni.

**Security.** Every rule above is enforced in the database with row level security and server-side functions, not just in the interface. The browser only ever holds the publishable key.

## Project map

```
supabase/schema.sql        Tables, access rules and the functions behind requests, chat and admin
app/login, app/reset       Sign in, sign up, password reset
app/(app)/layout.tsx       Gate for signed-in, approved users, plus the tab bar
app/(app)/directory        Alumni list, profile, new request
app/(app)/requests         Inbox for alumni, sent requests for members
app/(app)/chat             Channel and DM list, live thread
app/(app)/events           Event list, RSVP, post an event
app/(app)/me               Edit your profile, sign out
app/(app)/admin            Approvals, roles, rollover, channels
components/, lib/          Shared UI, auth state, types and helpers
app/globals.css            All styling (PCM colours and type)
```

## What has been tested

- The schema was loaded into Postgres and checked role by role: pending, member, alum, admin and signed-out.
- The full flow was run in a headless browser at phone size against the same auth server (GoTrue) and API server (PostgREST) that Supabase uses: sign up, approval, profile edit, request, accept, threads, channels, events, RSVP, sign out and back in.

Not tested, so check these on your own project first:

- **Live message delivery.** It uses Supabase Realtime, which was not part of the local test. Messages still appear on reload if it is misconfigured.
- **Email confirmation and password reset**, which need real email delivery.

## Not built yet

- Email notifications for new requests, replies and events, and a weekly digest. This is the most important next step: alumni will not check the app daily.
- Moderation: deleting other people's messages, reporting, blocking.
- Profile photos and file attachments (for example a resume on a review request).
- Loading chat history beyond the latest 100 messages, and search within chat.
- Editing an event after posting it.
- Offline support and push notifications. The app can be added to a phone's home screen but needs a connection.

## Swap the logo

`public/pcm-logo.png` was cut out of a small screenshot, so it is soft at large sizes. Replace it with the original artwork (transparent PNG, any size with the same proportions works) and replace `public/icon-192.png`, `public/icon-512.png`, `app/icon.png` and `app/apple-icon.png` with proper app icons.

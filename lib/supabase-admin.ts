import { createClient } from '@supabase/supabase-js';

/**
 * Server-only client using the service role key: bypasses row level security.
 * Never import this from a file that can run in the browser.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'missing-key',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

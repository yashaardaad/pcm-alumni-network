import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase's newer "publishable" key and the older "anon" key both work here.
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key');

/** Await a Supabase query and throw its error, so callers can use try/catch. */
export async function unwrap<T>(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

/** Run a Supabase query without waiting for it. Queries are lazy: they only send once awaited. */
export function fire(query: PromiseLike<unknown>) {
  void Promise.resolve(query).then(
    () => {},
    () => {},
  );
}

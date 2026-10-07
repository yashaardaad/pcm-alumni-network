import { supabase } from './supabase';

const BUCKET = 'resumes';
const SIGNED_URL_TTL = 60 * 60; // 1 hour

const path = (userId: string) => `${userId}.pdf`;

/** Null if this person has no resume uploaded, or the viewer cannot read it. */
export async function getResumeUrl(userId: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path(userId), SIGNED_URL_TTL);
  if (error) return null;
  return data.signedUrl;
}

export async function uploadResume(userId: string, file: File) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path(userId), file, { upsert: true, contentType: 'application/pdf' });
  if (error) throw new Error(error.message);
}

export async function removeResume(userId: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path(userId)]);
  if (error) throw new Error(error.message);
}

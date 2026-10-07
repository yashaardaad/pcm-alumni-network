import { supabase } from './supabase';

const BUCKET = 'event-files';
const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_EVENT_FILES = 3;

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

/** Browsers report unreliable (or empty) MIME types for legacy Office formats, so go by extension. */
export function isAllowedEventFile(file: File) {
  return file.size <= MAX_BYTES && extensionOf(file.name) in EXTENSION_MIME;
}

export async function uploadEventFile(eventId: string, userId: string, file: File) {
  const contentType = EXTENSION_MIME[extensionOf(file.name)] ?? file.type;
  const path = `${eventId}/${crypto.randomUUID()}-${file.name}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType });
  if (upErr) throw new Error(upErr.message);

  const { error: dbErr } = await supabase.from('event_files').insert({
    event_id: eventId,
    storage_path: path,
    file_name: file.name,
    content_type: contentType,
    size_bytes: file.size,
    uploaded_by: userId,
  });
  if (dbErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(dbErr.message);
  }
}

export async function removeEventFile(id: string, storagePath: string) {
  const { error } = await supabase.from('event_files').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([storagePath]);
}

export async function getEventFileUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

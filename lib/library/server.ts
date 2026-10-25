import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { applyCommand, emptyState, publishState, stateSchema, writeSchema } from './model';

export class LibraryError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && /^[0-9a-f-]{36}$/i.test(process.env.LIBRARY_OWNER_ID ?? ''));
}
export async function libraryClient() {
  if (!configured()) throw new LibraryError('The library database is not connected yet.', 503);
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => { try { for (const { name, value, options } of values) jar.set(name, value, { ...options, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }); } catch { /* Server Components are read-only; proxy refreshes cookies. */ } },
    },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store', signal: options?.signal ?? AbortSignal.timeout(12000) }) },
  });
}
export async function ownerSession(required = false) {
  const client = await libraryClient();
  const { data, error } = await client.auth.getUser();
  const owner = !error && data.user?.id === process.env.LIBRARY_OWNER_ID;
  if (required && !owner) throw new LibraryError('Sign in as the library owner to continue.', 401);
  return { client, owner: Boolean(owner) };
}
export async function readLibrary(required = false) {
  const { client, owner } = await ownerSession(required);
  const table = owner ? 'library_state' : 'library_public';
  const { data, error } = await client.from(table).select('document,revision').eq('owner_id', process.env.LIBRARY_OWNER_ID!).maybeSingle();
  if (error) throw new LibraryError('The library could not be loaded. Check the database setup and try again.', 503);
  return { state: data ? stateSchema.parse(data.document) : emptyState(), revision: owner ? Number(data?.revision ?? 0) : 0, owner };
}
export async function writeLibrary(raw: unknown, trakt?: { generation: string; lease: string }) {
  const input = writeSchema.parse(raw);
  const { client } = await ownerSession(true);
  const { data, error } = await client.from('library_state').select('document,revision').eq('owner_id', process.env.LIBRARY_OWNER_ID!).maybeSingle();
  if (error) throw new LibraryError('Your library could not be loaded. Your changes have not been saved.', 503);
  const previous = data ? stateSchema.parse(data.document) : emptyState();
  const revision = Number(data?.revision ?? 0);
  if (previous.applied.includes(input.requestId)) return { state: previous, revision, owner: true };
  if (input.revision !== revision) throw new LibraryError('Your library changed on another device. Refresh the library, then retry; your draft is still here.', 409);
  const state = applyCommand(previous, input.command, input.requestId);
  const saved = await client.rpc(trakt ? 'library_trakt_save' : 'library_save', { expected_revision: revision, next_document: state, public_document: publishState(state), ...(trakt ? { expected_generation: trakt.generation, expected_lease: trakt.lease } : {}) });
  if (saved.error) {
    if (saved.error.code === '40001') throw new LibraryError('Your library changed on another device. Refresh and retry; your draft is still here.', 409);
    throw new LibraryError('Saving failed. Your input is still here; check your connection and try again.', 503);
  }
  return { state, revision: Number(saved.data), owner: true };
}

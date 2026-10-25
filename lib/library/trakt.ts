import 'server-only';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ownerSession, readLibrary, writeLibrary, LibraryError } from './server';
import { catalogDetails } from './catalog';
import { privateHeaders } from './http';
import { traktRequestHeaders } from './trakt-request';
import type { TraktFailureReason } from './trakt-messages';
import { entryFlags, hash, historyEntry, historySchema, pkce, seal, unseal, type TraktPreview } from './trakt-core';

const cookieName = '__Host-library-trakt';
const tokenSchema = z.object({ access_token: z.string().min(1).max(4096), refresh_token: z.string().min(1).max(4096), expires_in: z.number().int().positive(), created_at: z.number().int().positive() });
type Token = z.infer<typeof tokenSchema>;
type Connection = { generation: string; lease_nonce: string; account_key: string; username: string; credentials: string; preview: TraktPreview | null; last_checked_at: string | null; last_imported_at: string | null };
const ownerId = () => process.env.LIBRARY_OWNER_ID!;
const key = () => process.env.TRAKT_ENCRYPTION_KEY!;
const context = (generation: string) => `library:trakt:${ownerId()}:${generation}`;
export function traktConfigured() { return Boolean(process.env.TRAKT_CLIENT_ID && /^https:\/\//.test(process.env.TRAKT_REDIRECT_URI ?? '') && /^[a-f0-9]{64}$/i.test(key() ?? '')); }
function callback() {
  if (!traktConfigured()) throw new LibraryError('Trakt connection settings are not ready yet.', 503);
  const url = new URL(process.env.TRAKT_REDIRECT_URI!);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/library/trakt/callback') throw new LibraryError('Trakt needs the registered HTTPS callback.', 503);
  return url;
}
function sameHost(request: NextRequest) { if (request.nextUrl.origin !== callback().origin) throw new LibraryError('Connect Trakt from the deployed HTTPS library. Local sign-in is not available for this connection.', 409); }
async function connection() {
  const { client } = await ownerSession(true);
  const result = await client.from('library_trakt').select('*').eq('owner_id', ownerId()).maybeSingle();
  if (result.error) throw new LibraryError('Trakt storage is not ready. Apply the connection database migration before connecting.', 503);
  return { client, row: result.data as Connection | null };
}
function credentials(row: Connection): Token {
  try { return tokenSchema.parse(unseal(row.credentials, key(), context(row.generation))); }
  catch { throw new LibraryError('The saved Trakt connection cannot be opened. Check the server encryption key or reconnect.', 503); }
}
async function external(url: string, init: RequestInit = {}) {
  let response: Response;
  try { response = await fetch(url, { ...init, headers: traktRequestHeaders(process.env.TRAKT_CLIENT_ID!, init.headers), cache: 'no-store', signal: AbortSignal.timeout(12000), redirect: 'error' }); }
  catch { throw new LibraryError('Trakt could not be reached. Your library is unchanged. Try again.', 502); }
  if (response.status === 429) throw new LibraryError('Trakt is limiting requests. Wait before trying again; your library is unchanged.', 429);
  if (response.status === 400 || response.status === 401) throw new LibraryError('Trakt authorization expired or was withdrawn. Disconnect and connect again.', 401);
  if (!response.ok) throw new LibraryError('Trakt could not complete the request. Your library is unchanged.', 502);
  return response;
}
async function exchange(value: Record<string, string>) {
  const response = await external('https://auth.trakt.tv/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...value, client_id: process.env.TRAKT_CLIENT_ID, redirect_uri: callback().href }) });
  try { return tokenSchema.parse(await response.json()); }
  catch { throw new LibraryError('Trakt returned an incomplete authorization response. Reconnect to try again.', 502); }
}
async function api(path: string, token: Token) {
  return external(`https://api.trakt.tv/${path}`, { headers: { Authorization: `Bearer ${token.access_token}`, 'trakt-api-key': process.env.TRAKT_CLIENT_ID!, 'trakt-api-version': '2', Accept: 'application/json' } });
}
export async function traktStatus(request: NextRequest) {
  await ownerSession(true);
  if (!traktConfigured()) return { configured: false, canConnect: false, connected: false, message: 'Trakt setup is not ready yet.' };
  const { row } = await connection();
  const stateForStatus = row?.preview ? (await readLibrary(true)).state : null;
  const preview = row?.preview ? { ...row.preview, entries: row.preview.entries.map(v => ({ entry: v.entry, ...entryFlags(stateForStatus, v.entry) })) } : null;
  return { configured: true, canConnect: request.nextUrl.origin === callback().origin, connected: Boolean(row), username: row?.username, lastChecked: row?.last_checked_at, lastImported: row?.last_imported_at, preview,
    message: request.nextUrl.origin !== callback().origin ? 'Sign-in requires the deployed HTTPS library. This local page cannot connect Trakt.' : null };
}
export async function startTrakt(request: NextRequest) {
  sameHost(request);
  const { row } = await connection();
  if (row) throw new LibraryError('Disconnect the current Trakt account before connecting another.', 409);
  const { verifier, challenge } = pkce(), state = randomBytes(32).toString('base64url');
  (await cookies()).set(cookieName, seal({ verifier, state, owner: ownerId(), expires: Date.now() + 600000 }, key(), 'library:trakt:oauth'), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  const url = new URL('https://auth.trakt.tv/oauth/authorize');
  url.search = new URLSearchParams({ client_id: process.env.TRAKT_CLIENT_ID!, redirect_uri: callback().href, response_type: 'code', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  return { url: url.href };
}
export async function finishTrakt(request: NextRequest) {
  const jar = await cookies(), saved = jar.get(cookieName)?.value;
  jar.set(cookieName, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  const returnUrl = new URL('/admin/library?view=settings', callback().origin);
  let stage: TraktFailureReason = 'origin';
  try {
    sameHost(request);
    stage = 'session';
    const { client, row } = await connection();
    if (row) {
      returnUrl.searchParams.set('trakt', 'connected');
      return NextResponse.redirect(returnUrl, { status: 303, headers: { ...privateHeaders, 'Referrer-Policy': 'no-referrer' } });
    }
    stage = 'attempt';
    if (!saved) throw new Error('Missing connection attempt.');
    const attempt = z.object({ verifier: z.string(), state: z.string(), owner: z.string(), expires: z.number() }).parse(unseal(saved, key(), 'library:trakt:oauth'));
    if (attempt.expires < Date.now()) { stage = 'expired'; throw new Error('Expired connection attempt.'); }
    stage = 'state';
    const state = request.nextUrl.searchParams.get('state') ?? '';
    const receivedState = Buffer.from(state), expectedState = Buffer.from(attempt.state);
    if (attempt.owner !== ownerId() || receivedState.length !== expectedState.length || !timingSafeEqual(receivedState, expectedState)) throw new Error('Authorization could not be verified.');
    if (request.nextUrl.searchParams.has('error')) { stage = 'cancelled'; throw new Error('Authorization was not approved.'); }
    stage = 'code';
    const code = request.nextUrl.searchParams.get('code');
    if (!code || code.length > 4096) throw new Error('Missing authorization code.');
    stage = 'token';
    const token = await exchange({ code, code_verifier: attempt.verifier, grant_type: 'authorization_code' });
    stage = 'profile';
    const response = await api('users/settings', token);
    const profile = z.object({ user: z.object({ username: z.string().max(150), ids: z.object({ uuid: z.string().min(1).max(100) }) }) }).parse(await response.json());
    const generation = randomUUID();
    stage = 'save';
    const result = await client.from('library_trakt').insert({ owner_id: ownerId(), generation, account_key: hash(profile.user.ids.uuid), username: profile.user.username, credentials: seal(token, key(), context(generation)) });
    if (result.error) throw new Error('The connection was not saved.');
    returnUrl.searchParams.set('trakt', 'connected');
  } catch (error) {
    // Deliberately omit URLs, request bodies, cookies, credentials and raw errors.
    console.warn('library-trakt-connect-failed', { stage, status: error instanceof LibraryError ? error.status : null });
    returnUrl.searchParams.set('trakt', 'failed');
    returnUrl.searchParams.set('trakt_reason', stage);
  }
  return NextResponse.redirect(returnUrl, { status: 303, headers: { ...privateHeaders, 'Referrer-Policy': 'no-referrer' } });
}
// A database lease serializes single-use refreshes across server instances and devices.
async function withConnection<T>(operation: (row: Connection, token: Token, update: (patch: Record<string, unknown>) => Promise<void>) => Promise<T>) {
  const { client, row: initial } = await connection();
  if (!initial) throw new LibraryError('Connect your Trakt account first.', 409);
  const nonce = randomUUID();
  const acquired = await client.from('library_trakt').update({ lease_nonce: nonce, lease_until: new Date(Date.now() + 120000).toISOString() }).eq('owner_id', ownerId()).eq('generation', initial.generation).lt('lease_until', new Date().toISOString()).select('*');
  if (acquired.error || !acquired.data?.length) throw new LibraryError('Another Trakt request is running. Try again shortly.', 409);
  const row = acquired.data[0] as Connection;
  const update = async (patch: Record<string, unknown>) => {
    const saved = await client.from('library_trakt').update(patch).eq('owner_id', ownerId()).eq('generation', row.generation).eq('lease_nonce', nonce).select('generation');
    if (saved.error || !saved.data?.length) throw new LibraryError('The Trakt connection changed. Refresh before trying again.', 409);
    Object.assign(row, patch);
  };
  try {
    let token = credentials(row);
    if ((token.created_at + token.expires_in) * 1000 <= Date.now() + 120000) {
      token = await exchange({ grant_type: 'refresh_token', refresh_token: token.refresh_token });
      await update({ credentials: seal(token, key(), context(row.generation)) });
    }
    return await operation(row, token, update);
  } finally { await client.from('library_trakt').update({ lease_nonce: null, lease_until: new Date().toISOString() }).eq('owner_id', ownerId()).eq('generation', row.generation).eq('lease_nonce', nonce); }
}
export async function previewTrakt(page: number, timezone: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new LibraryError('Choose a valid timezone.'); }
  return withConnection(async (row, token, update) => {
    const response = await api(`users/me/history/?page=${page}&limit=50`, token);
    const history = historySchema.parse(await response.json());
    const deadline = Date.now() + 45000;
    const pages = Number(response.headers.get('X-Pagination-Page-Count')), total = Number(response.headers.get('X-Pagination-Item-Count'));
    if (!response.headers.has('X-Pagination-Page-Count') || !Number.isSafeInteger(pages) || pages < 0 || pages > 10000 || !response.headers.has('X-Pagination-Item-Count') || !Number.isSafeInteger(total) || total < 0) throw new LibraryError('Trakt pagination could not be verified. No history has been imported.', 502);
    const { state } = await readLibrary(true);
    const preview: TraktPreview = { id: randomUUID(), page, pages: Math.max(1, pages), total, timezone, checkedAt: new Date().toISOString(), entries: [], skipped: [] };
    const works = new Map<string, Awaited<ReturnType<typeof catalogDetails>>>();
    // Sequential unique-title resolution bounds provider traffic and keeps failures visible.
    for (const item of history) {
      if (Date.now() > deadline) throw new LibraryError('This history page took too long to resolve. No watches were imported; retry this page.', 504);
      const media = item.type === 'movie' ? item.movie : item.type === 'episode' ? item.show : null;
      const title = media?.title ?? 'Unknown title';
      if (!media?.ids.tmdb) { preview.skipped.push({ title, reason: 'No verified TMDB title. Add this title manually.' }); continue; }
      const type = item.type === 'movie' ? 'movies' : 'tv', id = String(media.ids.tmdb), cacheKey = `${type}:${id}`;
      let work = works.get(cacheKey);
      if (!work) { work = await catalogDetails(type, id); works.set(cacheKey, work); }
      if (state.works.some(w => w.id !== work.id && w.type === work.type && w.year === work.year && w.title.toLocaleLowerCase() === work.title.toLocaleLowerCase())) { preview.skipped.push({ title, reason: 'An existing title uses a different catalog ID. Review the match manually to keep your records together.' }); continue; }
      if (preview.entries.some(v => v.entry.work.id === work.id)) continue;
      const entry = historyEntry(item, work, row.account_key, timezone);
      preview.entries.push({ entry, ...entryFlags(state, entry) });
    }
    await update({ preview, last_checked_at: preview.checkedAt });
    return preview;
  });
}
export async function importTrakt(input: { previewId: string; selected: string[]; revision: number; requestId: string }) {
  return withConnection(async (row, _token, update) => {
    const preview = row.preview;
    if (!preview || preview.id !== input.previewId) throw new LibraryError('This review was replaced. Check for watches again.', 409);
    if (Date.now() - Date.parse(preview.checkedAt) > 3600000) throw new LibraryError('This review expired. Check for watches again.', 409);
    const entries = preview.entries.filter(v => input.selected.includes(v.entry.event.id) && !v.duplicate && !v.removed).map(v => v.entry);
    if (entries.length !== input.selected.length || new Set(input.selected).size !== input.selected.length) throw new LibraryError('Choose only new watches from this review.');
    const result = await writeLibrary({ revision: input.revision, requestId: input.requestId, command: { op: 'trakt-import', entries } }, { generation: row.generation, lease: row.lease_nonce });
    // Library mutation is idempotent. A lost metadata update never duplicates an import.
    try { await update({ last_imported_at: new Date().toISOString() }); return result; }
    catch { return { ...result, warning: 'Watches were saved, but connection status could not be updated. Refresh the connection before the next import.' }; }
  });
}
export async function disconnectTrakt() {
  const { client, row } = await connection();
  if (!row) return { disconnected: true, revoked: true };
  let revoked = false;
  try { const token = credentials(row); await external('https://auth.trakt.tv/oauth/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.TRAKT_CLIENT_ID, token: token.access_token }) }); revoked = true; } catch { /* Always remove local access even if Trakt cannot be reached. */ }
  const result = await client.from('library_trakt').delete().eq('owner_id', ownerId()).eq('generation', row.generation);
  if (result.error) throw new LibraryError('Disconnect could not be saved. Try again.', 503);
  return { disconnected: true, revoked };
}

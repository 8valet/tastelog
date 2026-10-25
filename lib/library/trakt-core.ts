import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { traktEntrySchema, type LibraryState, type Work } from './model.ts';

export function seal(value: unknown, key: string, context: string) {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('Trakt encryption is not configured.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}
export function unseal(value: string, key: string, context: string): unknown {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('Trakt encryption is not configured.');
  const pieces = value.split('.');
  if (pieces.length !== 3) throw new Error('Invalid encrypted connection.');
  const [iv, tag, data] = pieces.map(b => Buffer.from(b, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'));
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function pkce() { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; }
const ids = z.object({ tmdb: z.number().int().positive().nullish(), imdb: z.string().nullish(), trakt: z.number().int().positive().optional() }).passthrough();
const title = z.object({ title: z.string().max(500), ids }).passthrough();
export const historySchema = z.array(z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), watched_at: z.string().datetime({ offset: true }),
  type: z.string(), movie: title.optional(), show: title.optional(),
  episode: z.object({ season: z.number().int().min(0), number: z.number().int().min(0) }).passthrough().optional(),
}).passthrough()).max(50);
export type TraktEntry = z.infer<typeof traktEntrySchema>;
export type TraktPreview = { id: string; page: number; pages: number; total: number; checkedAt: string; timezone: string; entries: { entry: TraktEntry; duplicate: boolean; removed: boolean }[]; skipped: { title: string; reason: string }[] };
export function watchDate(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)?.value).join('-');
}
export function historyEntry(row: z.infer<typeof historySchema>[number], work: Work, account: string, timezone: string): TraktEntry {
  const watchedAt = new Date(row.watched_at).toISOString();
  return traktEntrySchema.parse({ work, event: {
    id: `trakt:${hash(`${account}:${row.id}`)}`, workId: work.id, date: watchDate(watchedAt, timezone), rating: null, review: '', spoiler: false,
    visibility: 'private', kind: 'watch', episodeFrom: null, episodeTo: null,
    season: 1, source: { provider: 'trakt', account, eventId: String(row.id), watchedAt },
  } });
}
export function entryFlags(state: LibraryState, entry: TraktEntry) {
  return { duplicate: state.events.some(e => (entry.work.type === 'tv' && e.workId === entry.work.id && e.source?.provider === 'trakt') || e.id === entry.event.id || (e.source?.account === entry.event.source.account && e.source?.eventId === entry.event.source.eventId)), removed: Boolean(state.records.find(r => r.workId === entry.work.id)?.deletedAt) };
}

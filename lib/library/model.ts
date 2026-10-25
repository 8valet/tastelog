import { z } from 'zod';
import { matchesTitle } from './text.ts';
// Use the interpreter rather than probing new Function under the browser CSP.
z.config({ jitless: true });
export class LibraryCommandError extends Error {}

export const types = ['movies', 'tv', 'anime', 'games'] as const;
export const statuses = ['backlog', 'wishlist', 'active', 'completed', 'paused', 'dropped'] as const;
export const typeNames = { movies: 'Movies', tv: 'TV shows', anime: 'Anime', games: 'Games' };
const id = z.string().min(1).max(180).regex(/^[a-zA-Z0-9:_-]+$/);
const stamp = z.string().datetime();
const score = z.number().min(.5).max(5).multipleOf(.5).nullable();
const image = z.string().max(1500).refine(v => !v || /^\/links\//.test(v) || /^\/library\//.test(v) || /^https:\/\//.test(v), 'Use an HTTPS image URL.');
export const workSchema = z.object({
  id, type: z.enum(types), title: z.string().trim().min(1).max(500), year: z.number().int().min(1800).max(2200).nullable(),
  poster: image, genres: z.array(z.string().trim().min(1).max(80)).max(30),
  episodes: z.number().int().min(0).max(100000).nullable(), seasons: z.number().int().min(0).max(10000).nullable(),
  summary: z.string().max(10000), provider: z.enum(['manual', 'tmdb', 'mal', 'igdb']), providerId: z.string().max(100),
  sourceUrl: z.string().max(1500).refine(v => !v || /^https:\/\//.test(v)),
  aliases: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
}).strict();
export const recordSchema = z.object({
  workId: id, status: z.enum(statuses), rating: score, visibility: z.enum(['private', 'public']),
  favorite: z.number().int().min(1).max(10000).nullable(), notes: z.string().max(20000),
  episodes: z.number().int().min(0).max(100000), season: z.number().int().min(1).max(10000),
  platform: z.string().max(100), hours: z.number().min(0).max(100000).nullable(),
  addedAt: stamp, updatedAt: stamp, deletedAt: stamp.nullable(),
}).strict();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(new Date(v).getTime()) && new Date(v).toISOString().slice(0, 10) === v, 'Choose a valid date.').nullable();
export const eventSchema = z.object({
  id, workId: id, date, rating: score, review: z.string().max(20000), spoiler: z.boolean(),
  visibility: z.enum(['private', 'public']), kind: z.enum(['watch', 'completion', 'episodes']),
  episodeFrom: z.number().int().min(1).max(100000).nullable(), episodeTo: z.number().int().min(1).max(100000).nullable(),
  season: z.number().int().min(1).max(10000), createdAt: stamp, updatedAt: stamp, deletedAt: stamp.nullable(),
  source: z.object({ provider: z.literal('trakt'), account: z.string().regex(/^[a-f0-9]{64}$/), eventId: z.string().regex(/^\d{1,20}$/), watchedAt: stamp }).strict().optional(),
}).strict();
export const listSchema = z.object({
  id, name: z.string().trim().min(1).max(150), description: z.string().max(5000),
  visibility: z.enum(['private', 'public']), workIds: z.array(id).max(5000), updatedAt: stamp, deletedAt: stamp.nullable(),
}).strict();
export const stateSchema = z.object({
  works: z.array(workSchema).max(5000), records: z.array(recordSchema).max(5000),
  events: z.array(eventSchema).max(20000), lists: z.array(listSchema).max(1000), applied: z.array(id).max(100),
}).strict().superRefine((s, ctx) => {
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', message: `Duplicate ${label}.` });
  };
  unique(s.works.map(w => w.id), 'titles'); unique(s.records.map(r => r.workId), 'records');
  unique(s.events.map(e => e.id), 'events'); unique(s.lists.map(l => l.id), 'lists');
  const works = new Set(s.works.map(w => w.id));
  for (const r of [...s.records, ...s.events]) if (!works.has(r.workId)) ctx.addIssue({ code: 'custom', message: 'An entry references a missing title.' });
  for (const l of s.lists) {
    unique(l.workIds, 'list titles');
    if (l.workIds.some(w => !works.has(w))) ctx.addIssue({ code: 'custom', message: 'A list references a missing title.' });
  }
  for (const e of s.events) if (e.kind === 'episodes' && (!e.episodeFrom || !e.episodeTo || e.episodeTo < e.episodeFrom)) ctx.addIssue({ code: 'custom', message: 'Check the episode range.' });
});
export type Work = z.infer<typeof workSchema>;
export type LibraryRecord = z.infer<typeof recordSchema>;
export type DiaryEvent = z.infer<typeof eventSchema>;
export type LibraryList = z.infer<typeof listSchema>;
export type LibraryState = z.infer<typeof stateSchema>;
export const emptyState = (): LibraryState => ({ works: [], records: [], events: [], lists: [], applied: [] });
const recordPatch = recordSchema.omit({ workId: true, addedAt: true, updatedAt: true, deletedAt: true }).partial();
const eventInput = eventSchema.omit({ createdAt: true, updatedAt: true, deletedAt: true, source: true });
export const traktEntrySchema = z.object({ work: workSchema, event: eventSchema.omit({ createdAt: true, updatedAt: true, deletedAt: true }).extend({ source: eventSchema.shape.source.unwrap() }) }).strict();
const listInput = listSchema.omit({ updatedAt: true, deletedAt: true });
export const commandSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('reconcile'), sourceId: id, work: workSchema, recordFrom: z.enum(['source', 'target']) }).strict(),
  z.object({ op: z.literal('metadata'), work: workSchema }).strict(),
  z.object({ op: z.literal('trakt-import'), entries: z.array(traktEntrySchema).min(1).max(50) }).strict(),
  z.object({ op: z.literal('save'), work: workSchema, patch: recordPatch }).strict(),
  z.object({ op: z.literal('edit'), workId: id, patch: recordPatch }).strict(),
  z.object({ op: z.literal('remove'), workId: id, restore: z.boolean() }).strict(),
  z.object({ op: z.literal('log'), work: workSchema, event: eventInput, updateRating: z.boolean() }).strict(),
  z.object({ op: z.literal('event'), event: eventInput }).strict(),
  z.object({ op: z.literal('event-delete'), id, restore: z.boolean() }).strict(),
  z.object({ op: z.literal('list'), list: listInput }).strict(),
  z.object({ op: z.literal('list-delete'), id, restore: z.boolean() }).strict(),
  z.object({ op: z.literal('favorites'), type: z.enum(types), workIds: z.array(id).max(1000) }).strict(),
  z.object({ op: z.literal('restore'), state: stateSchema }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const writeSchema = z.object({ revision: z.number().int().min(0), requestId: id, command: commandSchema }).strict();

export function applyCommand(input: LibraryState, raw: unknown, requestId: string, now = new Date().toISOString()): LibraryState {
  const command = commandSchema.parse(raw);
  if (input.applied.includes(requestId)) return input;
  let s = structuredClone(input);
  const requireRecord = (workId: string) => {
    const r = s.records.find(r => r.workId === workId && !r.deletedAt);
    if (!r) throw new LibraryCommandError('This title is no longer in your collection. Refresh and try again.');
    return r;
  };
  const save = (work: Work, patch: Partial<LibraryRecord>) => {
    const existingWork = s.works.find(w => w.id === work.id);
    if (existingWork) { if (existingWork.type !== work.type) throw new LibraryCommandError('The title category cannot change.'); if (existingWork.provider === 'manual' && work.provider === 'manual') Object.assign(existingWork, work); }
    else s.works.push(work);
    let r = s.records.find(r => r.workId === work.id);
    if (!r) {
      r = { workId: work.id, status: 'backlog', rating: null, visibility: 'private', favorite: null, notes: '', episodes: 0, season: 1, platform: '', hours: null, addedAt: now, updatedAt: now, deletedAt: null };
      s.records.push(r);
    }
    Object.assign(r, patch, { updatedAt: now, deletedAt: null });
    return r;
  };
  switch (command.op) {
    case 'metadata': {
      const work = s.works.find(w => w.id === command.work.id);
      if (!work) throw new LibraryCommandError('Title not found.');
      if (work.provider !== command.work.provider || work.providerId !== command.work.providerId) throw new LibraryCommandError('Use catalog matching to change a title’s identity.');
      if (work.provider !== 'manual' && work.type !== command.work.type) throw new LibraryCommandError('Choose the correct catalog to change this category.');
      Object.assign(work, command.work);
      break;
    }
    case 'reconcile': {
      const source = s.works.find(w => w.id === command.sourceId);
      if (!source) throw new LibraryCommandError('The original title was not found.');
      const target = s.works.find(w => w.id === command.work.id);
      const aliases = [...new Set([...(command.work.aliases || []), ...(target?.aliases || []), ...(source.aliases || []), source.title])].filter(t => t !== command.work.title);
      const replacement = { ...command.work, aliases };
      if (source.id === replacement.id) { Object.assign(source, replacement); break; }
      const sourceRecord = s.records.find(r => r.workId === source.id);
      const targetRecord = s.records.find(r => r.workId === replacement.id);
      if (sourceRecord?.deletedAt || targetRecord?.deletedAt) throw new LibraryCommandError('Restore removed titles before merging them.');
      if (sourceRecord && targetRecord) {
        const selected = command.recordFrom === 'source' ? sourceRecord : targetRecord;
        const other = command.recordFrom === 'source' ? targetRecord : sourceRecord;
        const history = `\n\nMerged title record (${now})\n${JSON.stringify({ title: source.title, target: replacement.title, original: sourceRecord, existing: targetRecord }, null, 2)}`;
        const notes = `${selected.notes}${other.notes && other.notes !== selected.notes ? `\n\nOther title notes:\n${other.notes}` : ''}${history}`;
        if (notes.length > 20000) throw new LibraryCommandError('The combined notes exceed the limit. Export a backup and shorten notes before merging.');
        Object.assign(targetRecord, selected, { workId: replacement.id, notes, visibility: sourceRecord.visibility === 'private' || targetRecord.visibility === 'private' ? 'private' : 'public', addedAt: sourceRecord.addedAt < targetRecord.addedAt ? sourceRecord.addedAt : targetRecord.addedAt, updatedAt: now });
        s.records = s.records.filter(r => r !== sourceRecord);
      } else if (sourceRecord) { sourceRecord.workId = replacement.id; sourceRecord.updatedAt = now; }
      for (const event of s.events) if (event.workId === source.id) event.workId = replacement.id;
      for (const list of s.lists) if (list.workIds.includes(source.id)) { list.workIds = [...new Set(list.workIds.map(id => id === source.id ? replacement.id : id))]; list.updatedAt = now; }
      s.works = s.works.filter(w => w.id !== source.id);
      if (target) Object.assign(target, replacement); else s.works.push(replacement);
      break;
    }
    case 'trakt-import': {
      for (const { work, event } of command.entries) {
        if (work.id !== event.workId || !['movies', 'tv'].includes(work.type) || work.provider !== 'tmdb' || event.rating !== null || event.review || event.visibility !== 'private' || event.spoiler || (work.type === 'movies' ? event.kind !== 'watch' : !['watch', 'episodes'].includes(event.kind))) throw new LibraryCommandError('Check the imported watch event.');
        if (s.events.some(e => (work.type === 'tv' && event.kind === 'watch' && e.workId === work.id && e.source?.provider === 'trakt') || e.id === event.id || (e.source?.account === event.source.account && e.source?.eventId === event.source.eventId))) continue;
        const existing = s.records.find(r => r.workId === work.id);
        if (existing?.deletedAt) continue; // A later import must not resurrect a deliberate removal.
        if (!s.works.some(w => w.id === work.id)) s.works.push(work);
        if (!existing) s.records.push({ workId: work.id, status: work.type === 'movies' ? 'completed' : 'active', rating: null, visibility: 'private', favorite: null, notes: '', episodes: 0, season: 1, platform: '', hours: null, addedAt: now, updatedAt: now, deletedAt: null });
        if (existing?.status === 'backlog') { existing.status = work.type === 'movies' ? 'completed' : 'active'; existing.updatedAt = now; }
        s.events.push({ ...event, createdAt: now, updatedAt: now, deletedAt: null });
      }
      break;
    }
    case 'save': save(command.work, command.patch); break;
    case 'edit': Object.assign(requireRecord(command.workId), command.patch, { updatedAt: now }); break;
    case 'remove': {
      const r = s.records.find(r => r.workId === command.workId);
      if (!r) throw new LibraryCommandError('Title not found.');
      r.deletedAt = command.restore ? null : now; r.updatedAt = now;
      break;
    }
    case 'log': {
      if (command.event.workId !== command.work.id) throw new LibraryCommandError('The diary title does not match.');
      if (s.events.some(e => e.id === command.event.id)) throw new LibraryCommandError('This event already exists.');
      const r = save(command.work, {});
      if (command.event.kind === 'episodes') {
        r.episodes = command.event.episodeTo!; r.season = command.event.season; r.status = 'active';
      } else r.status = 'completed';
      // An unrated diary entry must never implicitly clear a collection rating.
      // Explicit clearing belongs to the collection editor.
      if (command.updateRating && command.event.rating != null) r.rating = command.event.rating;
      s.events.push({ ...command.event, createdAt: now, updatedAt: now, deletedAt: null }); break;
    }
    case 'event': {
      const e = s.events.find(e => e.id === command.event.id && !e.deletedAt);
      if (!e || e.workId !== command.event.workId) throw new LibraryCommandError('Diary entry not found.');
      Object.assign(e, command.event, { updatedAt: now }); break;
    }
    case 'event-delete': {
      const e = s.events.find(e => e.id === command.id);
      if (!e) throw new LibraryCommandError('Diary entry not found.');
      e.deletedAt = command.restore ? null : now; e.updatedAt = now; break;
    }
    case 'list': {
      if (new Set(command.list.workIds).size !== command.list.workIds.length) throw new LibraryCommandError('A title can appear only once in a list.');
      const l = s.lists.find(l => l.id === command.list.id);
      if (l) Object.assign(l, command.list, { updatedAt: now, deletedAt: null });
      else s.lists.push({ ...command.list, updatedAt: now, deletedAt: null }); break;
    }
    case 'list-delete': {
      const l = s.lists.find(l => l.id === command.id);
      if (!l) throw new LibraryCommandError('List not found.');
      l.deletedAt = command.restore ? null : now; l.updatedAt = now; break;
    }
    case 'favorites': {
      if (new Set(command.workIds).size !== command.workIds.length) throw new LibraryCommandError('Duplicate favorite.');
      for (const workId of command.workIds) {
        requireRecord(workId);
        if (!s.works.some(w => w.id === workId && w.type === command.type)) throw new LibraryCommandError('Favorites must belong to the selected category.');
      }
      for (const r of s.records) if (s.works.find(w => w.id === r.workId)?.type === command.type) {
        const position = command.workIds.indexOf(r.workId); r.favorite = position < 0 ? null : position + 1; r.updatedAt = now;
      }
      break;
    }
    case 'restore': s = structuredClone(command.state); break;
  }
  s.applied = [...input.applied.filter(v => v !== requestId).slice(-99), requestId];
  return stateSchema.parse(s);
}

// This is the only public DTO. Each item must be explicitly marked public;
// private owner notes, hours, progress, platform details and mutation IDs stay private.
export function publishState(s: LibraryState): LibraryState {
  const records = s.records.filter(r => !r.deletedAt && r.visibility === 'public').map(r => ({ ...r, notes: '', episodes: 0, season: 1, platform: '', hours: null }));
  const events = s.events.filter(e => !e.deletedAt && e.visibility === 'public').map(e => { const { source, ...event } = e; void source; return event; });
  const lists = s.lists.filter(l => !l.deletedAt && l.visibility === 'public');
  const ids = new Set([...records.map(r => r.workId), ...events.map(e => e.workId), ...lists.flatMap(l => l.workIds)]);
  return { works: s.works.filter(w => ids.has(w.id)), records, events, lists, applied: [] };
}

export type Filters = { type?: string; q?: string; genre?: string; status?: string; rating?: string; decade?: string; year?: string; sort?: string; list?: string; page?: string; view?: string };
export function browse(s: LibraryState, f: Filters, pageSize = 48) {
  const membership = f.list ? s.lists.find(l => l.id === f.list && !l.deletedAt)?.workIds ?? [] : null;
  const records = new Map(s.records.filter(r => !r.deletedAt).map(r => [r.workId, r]));
  const scoped = s.works.filter(w => (membership ? membership.includes(w.id) : records.has(w.id)) && (!f.type || f.type === 'all' || w.type === f.type));
  const genres = new Map<string, number>();
  for (const w of scoped) for (const genre of w.genres) genres.set(genre, (genres.get(genre) ?? 0) + 1);
  let result = scoped.filter(w => {
    const r = records.get(w.id);
    return (!f.q || matchesTitle(w, f.q)) &&
      (!f.genre || w.genres.includes(f.genre)) && (!f.status || f.status === 'all' || r?.status === f.status) &&
      (!f.decade || (w.year != null && Math.floor(w.year / 10) * 10 === Number(f.decade))) &&
      (!f.year || String(w.year) === f.year) &&
      (!f.rating || (f.rating === 'unrated' ? r?.rating == null : f.rating === 'rated' ? r?.rating != null : f.rating.startsWith('exact:') ? r?.rating === Number(f.rating.slice(6)) : r?.rating != null && r.rating >= Number(f.rating.startsWith('min:') ? f.rating.slice(4) : f.rating)));
  });
  const title = (a: Work, b: Work) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  const nullable = (a: number | null | undefined, b: number | null | undefined, reverse: boolean) => a == null ? b == null ? 0 : 1 : b == null ? -1 : reverse ? b - a : a - b;
  result.sort((a, b) => {
    const ra = records.get(a.id), rb = records.get(b.id);
    let cmp = 0;
    switch (f.sort) {
      case 'highest': case 'lowest': cmp = nullable(ra?.rating, rb?.rating, f.sort === 'highest'); break;
      case 'newest': case 'oldest': cmp = nullable(a.year, b.year, f.sort === 'newest'); break;
      case 'title': break;
      case 'updated': cmp = (rb?.updatedAt ?? '').localeCompare(ra?.updatedAt ?? ''); break;
      default: cmp = membership ? membership.indexOf(a.id) - membership.indexOf(b.id) : nullable(ra?.favorite, rb?.favorite, false); break;
    }
    return cmp || title(a, b);
  });
  const total = result.length, pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Number.parseInt(f.page || '1') || 1));
  result = result.slice((page - 1) * pageSize, page * pageSize);
  return { works: result, total, page, pages, genres: [...genres].sort((a, b) => a[0].localeCompare(b[0])), years: [...new Set(scoped.flatMap(w => w.year ? [w.year] : []))].sort((a, b) => b - a) };
}

export const backupSchema = z.object({ format: z.enum(['media-library', 'aziz-library']), version: z.literal(1), exportedAt: stamp, state: stateSchema }).strict();
export function exportBackup(state: LibraryState) { return { format: 'media-library' as const, version: 1 as const, exportedAt: new Date().toISOString(), state }; }
export function csv(state: LibraryState) {
  const quote = (v: unknown) => '"' + String(v ?? '').replace(/^(?:\s*[=+@\-]|[\t\r\n])/, "'$&").replace(/"/g, '""') + '"';
  return [['Title', 'Type', 'Year', 'Status', 'My rating', 'Episodes', 'Platform', 'Hours', 'Visibility'], ...state.records.filter(r => !r.deletedAt).map(r => {
    const w = state.works.find(w => w.id === r.workId)!;
    return [w.title, w.type, w.year, r.status, r.rating, r.episodes, r.platform, r.hours, r.visibility];
  })].map(row => row.map(quote).join(',')).join('\r\n');
}

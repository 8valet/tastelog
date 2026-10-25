import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, backupSchema, browse, csv, emptyState, exportBackup, publishState, type LibraryState, type Work } from '../lib/library/model.ts';
import { browseDiary, duplicateCandidates, overviewPicks } from '../lib/library/discovery.ts';
import { pickTitle, plannedTitles } from '../lib/library/roulette.ts';
const work = (id = 'manual:a', overrides: Partial<Work> = {}): Work => ({ id, type: 'movies', title: 'A film', year: 2020, poster: '', genres: ['Drama'], episodes: null, seasons: null, summary: '', provider: 'manual', providerId: '', sourceUrl: '', ...overrides });
const save = (s: LibraryState, w = work(), patch = {}, request = crypto.randomUUID()) => applyCommand(s, { op: 'save', work: w, patch }, request);
const event = { id: 'event:1', workId: 'manual:a', date: null, rating: 4, review: 'Private review', spoiler: false, visibility: 'private', kind: 'watch', episodeFrom: null, episodeTo: null, season: 1 };

test('roulette selects only saved, non-deleted planned titles in the chosen categories', () => {
  let state = emptyState();
  for (const type of ['movies', 'tv', 'anime', 'games'] as const) state = save(state, work(`manual:${type}`, { type }), { status: 'backlog' });
  for (const status of ['active', 'completed', 'wishlist', 'paused', 'dropped']) state = save(state, work(`manual:${status}`), { status });
  state = save(state, work('manual:deleted'), { status: 'backlog' });
  state.records.find(record => record.workId === 'manual:deleted')!.deletedAt = new Date().toISOString();
  state.works.push(work('manual:unsaved'));
  const before = structuredClone(state);
  assert.deepEqual(plannedTitles(state, ['movies', 'games']).map(w => w.id), ['manual:movies', 'manual:games']);
  assert.deepEqual(plannedTitles(state, ['tv', 'anime']).map(w => w.id), ['manual:tv', 'manual:anime']);
  assert.deepEqual(plannedTitles(state, []), []);
  assert.equal(plannedTitles(state, ['movies', 'tv', 'anime', 'games']).length, 4);
  assert.deepEqual(state, before);
});

test('roulette draws from beyond the first collection page with equal selection intervals', () => {
  let state = emptyState();
  for (let index = 0; index < 60; index++) state = save(state, work(`manual:roulette:${index}`), { status: 'backlog' });
  const before = structuredClone(state);
  const candidates = plannedTitles(state, ['movies']);
  assert.equal(candidates.length, 60);
  assert.equal(pickTitle(candidates, () => 0)?.id, 'manual:roulette:0');
  assert.equal(pickTitle(candidates, () => 1 - Number.EPSILON)?.id, 'manual:roulette:59');
  for (let index = 0; index < candidates.length; index++) assert.equal(pickTitle(candidates, () => (index + .5) / candidates.length)?.id, candidates[index].id);
  assert.equal(pickTitle([], () => { throw new Error('No random draw needed'); }), null);
  assert.equal(pickTitle([candidates[0]], () => .999), candidates[0]);
  assert.equal(pickTitle(candidates, () => .5), pickTitle(candidates, () => .5));
  assert.deepEqual(state, before);
});

test('an unrated watch preserves the current rating even if an older client requests an update', () => {
  let s = save(emptyState(), work(), { rating: 4.5, status: 'completed' });
  s = applyCommand(s, { op: 'log', work: work(), event: { ...event, rating: null }, updateRating: true }, 'unrated-watch');
  assert.equal(s.records[0].rating, 4.5); assert.equal(s.events[0].rating, null);
  s = applyCommand(s, { op: 'edit', workId: work().id, patch: { rating: null } }, 'explicit-clear');
  assert.equal(s.records[0].rating, null);
});

test('catalog reconciliation preserves conflicts privately, repeat watches, list order and undo backups', () => {
  let s = save(emptyState(), work(), { rating: 3, notes: 'Source notes', status: 'active', favorite: 1 });
  const target = work('mal:anime:1', { type: 'anime', title: 'Canonical title', provider: 'mal', providerId: '1', aliases: ['A film'] });
  s = save(s, target, { rating: 5, status: 'completed', visibility: 'public', notes: 'Target notes' });
  s = applyCommand(s, { op: 'log', work: work(), event, updateRating: false }, 'source-watch');
  s = applyCommand(s, { op: 'log', work: target, event: { ...event, workId: target.id, id: 'event:2' }, updateRating: false }, 'target-watch');
  s = applyCommand(s, { op: 'list', list: { id: 'list:merge', name: 'Favorites', description: '', visibility: 'private', workIds: [work().id, target.id] } }, 'merge-list');
  const before = structuredClone(s);
  s = applyCommand(s, { op: 'reconcile', sourceId: work().id, work: target, recordFrom: 'target' }, 'merge');
  assert.equal(s.works.length, 1); assert.equal(s.records.length, 1); assert.equal(s.records[0].rating, 5);
  assert.equal(s.records[0].visibility, 'private'); assert.ok(s.records[0].notes.includes('Source notes')); assert.ok(s.records[0].notes.includes('"rating": 3'));
  assert.equal(s.events.length, 2); assert.ok(s.events.every(e => e.workId === target.id)); assert.deepEqual(s.lists[0].workIds, [target.id]);
  assert.ok(!JSON.stringify(publishState(s)).includes('Source notes'));
  s = applyCommand(s, { op: 'restore', state: before }, 'undo-merge'); assert.deepEqual(s.works, before.works); assert.deepEqual(s.events, before.events);
  const matched = applyCommand(before, { op: 'reconcile', sourceId: work().id, work: { ...target, id: 'mal:anime:2', providerId: '2' }, recordFrom: 'source' }, 'new-match');
  assert.equal(matched.records.find(r => r.workId === 'mal:anime:2')!.rating, 3);
  assert.throws(() => applyCommand(before, { op: 'metadata', work: { ...target, providerId: '9' } }, 'bad-identity'));
});

test('alternate-title search, exact half-star filtering, diary ranges and reviewed duplicate suggestions', () => {
  let s = save(emptyState(), work(), { rating: 3.5, status: 'completed' });
  s = save(s, work('anime:alias', { title: 'Japanese name', type: 'anime', aliases: ['Éternal Sunshine'], year: 2021 }), { rating: 5, status: 'backlog' });
  assert.equal(browse(s, { q: 'eternal sunshine' }).works[0].id, 'anime:alias');
  assert.equal(browse(s, { rating: 'exact:3.5' }).works[0].id, work().id);
  s = applyCommand(s, { op: 'log', work: work(), event: { ...event, date: '2026-10-01' }, updateRating: false }, 'diary-range');
  s = applyCommand(s, { op: 'log', work: work(), event: { ...event, id: 'undated' }, updateRating: false }, 'diary-undated');
  assert.equal(browseDiary(s, { from: '2026-10-01', to: '2026-10-01' }).total, 1);
  assert.equal(browseDiary(s, { from: '2026-10-02' }).total, 0);
  assert.equal(browseDiary(s, { type: 'games' }).total, 0);
  assert.equal(browseDiary(s, {}, 1).pages, 2);
  assert.equal(overviewPicks(s, 'anime').records.length, 0);
  s = save(s, work('duplicate', { title: 'A film', type: 'anime' }), {});
  assert.equal(duplicateCandidates(s).length, 1);
});

test('backlog, completion and current ratings never manufacture a dated diary event', () => {
  let s = save(emptyState()); assert.equal(s.records[0].visibility, 'private'); assert.equal(s.records[0].rating, null);
  s = applyCommand(s, { op: 'edit', workId: work().id, patch: { status: 'completed', rating: 4.5 } }, 'rating:1');
  assert.equal(s.events.length, 0); assert.equal(s.records[0].status, 'completed');
});
test('logging, repeats, idempotent retries, history editing and recovery preserve separate current values', () => {
  let s = applyCommand(emptyState(), { op: 'log', work: work(), event, updateRating: true }, 'request:1');
  const retry = applyCommand(s, { op: 'log', work: work(), event, updateRating: true }, 'request:1');
  assert.deepEqual(retry, s); assert.equal(s.events[0].date, null);
  s = applyCommand(s, { op: 'log', work: work(), event: { ...event, id: 'event:2', rating: 2.5, date: '2026-10-09' }, updateRating: false }, 'request:2');
  assert.equal(s.events.length, 2); assert.equal(s.records[0].rating, 4);
  s = applyCommand(s, { op: 'event', event: { ...event, rating: 1.5 } }, 'request:3');
  assert.equal(s.records[0].rating, 4);
  s = applyCommand(s, { op: 'event-delete', id: event.id, restore: false }, 'request:4');
  assert.ok(s.events[0].deletedAt);
  s = applyCommand(s, { op: 'event-delete', id: event.id, restore: true }, 'request:5');
  assert.equal(s.events[0].deletedAt, null); assert.equal(s.records[0].rating, 4);
});
test('public projection shares only opted-in fields, counts and list metadata', () => {
  let s = save(emptyState(), work(), { notes: 'SECRET', hours: 80, episodes: 12, platform: 'SECRET' });
  s = save(s, work('manual:b', { title: 'Published film' }), { visibility: 'public', rating: 4, notes: 'SECRET', episodes: 10 });
  s = applyCommand(s, { op: 'log', work: work(), event, updateRating: false }, 'secret:log');
  let p = publishState(s); assert.equal(p.works.length, 1); assert.equal(p.events.length, 0); assert.equal(p.applied.length, 0);
  assert.ok(!JSON.stringify(p).includes('SECRET')); assert.equal(p.records[0].episodes, 0);
  s = applyCommand(s, { op: 'list', list: { id: 'list:private', name: 'Private', description: 'SECRET', visibility: 'private', workIds: ['manual:a'] } }, 'list:private');
  p = publishState(s); assert.equal(p.lists.length, 0); assert.ok(!JSON.stringify(p).includes('SECRET'));
  s = applyCommand(s, { op: 'log', work: work(), event: { ...event, id: 'event:public', visibility: 'public', review: 'Public review' }, updateRating: false }, 'public:log');
  s.events.at(-1)!.source = { provider: 'trakt', account: 'a'.repeat(64), eventId: '123', watchedAt: '2026-10-09T00:00:00.000Z' };
  p = publishState(s); assert.equal(p.events.length, 1); assert.equal(p.events[0].review, 'Public review');
  assert.ok(!JSON.stringify(p).includes('a'.repeat(64)));
  s = applyCommand(s, { op: 'list', list: { id: 'list:1', name: 'Shared', description: '', visibility: 'public', workIds: ['manual:a'] } }, 'list:write');
  p = publishState(s); assert.equal(p.works.length, 2); assert.equal(p.records.length, 1); assert.equal(p.events.length, 1);
  assert.equal(browse(p, {}).total, 1); assert.equal(browse(p, { list: 'list:1' }).total, 1);
});
test('combined filters, category-scoped genres, zero matches and null-last stable ordering', () => {
  let s = save(emptyState(), work('a', { title: 'A', year: null }), { rating: null });
  s = save(s, work('b', { title: 'B', year: 2024 }), { rating: 4 });
  s = save(s, work('c', { title: 'C', genres: ['Comedy'], year: 2023 }), { rating: 2 });
  s = save(s, work('d', { title: 'D', type: 'anime', year: 2000 }), { rating: 4.5 });
  assert.deepEqual(browse(s, { type: 'movies', sort: 'highest' }).works.map(w => w.id), ['b', 'c', 'a']);
  assert.deepEqual(browse(s, { type: 'movies', sort: 'lowest' }).works.map(w => w.id), ['c', 'b', 'a']);
  assert.deepEqual(browse(s, { type: 'movies', sort: 'oldest' }).works.map(w => w.id), ['c', 'b', 'a']);
  const r = browse(s, { type: 'movies', genre: 'Drama', rating: '4', year: '2024', q: 'B' });
  assert.equal(r.total, 1); assert.deepEqual(r.genres, [['Comedy', 1], ['Drama', 2]]);
  assert.equal(browse(s, { type: 'games', genre: 'Drama' }).total, 0);
});
test('backup restore roundtrip includes progress, list order and recoverable removals without secrets', () => {
  let s = save(emptyState(), work('a', { type: 'games' }), { hours: 40.5, platform: 'PC', rating: 4.5 });
  s = save(s, work('b', { type: 'anime' }), { episodes: 12, season: 2, status: 'paused' });
  s = applyCommand(s, { op: 'list', list: { id: 'list:1', name: 'To share', description: '', visibility: 'private', workIds: ['b', 'a'] } }, 'list:1');
  s = applyCommand(s, { op: 'remove', workId: 'a', restore: false }, 'remove:1');
  const backup = backupSchema.parse(JSON.parse(JSON.stringify(exportBackup(s))));
  const restored = applyCommand(emptyState(), { op: 'restore', state: backup.state }, 'restore:1');
  assert.deepEqual(restored.records, s.records); assert.deepEqual(restored.lists, s.lists); assert.deepEqual(restored.works, s.works);
  assert.throws(() => backupSchema.parse({ ...backup, version: 2 }));
  assert.throws(() => backupSchema.parse({ ...backup, state: { ...backup.state, lists: [{ ...s.lists[0], workIds: ['unknown'] }] } }));
});
test('episode ranges, season changes and direct corrections do not imply series completion', () => {
  const w = work('series', { type: 'tv', episodes: null });
  let s = applyCommand(emptyState(), { op: 'log', work: w, event: { ...event, workId: w.id, kind: 'episodes', episodeFrom: 2, episodeTo: 4, season: 2 }, updateRating: false }, 'episodes:1');
  assert.equal(s.records[0].episodes, 4); assert.equal(s.records[0].season, 2); assert.equal(s.records[0].status, 'active');
  s = applyCommand(s, { op: 'edit', workId: w.id, patch: { episodes: 3 } }, 'undo:1');
  assert.equal(s.events.length, 1); assert.equal(s.records[0].episodes, 3);
  assert.throws(() => applyCommand(s, { op: 'log', work: w, event: { ...event, id: 'bad', workId: w.id, kind: 'episodes', episodeFrom: 5, episodeTo: 3 }, updateRating: false }, 'bad'));
});
test('CSV escapes formulas and quotes, and invalid dates/ratings do not save', () => {
  const s = save(emptyState(), work('formula', { title: '=HYPERLINK("url")' }));
  assert.ok(csv(s).includes("'=")); assert.ok(csv(s).includes('""url""'));
  assert.throws(() => save(s, work(), { rating: 4.2 }));
  assert.throws(() => applyCommand(s, { op: 'log', work: work(), event: { ...event, date: '2026-02-30' }, updateRating: true }, 'bad-date'));
});
test('1,000-record browsing paginates consistently, preserves scope and avoids rendering the entire library', () => {
  const s = emptyState(), now = new Date().toISOString();
  for (let i = 0; i < 1000; i++) { s.works.push(work(`movie:${i}`, { title: `Movie ${String(i).padStart(4, '0')}`, genres: [i % 2 ? 'Comedy' : 'Drama'] })); s.records.push({ workId: `movie:${i}`, status: 'completed', rating: i % 10 / 2 || null, visibility: 'private', favorite: null, notes: '', episodes: 0, season: 1, platform: '', hours: null, addedAt: now, updatedAt: now, deletedAt: null }); }
  const start = performance.now(), first = browse(s, { sort: 'title', genre: 'Drama' }), second = browse(s, { sort: 'title', genre: 'Drama', page: '2' });
  assert.equal(first.total, 500); assert.equal(first.works.length, 48); assert.equal(second.works.length, 48);
  assert.equal(new Set([...first.works, ...second.works].map(w => w.id)).size, 96);
  assert.ok(performance.now() - start < 1500);
});

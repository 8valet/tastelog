import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applyCommand, emptyState, publishState, backupSchema, exportBackup, type Work } from '../lib/library/model.ts';
import { entryFlags, hash, historyEntry, historySchema, pkce, seal, unseal } from '../lib/library/trakt-core.ts';
import { traktRequestHeaders } from '../lib/library/trakt-request.ts';
import { traktFailureMessage } from '../lib/library/trakt-messages.ts';
const work: Work = { id: 'tmdb:movie:120467', type: 'movies', title: 'Fixture movie', year: 2014, poster: '', genres: ['Drama'], episodes: null, seasons: null, summary: '', provider: 'tmdb', providerId: '120467', sourceUrl: 'https://www.themoviedb.org/movie/120467' };
const account = hash('fixture-account');
const row = (id = 1) => historySchema.parse([{ id, watched_at: '2026-10-09T22:30:00Z', type: 'movie', movie: { title: work.title, ids: { tmdb: 120467 } } }])[0];
const entry = (id = 1) => historyEntry(row(id), work, account, 'Asia/Riyadh');

test('Trakt requests identify the application for OAuth and preserve bearer credentials for API calls', () => {
  for (const supplied of [undefined, { Authorization: 'Bearer isolated-access', 'trakt-api-version': 'incorrect' }]) {
    const headers = traktRequestHeaders('isolated-client-id', supplied);
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(headers.get('Accept'), 'application/json');
    assert.equal(headers.get('User-Agent'), 'Tastelog/1.0');
    assert.equal(headers.get('trakt-api-key'), 'isolated-client-id');
    assert.equal(headers.get('trakt-api-version'), '2');
    assert.equal(headers.get('Authorization'), supplied?.Authorization ?? null);
  }
});

test('callback errors explain recovery and never reflect arbitrary URL data', () => {
  assert.match(traktFailureMessage('session'), /Sign in to the library/);
  assert.match(traktFailureMessage('token'), /website/);
  for (const reason of [null, 'constructor', '__proto__', '<script>secret</script>']) {
    assert.equal(traktFailureMessage(reason), 'Trakt sign-in was not completed. Your library is unchanged; start the connection again.');
  }
});
test('PKCE S256 and encrypted tokens are tamper-resistant and bound to their owner/connection', () => {
  const p = pkce(); assert.equal(p.verifier.length, 43); assert.equal(p.challenge, createHash('sha256').update(p.verifier).digest('base64url')); assert.notEqual(pkce().verifier, p.verifier);
  const value = { access_token: 'private-access', refresh_token: 'private-refresh' }, key = 'a'.repeat(64), context = 'owner:connection';
  const encrypted = seal(value, key, context); assert.ok(!encrypted.includes('private')); assert.deepEqual(unseal(encrypted, key, context), value);
  assert.throws(() => unseal(encrypted, key, 'other-owner:connection')); assert.throws(() => unseal(encrypted, 'b'.repeat(64), context));
  const pieces = encrypted.split('.'); pieces[2] = Buffer.from('tampered').toString('base64url'); assert.throws(() => unseal(pieces.join('.'), key, context));
});
test('import preserves timestamps, timezone dates and rewatches without inventing ratings', () => {
  const e = entry(); assert.equal(e.event.date, '2026-10-10'); assert.equal(e.event.source.watchedAt, '2026-10-09T22:30:00.000Z');
  let s = applyCommand(emptyState(), { op: 'trakt-import', entries: [e, entry(2)] }, 'import:1');
  assert.equal(s.events.length, 2); assert.equal(s.records[0].rating, null); assert.equal(s.records[0].visibility, 'private'); assert.equal(s.records[0].status, 'completed');
  s = applyCommand(s, { op: 'trakt-import', entries: [e] }, 'import:retry'); assert.equal(s.events.length, 2);
  assert.deepEqual(backupSchema.parse(exportBackup(s)).state.events[0].source, e.event.source);
  assert.equal(publishState(s).events.length, 0);
});
test('local edits, source references and tombstones survive later imports; public history strips provenance', () => {
  const e = entry(); let s = applyCommand(emptyState(), { op: 'trakt-import', entries: [e] }, 'a');
  s = applyCommand(s, { op: 'edit', workId: work.id, patch: { status: 'paused', rating: 4.5, notes: 'private note', favorite: 1, visibility: 'public', episodes: 9 } }, 'b');
  const { source, ...input } = e.event;
  s = applyCommand(s, { op: 'event', event: { ...input, date: '2020-01-01', rating: 3.5, review: 'My edit', visibility: 'public' } }, 'c');
  s = applyCommand(s, { op: 'trakt-import', entries: [e, entry(2)] }, 'd');
  assert.equal(s.events[0].review, 'My edit'); assert.deepEqual(s.events[0].source, source); assert.equal(s.records[0].notes, 'private note'); assert.equal(s.records[0].status, 'paused'); assert.equal(s.records[0].rating, 4.5); assert.equal(s.records[0].episodes, 9);
  assert.equal(publishState(s).events[0].source, undefined); assert.ok(!JSON.stringify(publishState(s)).includes(account));
  s = applyCommand(s, { op: 'event-delete', id: e.event.id, restore: false }, 'e'); s = applyCommand(s, { op: 'trakt-import', entries: [e] }, 'f'); assert.ok(s.events[0].deletedAt); assert.equal(entryFlags(s, e).duplicate, true);
  s = applyCommand(s, { op: 'remove', workId: work.id, restore: false }, 'g'); s = applyCommand(s, { op: 'trakt-import', entries: [entry(3)] }, 'h'); assert.equal(s.events.length, 2); assert.ok(s.records[0].deletedAt);
});
test('title imports accept animated series without episode mapping and preserve existing statuses', () => {
  const show = { ...work, id: 'tmdb:tv:1396', type: 'tv' as const, providerId: '1396' };
  const episode = historySchema.parse([{ id: 9, watched_at: '2026-10-09T10:00:00+03:00', type: 'episode', show: { title: show.title, ids: { tmdb: 1396 } }, episode: { season: 2, number: 4 } }])[0];
  const e = historyEntry(episode, show, account, 'Asia/Riyadh'); const s = applyCommand(emptyState(), { op: 'trakt-import', entries: [e] }, 'episode');
  assert.equal(s.records[0].status, 'active'); assert.equal(s.records[0].episodes, 0); assert.equal(s.events[0].episodeFrom, null); assert.equal(s.events[0].season, 1); assert.equal(s.events[0].kind, 'watch');
  assert.equal(historyEntry({ ...episode, episode: { season: 0, number: 0 } }, show, account, 'Asia/Riyadh').event.kind, 'watch');
  const next = historyEntry({ ...episode, id: 10 }, show, account, 'Asia/Riyadh');
  assert.equal(entryFlags(s, next).duplicate, true);
  assert.equal(applyCommand(s, { op: 'trakt-import', entries: [next] }, 'next').events.length, 1);
  let planned = applyCommand(emptyState(), { op: 'save', work: show, patch: { status: 'backlog', rating: 4, notes: 'Keep this' } }, 'plan');
  planned = applyCommand(planned, { op: 'trakt-import', entries: [e] }, 'start');
  assert.equal(planned.records[0].status, 'active'); assert.equal(planned.records[0].rating, 4); assert.equal(planned.records[0].notes, 'Keep this');
  const watched = applyCommand(emptyState(), { op: 'save', work: show, patch: { status: 'completed' } }, 'watched');
  assert.equal(applyCommand(watched, { op: 'trakt-import', entries: [e] }, 'keep').records[0].status, 'completed');
  assert.throws(() => historySchema.parse([{ ...row(), watched_at: 'not a date' }]));
  assert.throws(() => applyCommand(emptyState(), { op: 'trakt-import', entries: [{ ...entry(), event: { ...entry().event, visibility: 'public' } }] }, 'unsafe'));
});

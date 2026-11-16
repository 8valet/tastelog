import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browse, emptyState, type Work } from '../lib/library/model.ts';
import { projectPublicLibrary } from '../lib/library/projection.ts';

const now = '2026-11-01T00:00:00.000Z';
const work = (index: number): Work => ({
  id: `manual:${index}`, type: 'movies', title: `Film ${String(index).padStart(3, '0')}`,
  year: 2000 + index % 20, poster: '', genres: [index % 2 ? 'Comedy' : 'Drama'],
  episodes: null, seasons: null, summary: 'L'.repeat(2000),
  provider: 'manual', providerId: '', sourceUrl: 'https://example.com',
  aliases: [`Alias ${index}`],
});

test('public projection shrinks initial HTML input without changing filter, sort, counts or category statistics data', () => {
  const state = emptyState();
  for (let index = 0; index < 200; index++) {
    state.works.push(work(index));
    state.records.push({
      workId: `manual:${index}`, status: 'completed', rating: 4, visibility: 'public',
      favorite: null, notes: '', episodes: 0, season: 1, platform: '', hours: null,
      addedAt: now, updatedAt: now, deletedAt: null,
    });
  }
  const projected = projectPublicLibrary(state);
  assert.equal(projected.works.length, 200);
  assert.deepEqual(projected.records, state.records);
  assert.deepEqual(projected.events, state.events);
  const original = browse(state, { q: 'Alias 17', type: 'movies', sort: 'title' }, 24);
  const lightweight = browse(projected, { q: 'Alias 17', type: 'movies', sort: 'title' }, 24);
  assert.equal(lightweight.total, original.total);
  assert.deepEqual(lightweight.works.map(w => w.id), original.works.map(w => w.id));
  assert.deepEqual(lightweight.genres, original.genres);
  assert.deepEqual(lightweight.years, original.years);
  // Overview picks retain their complete detail data; ordinary items do not.
  assert.equal(projected.works[0].summary, state.works[0].summary);
  assert.equal(projected.works[199].summary, '');
  assert.ok(JSON.stringify(projected).length < JSON.stringify(state).length / 2);
  assert.equal(state.works[199].summary.length, 2000); // pure, no mutation
});

test('public pages retain exact 24-item server-side pagination and sorting across a large collection', () => {
  const state = emptyState();
  for (let index = 0; index < 101; index++) {
    state.works.push(work(index));
    state.records.push({
      workId: `manual:${index}`, status: 'completed', rating: null, visibility: 'public',
      favorite: null, notes: '', episodes: 0, season: 1, platform: '', hours: null,
      addedAt: now, updatedAt: now, deletedAt: null,
    });
  }
  const p1 = browse(state, { sort: 'title', status: 'completed' }, 24);
  const p2 = browse(state, { sort: 'title', status: 'completed', page: '2' }, 24);
  assert.equal(p1.total, 101);
  assert.equal(p1.pages, 5);
  assert.equal(p1.works.length, 24);
  assert.equal(p2.works.length, 24);
  assert.equal(new Set([...p1.works, ...p2.works].map(w => w.id)).size, 48);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { posterSources } from '../lib/library/artwork.ts';
test('artwork uses only the installation owner’s saved poster', () => {
  const work = { id: 'manual:fixture:poster', sourceUrl: '', poster: 'https://example.com/custom.jpg' };
  const original = structuredClone(work);
  assert.deepEqual(posterSources(work), [work.poster]);
  assert.deepEqual(posterSources({ ...work, poster: '' }), []);
  assert.deepEqual(posterSources({ ...work, id: '__proto__', poster: '' }), []);
  assert.deepEqual(work, original);
});

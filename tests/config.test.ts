import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, exportBackup, backupSchema } from '../lib/library/model.ts';
test('fresh state is empty and new backups round-trip with a neutral format', () => {
  const state = emptyState();
  for (const items of Object.values(state)) assert.deepEqual(items, []);
  const backup = exportBackup(state);
  assert.equal(backup.format, 'media-library');
  assert.deepEqual(backupSchema.parse(backup).state, state);
  assert.deepEqual(backupSchema.parse({ ...backup, format: 'aziz-library' }).state, state);
  assert.equal(backupSchema.safeParse({ ...backup, format: 'unknown' }).success, false);
});

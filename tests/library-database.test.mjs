import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { initialize, ownerId as owner, strangerId as stranger } from './fixtures/library-db.mjs';

test('Trakt tokens and reviews are owner-only; leases and generation guards prevent stale commits', async () => {
  const db = new PGlite(); await initialize(db);
  const as = (role, uid, fn) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]); return fn(tx); });
  const generation = crypto.randomUUID(), lease = crypto.randomUUID();
  await as('authenticated', owner, tx => tx.query('insert into public.library_trakt(owner_id,generation,account_key,username,credentials) values($1,$2,$3,$4,$5)', [owner, generation, 'a'.repeat(64), 'fixture', 'ENCRYPTED_ONLY']));
  await assert.rejects(() => as('anon', '', tx => tx.query('select * from public.library_trakt')), /permission denied/);
  assert.equal((await as('authenticated', stranger, tx => tx.query('select * from public.library_trakt'))).rows.length, 0);
  await assert.rejects(() => as('authenticated', stranger, tx => tx.query('insert into public.library_trakt(owner_id,generation,account_key,username,credentials) values($1,$2,$3,$4,$5)', [stranger, crypto.randomUUID(), 'b'.repeat(64), 'stranger', 'BAD'])), /row-level security/);
  const acquire = () => as('authenticated', owner, tx => tx.query("update public.library_trakt set lease_nonce=$1,lease_until=now()+interval '2 minutes' where owner_id=$2 and lease_until<now() returning generation", [lease, owner]));
  assert.equal((await acquire()).rows.length, 1); assert.equal((await acquire()).rows.length, 0);
  const doc = { works: [], records: [], events: [], lists: [], applied: [] };
  const commit = (g, l) => as('authenticated', owner, tx => tx.query('select public.library_trakt_save(0,$1,$2,$3,$4) as revision', [doc, doc, g, l]));
  await assert.rejects(() => commit(crypto.randomUUID(), lease), /Trakt connection changed/);
  await assert.rejects(() => commit(generation, crypto.randomUUID()), /Trakt connection changed/);
  assert.equal((await commit(generation, lease)).rows[0].revision, 1);
  await as('authenticated', owner, tx => tx.query('delete from public.library_trakt where owner_id=$1', [owner]));
  await assert.rejects(() => commit(generation, lease), /Trakt connection changed/);
  assert.equal((await db.query('select revision from public.library_state')).rows[0].revision, 1);
  await db.close();
});
test('Postgres policies deny anonymous/other-account private access; CAS and public projection are atomic and persistent', async () => {
  const dir = resolve('work', `library-database-test-${crypto.randomUUID()}`);
  await mkdir(dir, { recursive: true });
  let db = new PGlite(dir); await initialize(db);
  const as = (role, uid, fn) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]); return fn(tx); });
  const privateDoc = { works: [{ id: 'a' }], notes: 'NEVER_PUBLIC' }, publicDoc = { works: [{ id: 'a' }] };
  await assert.rejects(() => as('anon', '', tx => tx.query('select * from public.library_state')), /permission denied/);
  await assert.rejects(() => as('authenticated', stranger, tx => tx.query('select public.library_save(0,$1,$2)', [privateDoc, publicDoc])), /Owner access required/);
  await as('authenticated', owner, async tx => { const r = await tx.query('select public.library_save(0,$1,$2) as revision', [privateDoc, publicDoc]); assert.equal(r.rows[0].revision, 1); });
  const otherRows = await as('authenticated', stranger, tx => tx.query('select * from public.library_state')); assert.equal(otherRows.rows.length, 0);
  const published = await as('anon', '', tx => tx.query('select document from public.library_public')); assert.deepEqual(published.rows[0].document, publicDoc);
  await assert.rejects(() => as('authenticated', owner, tx => tx.query('select public.library_save(0,$1,$2)', [{ notes: 'LOST_UPDATE' }, { broken: true }])), /Library changed/);
  const preserved = await as('anon', '', tx => tx.query('select document from public.library_public')); assert.deepEqual(preserved.rows[0].document, publicDoc);
  await db.close(); db = new PGlite(dir);
  const persisted = await db.query('select document,revision from public.library_state'); assert.equal(persisted.rows[0].revision, 1); assert.equal(persisted.rows[0].document.notes, 'NEVER_PUBLIC');
  await db.close();
});

test('public snapshot migration removes private data already stored for anonymous reads', async () => {
  const db = new PGlite(); await initialize(db);
  const as = (role, uid, fn) => db.transaction(async tx => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    return fn(tx);
  });
  const state = {
    works: [
      { id: 'private-work', title: 'Private title' },
      { id: 'public-work', title: 'Published title' },
      { id: 'event-work', title: 'Published diary title' },
      { id: 'list-work', title: 'Published list title' },
    ],
    records: [
      { workId: 'private-work', visibility: 'private', deletedAt: null, notes: 'PRIVATE_NOTE', episodes: 8, season: 2, platform: 'PRIVATE_PLATFORM', hours: 40 },
      { workId: 'public-work', visibility: 'public', deletedAt: null, notes: 'PRIVATE_NOTE', episodes: 8, season: 2, platform: 'PRIVATE_PLATFORM', hours: 40 },
    ],
    events: [
      { id: 'private-event', workId: 'private-work', visibility: 'private', deletedAt: null, review: 'PRIVATE_REVIEW', source: { account: 'PRIVATE_ACCOUNT' } },
      { id: 'public-event', workId: 'event-work', visibility: 'public', deletedAt: null, review: 'Published review', source: { account: 'PRIVATE_ACCOUNT' } },
    ],
    lists: [
      { id: 'private-list', name: 'Private list', visibility: 'private', deletedAt: null, workIds: ['private-work'] },
      { id: 'public-list', name: 'Published list', visibility: 'public', deletedAt: null, workIds: ['list-work'] },
    ],
    applied: ['PRIVATE_MUTATION_ID'],
  };
  const previousPublicSnapshot = structuredClone(state);
  await db.query('insert into public.library_state(owner_id, revision, document) values($1, 7, $2)', [owner, state]);
  await db.query('insert into public.library_public(owner_id, revision, document) values($1, 7, $2)', [owner, previousPublicSnapshot]);
  await db.query('insert into public.library_owners(id) values($1)', [stranger]);
  await db.query('insert into public.library_public(owner_id, revision, document) values($1, 1, $2)', [stranger, previousPublicSnapshot]);

  const migration = await readFile(resolve('supabase/migrations/202610200001_public_visibility_projection.sql'), 'utf8');
  await db.exec(migration);
  const result = await as('anon', '', tx => tx.query('select document, revision from public.library_public where owner_id = $1', [owner]));
  const { document, revision } = result.rows[0];
  assert.equal(revision, 7);
  assert.deepEqual(document.works.map(work => work.id), ['public-work', 'event-work', 'list-work']);
  assert.deepEqual(document.records.map(record => record.workId), ['public-work']);
  assert.equal(document.records[0].notes, '');
  assert.equal(document.records[0].episodes, 0);
  assert.equal(document.records[0].season, 1);
  assert.equal(document.records[0].platform, '');
  assert.equal(document.records[0].hours, null);
  assert.deepEqual(document.events.map(event => event.id), ['public-event']);
  assert.equal(document.events[0].review, 'Published review');
  assert.equal('source' in document.events[0], false);
  assert.deepEqual(document.lists.map(list => list.id), ['public-list']);
  assert.deepEqual(document.applied, []);
  assert.doesNotMatch(JSON.stringify(document), /PRIVATE_NOTE|PRIVATE_REVIEW|PRIVATE_ACCOUNT|PRIVATE_PLATFORM|PRIVATE_MUTATION_ID/);
  const orphan = await as('anon', '', tx => tx.query('select count(*)::int as count from public.library_public where owner_id = $1', [stranger]));
  assert.equal(orphan.rows[0].count, 0);
  await db.close();
});

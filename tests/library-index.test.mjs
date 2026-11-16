import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { initialize, ownerId, strangerId } from './fixtures/library-db.mjs';

const stamp = '2026-11-10T00:00:00.000Z';
const work = i => ({
  id: `manual:${i}`, title: `Film ${String(i).padStart(3,'0')}`, type: i===7 ? 'anime' : 'movies',
  year: 2000+i%20, poster: '', genres: [i%2 ? 'Comedy' : 'Drama'],
  episodes: null, seasons: null, summary: 'Long detail: '.repeat(120),
  provider: 'manual', providerId: '', sourceUrl: '',
  aliases: i===7 ? ['Éternal Sunshine'] : [`Other Film ${i}`],
});
const record = (i, visibility) => ({
  workId: `manual:${i}`,status: 'completed',rating: i===7?4.5:4,
  visibility,favorite:null,notes:'PRIVATE SECRET NOTE '.repeat(40),
  episodes:0,season:1,platform:'PC',hours:null,addedAt:stamp,updatedAt:stamp,deletedAt:null
});
const documents = () => {
  const works=Array.from({length:101},(_,i)=>work(i));
  const records=works.map((_,i)=>record(i,i<80?'public':'private'));
  const state={works,records,events:[],lists:[],applied:[]};
  const published={
    works:works.slice(0,80),
    records:records.slice(0,80).map(r=>({...r,notes:'',episodes:0,season:1,platform:'',hours:null})),
    events:[],lists:[],applied:[]
  };
  return {state,published};
};
const withRole=(db,role,uid,fn)=>db.transaction(async tx=>{
  await tx.exec(`set local role ${role}`);
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);
  return fn(tx);
});
const page=(tx,scope,filter={})=>tx.query(
  'select public.library_browse_index($1,$2,$3) as page',
  [ownerId,scope,filter]
).then(r=>r.rows[0].page);
const preview=(tx,scope)=>tx.query(
  'select public.library_read_preview($1,$2) as preview',[ownerId,scope]
).then(r=>r.rows[0].preview);

test('indexed read models stay atomic, page globally, respect filter facets, and protect owner data',async()=>{
 const db=new PGlite();await initialize(db);
 // Regression: public/anonymous previews must not statically reference
 // library_state, even inside an unused CASE branch. PostgreSQL checks
 // permissions for all referenced tables before evaluating that condition.
 const definition = await db.query(
   "select pg_get_functiondef('public.library_read_preview(uuid,text)'::regprocedure) as sql"
 );
 assert.doesNotMatch(definition.rows[0].sql, /\blibrary_state\b/i);
 const {state,published}=documents();
 // List-only public works must appear in a shared list but not in the default
 // collection without an active public record.
 published.works.push(work(80));
 published.overview = { movies: { label: 'Favorites', workIds: ['manual:7'] } };
 published.lists.push({
   id:'list:shared',name:'Shared',description:'',visibility:'public',
   workIds:['manual:80','manual:7'],updatedAt:stamp,deletedAt:null
 });
 const revision=await withRole(db,'authenticated',ownerId,tx=>
   tx.query('select public.library_save(0,$1,$2) as revision',[state,published]));
 assert.equal(revision.rows[0].revision,1);
 const publicFirst=await withRole(db,'anon','',tx=>page(tx,'public',{status:'all',sort:'title'}));
 const publicSecond=await withRole(db,'anon','',tx=>page(tx,'public',{status:'all',sort:'title',page:'2'}));
 assert.equal(publicFirst.total,80);
 assert.equal(publicFirst.pages,4);
 assert.equal(publicFirst.works.length,24);
 assert.equal(publicSecond.works.length,24);
 assert.equal(new Set([...publicFirst.works,...publicSecond.works].map(w=>w.id)).size,48);
 assert.equal(publicFirst.genres.find(([g])=>g==='Drama')[1],40);
 assert.equal(publicFirst.genres.find(([g])=>g==='Comedy')[1],40);
 const listed=await withRole(db,'anon','',tx=>page(tx,'public',{list:'list:shared',status:'all'}));
 assert.deepEqual(listed.works.map(w=>w.id),['manual:80','manual:7']);
 const invalid=await withRole(db,'anon','',tx=>page(tx,'public',{year:'n/a',rating:'exact:garbage',status:'all'}));
 assert.equal(invalid.total,0);
 const title=await withRole(db,'anon','',tx=>page(tx,'public',{q:'eternal sunshine',status:'all'}));
 assert.deepEqual(title.works.map(w=>w.id),['manual:7']);
 const rated=await withRole(db,'anon','',tx=>page(tx,'public',{rating:'exact:4.5',status:'all'}));
 assert.deepEqual(rated.works.map(w=>w.id),['manual:7']);
 const ownerOnly=await withRole(db,'authenticated',ownerId,tx=>page(tx,'owner',{status:'all',page:'5'}));
 assert.equal(ownerOnly.total,101);
 assert.equal(ownerOnly.works.length,5);
 const stranger=await withRole(db,'authenticated',strangerId,tx=>page(tx,'owner',{status:'all'}));
 assert.equal(stranger.total,0);
 const leaked=await withRole(db,'anon','',tx=>tx.query("select count(*)::integer as n from public.library_read_works where scope='owner'"));
 assert.equal(leaked.rows[0].n,0);
 const publicPreview=await withRole(db,'anon','',tx=>preview(tx,'public'));
 assert.equal(publicPreview.state.works.length,81);
 assert.equal(publicPreview.state.records.length,80);
 assert.deepEqual(publicPreview.state.overview, published.overview);
 assert.equal(publicPreview.state.works[0].summary,'');
 assert.ok(!JSON.stringify(publicPreview).includes('PRIVATE SECRET NOTE'));
 const ownerPreview=await withRole(db,'authenticated',ownerId,tx=>preview(tx,'owner'));
 assert.equal(ownerPreview.state.works.length,101);
 assert.equal(ownerPreview.state.records.length,101);
 assert.deepEqual(ownerPreview.state.works.map(w => w.id), state.works.map(w => w.id));
 assert.deepEqual(ownerPreview.state.records.map(r => r.workId), state.records.map(r => r.workId));
 assert.ok(JSON.stringify(ownerPreview).length<JSON.stringify(state).length/2);
 assert.equal(ownerPreview.revision,1);
 assert.equal(ownerPreview.owner,true);

 const updated=structuredClone(state);
 updated.works=updated.works.slice(0,98);
 updated.records=updated.records.slice(0,98);
 updated.records[90].deletedAt=stamp;
 const newPub=structuredClone(published);
 newPub.lists=[];
 newPub.works=newPub.works.slice(0,79);
 newPub.records=newPub.records.slice(0,79);
 await withRole(db,'authenticated',ownerId,tx=>
   tx.query('select public.library_save(1,$1,$2)',[updated,newPub]));
 const after=await withRole(db,'anon','',tx=>page(tx,'public',{status:'all'}));
 assert.equal(after.total,79);
 const ownerAfter=await withRole(db,'authenticated',ownerId,tx=>page(tx,'owner',{status:'all'}));
 assert.equal(ownerAfter.total,97);
 await assert.rejects(()=>withRole(db,'authenticated',ownerId,tx=>
   tx.query('select public.library_save(1,$1,$2)',[state,published])),/Library changed/);
 const afterConflict=await withRole(db,'anon','',tx=>page(tx,'public',{status:'all'}));
 assert.equal(afterConflict.total,79);
 await db.close();
});

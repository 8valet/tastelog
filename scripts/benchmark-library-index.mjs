// Synthetic performance exercise: never touches a live account or Supabase.
import { PGlite } from '@electric-sql/pglite';
import { initialize, ownerId } from '../tests/fixtures/library-db.mjs';
const now='2026-11-01T00:00:00.000Z';
const works=Array.from({length:1232},(_,i)=>({
 id:`manual:${i}`,type:i%10===0?'anime':'movies',title:`Title ${String(i).padStart(4,'0')}`,
 year:2000+i%25,poster:'https://example.org/poster.jpg',genres:[i%2?'Drama':'Comedy'],
 episodes:null,seasons:null,summary:'Full description '.repeat(50),
 provider:'manual',providerId:'',sourceUrl:'https://example.org'
}));
const records=works.map((w,i)=>({
 workId:w.id,status:'completed',rating:4,visibility:i<1220?'public':'private',
 favorite:null,notes:'private data '.repeat(20),episodes:0,season:1,platform:'',
 hours:null,addedAt:now,updatedAt:now,deletedAt:null
}));
const events=Array.from({length:164},(_,i)=>({
 id:`event:${i}`,workId:works[i].id,date:'2026-10-10',rating:null,
 review:'Short journal '.repeat(15),spoiler:false,visibility:i===0?'public':'private',
 kind:'watch',episodeFrom:null,episodeTo:null,season:1,
 createdAt:now,updatedAt:now,deletedAt:null
}));
const state={works,records,events,lists:[],applied:[]};
const pub={works:works.slice(0,1220),records:records.slice(0,1220).map(r=>({...r,notes:'',episodes:0,season:1,platform:'',hours:null})),
 events:[events[0]],lists:[],applied:[]};
const bytes=x=>Buffer.byteLength(JSON.stringify(x));
const db=new PGlite();await initialize(db);
const role=async(r,fn)=>db.transaction(async tx=>{
 await tx.exec(`set local role ${r}`);
 await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[r==='anon'?'':ownerId]);
 return fn(tx);
});
const t0=performance.now();
await role('authenticated',tx=>tx.query('select public.library_save(0,$1,$2)',[state,pub]));
const writeMs=Math.round(performance.now()-t0);
async function timed(scope,fn){
 const times=[];let result;
 for(let i=0;i<3;i++){
  const t=performance.now();
  result=await role(scope==='owner'?'authenticated':'anon',tx=>fn(tx));
  times.push(Math.round(performance.now()-t));
 }
 return {result,ms:times.sort((a,b)=>a-b)[1]};
}
for(const scope of ['public','owner']){
 const old=scope==='owner'?state:pub;
 const preview=await timed(scope,tx=>tx.query('select public.library_read_preview($1,$2) as response',[ownerId,scope]).then(x=>x.rows[0].response));
 const browse=await timed(scope,tx=>tx.query('select public.library_browse_index($1,$2,$3) as response',[ownerId,scope,{status:'completed',sort:'title',page:'1'}]).then(x=>x.rows[0].response));
 console.log(JSON.stringify({scope,legacy_document_bytes:bytes(old),preview_bytes:bytes(preview.result),browse_bytes:bytes(browse.result),
  preview_reduction_percent:Math.round(100*(1-bytes(preview.result)/bytes(old))),browse_items:browse.result.works.length,
  preview_median_ms:preview.ms,browse_median_ms:browse.ms,synthetic_write_with_sync_ms:writeMs},null,2));
}
await db.close();

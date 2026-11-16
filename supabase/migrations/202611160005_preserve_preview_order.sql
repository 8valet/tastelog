-- Keep preview array order identical to the canonical state document.
-- Indexed rows had been ordered by work ID, which changes roulette ordering
-- and makes client-side history depend on lexicographic IDs.
alter table public.library_read_works
 add column work_position integer not null default 0,
 add column record_position integer;

create or replace function public.library_reindex_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $sync$
declare current_scope text;
begin
 current_scope := case when TG_TABLE_NAME='library_state' then 'owner' else 'public' end;
 with works as (
  select value as item, position::integer as position from jsonb_array_elements(coalesce(new.document->'works','[]'::jsonb)) with ordinality as entry(value,position)
 ), records as (
  select value as item, value->>'workId' as work_id, position::integer as position
  from jsonb_array_elements(coalesce(new.document->'records','[]'::jsonb)) with ordinality as entry(value,position)
 )
 insert into public.library_read_works(
  owner_id,scope,work_id,work,record,type,title,year,genres,status,rating,favorite,added_at,updated_at,search_key,work_position,record_position
 )
 select new.owner_id,current_scope,w.item->>'id',w.item,r.item,
  coalesce(w.item->>'type','unknown'),coalesce(w.item->>'title',''),(w.item->>'year')::integer,
  array(select jsonb_array_elements_text(coalesce(w.item->'genres','[]'::jsonb))),
  r.item->>'status',(r.item->>'rating')::numeric,(r.item->>'favorite')::integer,
  (r.item->>'addedAt')::timestamptz,(r.item->>'updatedAt')::timestamptz,
  public.library_search_key(coalesce(w.item->>'title','') || ' ' ||
   coalesce((select string_agg(a.value,' ') from
      jsonb_array_elements_text(coalesce(w.item->'aliases','[]'::jsonb)) as a(value)),'')),
  w.position,r.position
 from works w left join records r on r.work_id=w.item->>'id'
 on conflict(owner_id,scope,work_id) do update
 set work=excluded.work,record=excluded.record,type=excluded.type,title=excluded.title,
 year=excluded.year,genres=excluded.genres,status=excluded.status,
 rating=excluded.rating,favorite=excluded.favorite,added_at=excluded.added_at,
 updated_at=excluded.updated_at,search_key=excluded.search_key,
 work_position=excluded.work_position,record_position=excluded.record_position
 where (public.library_read_works.work,public.library_read_works.record,
        public.library_read_works.work_position,public.library_read_works.record_position)
   is distinct from (excluded.work,excluded.record,excluded.work_position,excluded.record_position);
 delete from public.library_read_works as row
 where row.owner_id=new.owner_id and row.scope=current_scope
   and not exists(select 1 from jsonb_array_elements(coalesce(new.document->'works','[]'::jsonb)) as w(value)
     where w.value->>'id'=row.work_id);

 insert into public.library_read_events(owner_id,scope,event_id,work_id,event,position)
 select new.owner_id,current_scope,e.value->>'id',e.value->>'workId',e.value,e.position::integer
 from jsonb_array_elements(coalesce(new.document->'events','[]'::jsonb)) with ordinality as e(value,position)
 on conflict(owner_id,scope,event_id) do update
  set event=excluded.event,work_id=excluded.work_id,position=excluded.position
 where (public.library_read_events.event,public.library_read_events.position)
   is distinct from (excluded.event,excluded.position);
 delete from public.library_read_events as row
 where row.owner_id=new.owner_id and row.scope=current_scope
  and not exists(select 1 from jsonb_array_elements(coalesce(new.document->'events','[]'::jsonb)) as e(value)
    where e.value->>'id'=row.event_id);

 insert into public.library_read_lists(owner_id,scope,list_id,list,work_ids,position)
 select new.owner_id,current_scope,l.value->>'id',l.value,
  array(select jsonb_array_elements_text(coalesce(l.value->'workIds','[]'::jsonb))),l.position::integer
 from jsonb_array_elements(coalesce(new.document->'lists','[]'::jsonb)) with ordinality as l(value,position)
 on conflict(owner_id,scope,list_id) do update
  set list=excluded.list,work_ids=excluded.work_ids,position=excluded.position
 where (public.library_read_lists.list,public.library_read_lists.position)
   is distinct from (excluded.list,excluded.position);
 delete from public.library_read_lists as row
 where row.owner_id=new.owner_id and row.scope=current_scope
  and not exists(select 1 from jsonb_array_elements(coalesce(new.document->'lists','[]'::jsonb)) as l(value)
    where l.value->>'id'=row.list_id);
 return new;
end;
$sync$;

create or replace function public.library_read_preview(p_owner uuid, p_scope text)
returns jsonb language sql stable security invoker set search_path='' as $preview$
 select jsonb_build_object(
  'state',jsonb_build_object(
   'works', coalesce((select jsonb_agg(w.work || jsonb_build_object('summary','','sourceUrl','') order by w.work_position,w.work_id)
     from public.library_read_works w where w.owner_id=p_owner and w.scope=p_scope), '[]'::jsonb),
   'records',coalesce((select jsonb_agg(w.record || jsonb_build_object('notes','') order by w.record_position nulls last,w.work_id)
     from public.library_read_works w where w.owner_id=p_owner and w.scope=p_scope and w.record is not null), '[]'::jsonb),
   'events',coalesce((select jsonb_agg(e.event order by e.position)
     from public.library_read_events e where e.owner_id=p_owner and e.scope=p_scope), '[]'::jsonb),
   'lists',coalesce((select jsonb_agg(l.list order by l.position)
     from public.library_read_lists l where l.owner_id=p_owner and l.scope=p_scope), '[]'::jsonb),
   'applied','[]'::jsonb
  ) || coalesce((select jsonb_build_object('overview',m.overview)
       from public.library_read_meta m
       where m.owner_id=p_owner and m.scope=p_scope and m.overview is not null), '{}'::jsonb),
  'revision',coalesce((select revision from public.library_public where owner_id=p_owner),0),
  'owner',p_scope='owner'
 )
 where p_scope in ('owner','public');
$preview$;

-- Backfill original ordinality without changing the canonical document.
-- The existing read-model triggers update in the same transaction.
update public.library_state set document=document;
update public.library_public set document=document;

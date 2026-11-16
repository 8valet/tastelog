-- Indexed, transactionally maintained read model. Canonical JSON documents
-- remain the write/backup source of truth; only the read path is normalized.
-- Every update of library_state/library_public refreshes its corresponding
-- owner/public read model in the SAME transaction as library_save().
create table public.library_read_works (
  owner_id uuid not null references public.library_owners(id) on delete cascade,
  scope text not null check (scope in ('owner', 'public')),
  work_id text not null,
  work jsonb not null,
  record jsonb,
  type text not null,
  title text not null,
  year integer,
  genres text[] not null default '{}',
  status text,
  rating numeric,
  favorite integer,
  added_at timestamptz,
  updated_at timestamptz,
  search_key text not null,
  primary key(owner_id, scope, work_id)
);
create index library_read_works_filters_idx on public.library_read_works(owner_id, scope, type, status);
create index library_read_works_title_idx on public.library_read_works(owner_id, scope, title, work_id);
create index library_read_works_year_idx on public.library_read_works(owner_id, scope, year);
create index library_read_works_rating_idx on public.library_read_works(owner_id, scope, rating);
create index library_read_works_updated_idx on public.library_read_works(owner_id, scope, updated_at);
create index library_read_works_genres_idx on public.library_read_works using gin(genres);

create table public.library_read_events (
  owner_id uuid not null references public.library_owners(id) on delete cascade,
  scope text not null check (scope in ('owner', 'public')),
  event_id text not null,
  work_id text not null,
  event jsonb not null,
  position integer not null,
  primary key(owner_id,scope,event_id)
);
create index library_read_events_work_idx on public.library_read_events(owner_id,scope,work_id);
create table public.library_read_lists (
  owner_id uuid not null references public.library_owners(id) on delete cascade,
  scope text not null check (scope in ('owner', 'public')),
  list_id text not null,
  list jsonb not null,
  work_ids text[] not null,
  position integer not null,
  primary key(owner_id,scope,list_id)
);
create index library_read_lists_members_idx on public.library_read_lists using gin(work_ids);

-- RLS protects the private read model even if a caller tries scope='owner'.
-- Public rows are built solely from the already-sanitized library_public.
alter table public.library_read_works enable row level security;
alter table public.library_read_events enable row level security;
alter table public.library_read_lists enable row level security;
create policy read_works_visibility on public.library_read_works for select to anon,authenticated
  using(scope='public' or (scope='owner' and owner_id=(select auth.uid())));
create policy read_events_visibility on public.library_read_events for select to anon,authenticated
  using(scope='public' or (scope='owner' and owner_id=(select auth.uid())));
create policy read_lists_visibility on public.library_read_lists for select to anon,authenticated
  using(scope='public' or (scope='owner' and owner_id=(select auth.uid())));
create policy read_works_owner_sync on public.library_read_works for all to authenticated
  using(owner_id=(select auth.uid()) and exists(select 1 from public.library_owners where id=(select auth.uid())))
  with check(owner_id=(select auth.uid()) and exists(select 1 from public.library_owners where id=(select auth.uid())));
create policy read_events_owner_sync on public.library_read_events for all to authenticated
  using(owner_id=(select auth.uid()) and exists(select 1 from public.library_owners where id=(select auth.uid())))
  with check(owner_id=(select auth.uid()) and exists(select 1 from public.library_owners where id=(select auth.uid())));
create policy read_lists_owner_sync on public.library_read_lists for all to authenticated
  using(owner_id=(select auth.uid()) and exists(select 1 from public.library_owners where id=(select auth.uid())))
  with check(owner_id=(select auth.uid()) and exists(select 1 from public.library_owners where id=(select auth.uid())));
grant select on public.library_read_works,public.library_read_events,public.library_read_lists to anon,authenticated;
grant insert,update,delete on public.library_read_works,public.library_read_events,public.library_read_lists to authenticated;

create function public.library_search_key(value text) returns text
language sql immutable set search_path = '' as $key$
  select btrim(regexp_replace(
    translate(lower(coalesce(value,'')), 'áàâãäåāçćčéèêëēíìîïīñńóòôöõōúùûüūýÿžźżšśłđ', 'aaaaaaaccceeeeeiiiiinnoooooouuuuuyyzzzssld'),
    '[[:space:][:punct:]]+', ' ', 'g'
  ))
$key$;
revoke all on function public.library_search_key(text) from public;
grant execute on function public.library_search_key(text) to anon,authenticated;

create function public.library_reindex_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $sync$
declare current_scope text;
begin
 current_scope := case when TG_TABLE_NAME='library_state' then 'owner' else 'public' end;
 with works as (
  select value as item from jsonb_array_elements(coalesce(new.document->'works','[]'::jsonb))
 ), records as (
  select value as item, value->>'workId' as work_id
  from jsonb_array_elements(coalesce(new.document->'records','[]'::jsonb))
 )
 insert into public.library_read_works(
  owner_id,scope,work_id,work,record,type,title,year,genres,status,rating,favorite,added_at,updated_at,search_key
 )
 select new.owner_id,current_scope,w.item->>'id',w.item,r.item,
  coalesce(w.item->>'type','unknown'),coalesce(w.item->>'title',''),(w.item->>'year')::integer,
  array(select jsonb_array_elements_text(coalesce(w.item->'genres','[]'::jsonb))),
  r.item->>'status',(r.item->>'rating')::numeric,(r.item->>'favorite')::integer,
  (r.item->>'addedAt')::timestamptz,(r.item->>'updatedAt')::timestamptz,
  public.library_search_key(coalesce(w.item->>'title','') || ' ' ||
   coalesce((select string_agg(a.value,' ') from
      jsonb_array_elements_text(coalesce(w.item->'aliases','[]'::jsonb)) as a(value)),''))
 from works w left join records r on r.work_id=w.item->>'id'
 on conflict(owner_id,scope,work_id) do update
 set work=excluded.work,record=excluded.record,type=excluded.type,title=excluded.title,
 year=excluded.year,genres=excluded.genres,status=excluded.status,
 rating=excluded.rating,favorite=excluded.favorite,added_at=excluded.added_at,
 updated_at=excluded.updated_at,search_key=excluded.search_key
 where (public.library_read_works.work,public.library_read_works.record)
   is distinct from (excluded.work,excluded.record);
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
revoke all on function public.library_reindex_snapshot() from public;
create trigger library_state_reindex after insert or update of document on public.library_state
 for each row execute function public.library_reindex_snapshot();
create trigger library_public_reindex after insert or update of document on public.library_public
 for each row execute function public.library_reindex_snapshot();

-- Preview deliberately excludes costly work summaries and owner notes.
-- This avoids transferring the canonical document at initial page load.
create function public.library_read_preview(p_owner uuid, p_scope text)
returns jsonb language sql stable security invoker set search_path='' as $preview$
 select jsonb_build_object(
  'state',jsonb_build_object(
   'works', coalesce((select jsonb_agg(w.work || jsonb_build_object('summary','','sourceUrl','') order by w.work_id)
     from public.library_read_works w where w.owner_id=p_owner and w.scope=p_scope), '[]'::jsonb),
   'records',coalesce((select jsonb_agg(w.record || jsonb_build_object('notes','') order by w.work_id)
     from public.library_read_works w where w.owner_id=p_owner and w.scope=p_scope and w.record is not null), '[]'::jsonb),
   'events',coalesce((select jsonb_agg(e.event order by e.position)
     from public.library_read_events e where e.owner_id=p_owner and e.scope=p_scope), '[]'::jsonb),
   'lists',coalesce((select jsonb_agg(l.list order by l.position)
     from public.library_read_lists l where l.owner_id=p_owner and l.scope=p_scope), '[]'::jsonb),
   'applied','[]'::jsonb
  ),
  'revision',coalesce(case when p_scope='owner'
     then (select revision from public.library_state where owner_id=p_owner)
     else (select revision from public.library_public where owner_id=p_owner) end,0),
  'owner',p_scope='owner'
 )
 where p_scope in ('owner','public');
$preview$;
revoke all on function public.library_read_preview(uuid,text) from public;
grant execute on function public.library_read_preview(uuid,text) to anon,authenticated;

-- The entire filter, order, and page slice happen inside Postgres. No canonical
-- JSON snapshot is read or sent for collection requests.
create function public.library_browse_index(p_owner uuid,p_scope text,p_filters jsonb)
returns jsonb language sql stable security invoker set search_path='' as $browse$
with args as (
 select
  nullif(p_filters->>'type','') as media_type,
  nullif(p_filters->>'q','') as search,
  nullif(p_filters->>'genre','') as genre,
  nullif(p_filters->>'status','') as status,
  nullif(p_filters->>'rating','') as rating,
  nullif(p_filters->>'decade','') as decade,
  nullif(p_filters->>'year','') as year,
  nullif(p_filters->>'sort','') as sorting,
  nullif(p_filters->>'list','') as list_id,
  least(100000, greatest(1,
   case when coalesce(p_filters->>'page','') ~ '^[0-9]{1,6}$' then (p_filters->>'page')::integer else 1 end
  )) as requested_page
),
scoped as (
 select w.*,array_position(l.work_ids,w.work_id) as list_position
 from public.library_read_works w
 cross join args a
 left join public.library_read_lists l on l.owner_id=p_owner and l.scope=p_scope and l.list_id=a.list_id and l.list->'deletedAt'='null'::jsonb
 where w.owner_id=p_owner and w.scope=p_scope
  and (a.media_type is null or a.media_type='all' or w.type=a.media_type)
  and ((a.list_id is null and w.record is not null and w.record->'deletedAt'='null'::jsonb) or
       (a.list_id is not null and w.work_id=any(coalesce(l.work_ids,'{}'::text[]))))
),
genres as (
 select coalesce(jsonb_agg(jsonb_build_array(name,n) order by name),'[]'::jsonb) as data
 from (select genre as name,count(*) as n
       from scoped s cross join lateral unnest(s.genres) as genre group by genre) g
),
years as (
 select coalesce(jsonb_agg(year order by year desc),'[]'::jsonb) as data
 from (select distinct year from scoped where year is not null) y
),
filtered as (
 select s.* from scoped s cross join args a
 where (a.search is null or s.search_key like '%' || public.library_search_key(a.search) || '%')
  and (a.genre is null or a.genre=any(s.genres))
  and (a.status is null or a.status='all' or s.status=a.status)
  and (a.decade is null or case when a.decade ~ '^[0-9]{4}$' then s.year / 10 * 10 = a.decade::integer else false end)
  and (a.year is null or case when a.year ~ '^[0-9]{4}$' then s.year=a.year::integer else false end)
  and (case
    when a.rating is null then true
    when a.rating='unrated' then s.rating is null
    when a.rating='rated' then s.rating is not null
    when a.rating ~ '^exact:[0-5](\.[05])?$' then s.rating=substring(a.rating from 7)::numeric
    when a.rating ~ '^min:[0-5](\.[05])?$' then s.rating>=substring(a.rating from 5)::numeric
    when a.rating ~ '^[0-5](\.[05])?$' then s.rating>=a.rating::numeric
    else false end)
),
numbered as (
 select f.work, row_number() over(order by
  case when a.sorting='highest' then f.rating end desc nulls last,
  case when a.sorting='lowest' then f.rating end asc nulls last,
  case when a.sorting='newest' then f.year end desc nulls last,
  case when a.sorting='oldest' then f.year end asc nulls last,
  case when a.sorting='updated' then f.updated_at end desc nulls last,
  case when a.sorting is null or a.sorting not in ('highest','lowest','newest','oldest','title','updated')
       then f.list_position end asc nulls last,
  case when a.sorting is null or a.sorting not in ('highest','lowest','newest','oldest','title','updated')
       then f.favorite end asc nulls last,
  f.title asc,f.work_id asc
 ) as position
 from filtered f cross join args a
),
counts as(select count(*)::integer as total from numbered),
page_bounds as(
 select c.total,greatest(1,ceil(c.total::numeric/24)::integer) as pages,
        least(greatest(1,ceil(c.total::numeric/24)::integer),a.requested_page) as page
 from counts c cross join args a
),
slice as(
 select coalesce(jsonb_agg(n.work order by n.position),'[]'::jsonb) as works
 from numbered n cross join page_bounds b where n.position>(b.page-1)*24 and n.position<=b.page*24
)
select jsonb_build_object(
 'works',slice.works,'total',page_bounds.total,
 'page',page_bounds.page,'pages',page_bounds.pages,
 'genres',genres.data,'years',years.data
)
from page_bounds cross join slice cross join genres cross join years
where p_scope in ('owner','public');
$browse$;
revoke all on function public.library_browse_index(uuid,text,jsonb) from public;
grant execute on function public.library_browse_index(uuid,text,jsonb) to anon,authenticated;

-- Backfill the new read index once from existing data. Triggers then maintain
-- both scopes transactionally on each committed library_save().
update public.library_state set document=document;
update public.library_public set document=document;

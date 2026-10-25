-- Rebuild the visitor-facing snapshot from explicitly published items only.
-- The helper exists only for this backfill; future writes use publishState().
create function public.library_public_projection_backfill(source_document jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $projection$
  with document as (
    select coalesce(source_document, '{}'::jsonb) as value
  ),
  public_records as (
    select record.value, record.position
    from document d
    cross join lateral jsonb_array_elements(coalesce(d.value->'records', '[]'::jsonb))
      with ordinality as record(value, position)
    where record.value->>'visibility' = 'public'
      and record.value->'deletedAt' = 'null'::jsonb
  ),
  public_events as (
    select event.value, event.position
    from document d
    cross join lateral jsonb_array_elements(coalesce(d.value->'events', '[]'::jsonb))
      with ordinality as event(value, position)
    where event.value->>'visibility' = 'public'
      and event.value->'deletedAt' = 'null'::jsonb
  ),
  public_lists as (
    select list.value, list.position
    from document d
    cross join lateral jsonb_array_elements(coalesce(d.value->'lists', '[]'::jsonb))
      with ordinality as list(value, position)
    where list.value->>'visibility' = 'public'
      and list.value->'deletedAt' = 'null'::jsonb
  ),
  shared_work_ids as (
    select record.value->>'workId' as work_id from public_records record
    union
    select event.value->>'workId' from public_events event
    union
    select member.value
    from public_lists list
    cross join lateral jsonb_array_elements_text(coalesce(list.value->'workIds', '[]'::jsonb)) as member(value)
  )
  select jsonb_build_object(
    'works', coalesce((
      select jsonb_agg(work.value order by work.position)
      from document d
      cross join lateral jsonb_array_elements(coalesce(d.value->'works', '[]'::jsonb))
        with ordinality as work(value, position)
      where work.value->>'id' in (select work_id from shared_work_ids)
    ), '[]'::jsonb),
    'records', coalesce((
      select jsonb_agg(record.value || jsonb_build_object(
        'notes', '', 'episodes', 0, 'season', 1, 'platform', '', 'hours', null
      ) order by record.position)
      from public_records record
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(event.value - 'source' order by event.position)
      from public_events event
    ), '[]'::jsonb),
    'lists', coalesce((
      select jsonb_agg(list.value order by list.position)
      from public_lists list
    ), '[]'::jsonb),
    'applied', '[]'::jsonb
  );
$projection$;

update public.library_public as published
set document = public.library_public_projection_backfill(owner_state.document),
    updated_at = now()
from public.library_state as owner_state
where owner_state.owner_id = published.owner_id;

delete from public.library_public as published
where not exists (
  select 1 from public.library_state as owner_state
  where owner_state.owner_id = published.owner_id
);

drop function public.library_public_projection_backfill(jsonb);

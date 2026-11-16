-- For anonymous visitors the initial preview may NOT even reference the
-- private library_state table: PostgreSQL checks permissions of all branches
-- of a SQL CASE expression, including branches that are never selected.
-- The public and private revisions are committed atomically by library_save.
-- Read revision from public projection for both scopes; owner still receives
-- private indexed data through RLS-protected read tables.
create or replace function public.library_read_preview(p_owner uuid, p_scope text)
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
  ) || coalesce((select jsonb_build_object('overview',m.overview)
       from public.library_read_meta m
       where m.owner_id=p_owner and m.scope=p_scope and m.overview is not null), '{}'::jsonb),
  'revision',coalesce((select revision from public.library_public where owner_id=p_owner),0),
  'owner',p_scope='owner'
 )
 where p_scope in ('owner','public');
$preview$;

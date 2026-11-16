-- Preserve the portfolio's curated public overview without reading the
-- 1.3 MB canonical JSONB document. Kept in sync with each snapshot write.
create table public.library_read_meta (
  owner_id uuid not null references public.library_owners(id) on delete cascade,
  scope text not null check(scope in ('owner','public')),
  overview jsonb,
  primary key(owner_id,scope)
);
alter table public.library_read_meta enable row level security;
create policy read_meta_visibility on public.library_read_meta for select to anon,authenticated
 using(scope='public' or (scope='owner' and owner_id=(select auth.uid())));
create policy read_meta_insert on public.library_read_meta for insert to authenticated
 with check(owner_id=(select auth.uid()));
create policy read_meta_update on public.library_read_meta for update to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy read_meta_delete on public.library_read_meta for delete to authenticated
 using(owner_id=(select auth.uid()));
grant select on public.library_read_meta to anon,authenticated;
grant insert,update,delete on public.library_read_meta to authenticated;

create function public.library_sync_overview() returns trigger
language plpgsql security invoker set search_path='' as $sync$
begin
 insert into public.library_read_meta(owner_id,scope,overview)
 values(new.owner_id,case when TG_TABLE_NAME='library_state' then 'owner' else 'public' end,
   new.document->'overview')
 on conflict(owner_id,scope) do update set overview=excluded.overview
 where public.library_read_meta.overview is distinct from excluded.overview;
 return new;
end;
$sync$;
revoke all on function public.library_sync_overview() from public;
create trigger library_state_sync_overview after insert or update of document on public.library_state
 for each row execute function public.library_sync_overview();
create trigger library_public_sync_overview after insert or update of document on public.library_public
 for each row execute function public.library_sync_overview();

insert into public.library_read_meta(owner_id,scope,overview)
 select owner_id,'owner',document->'overview' from public.library_state
 union all
 select owner_id,'public',document->'overview' from public.library_public;

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
  'revision',coalesce(case when p_scope='owner'
     then (select revision from public.library_state where owner_id=p_owner)
     else (select revision from public.library_public where owner_id=p_owner) end,0),
  'owner',p_scope='owner'
 )
 where p_scope in ('owner','public');
$preview$;

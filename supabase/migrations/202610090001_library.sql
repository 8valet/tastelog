-- A single-owner aggregate keeps library, diary and ordered lists atomic.
-- Public reads use a separately projected document; the private aggregate is never anonymous-readable.
create table public.library_owners (id uuid primary key references auth.users(id) on delete cascade);
alter table public.library_owners enable row level security;
create policy owner_reads_allowlist on public.library_owners for select to authenticated using (id = auth.uid());
grant select on public.library_owners to authenticated;

create table public.library_state (
  owner_id uuid primary key references public.library_owners(id) on delete cascade,
  revision bigint not null default 0,
  document jsonb not null,
  updated_at timestamptz not null default now(),
  constraint library_document_object check (jsonb_typeof(document) = 'object')
);
alter table public.library_state enable row level security;
create policy private_owner_access on public.library_state for all to authenticated
  using (owner_id = auth.uid() and exists(select 1 from public.library_owners where id = auth.uid()))
  with check (owner_id = auth.uid() and exists(select 1 from public.library_owners where id = auth.uid()));
grant select, insert, update on public.library_state to authenticated;

create table public.library_public (
  owner_id uuid primary key references public.library_owners(id) on delete cascade,
  revision bigint not null default 0,
  document jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.library_public enable row level security;
create policy published_reads on public.library_public for select to anon, authenticated using (true);
create policy published_owner_writes on public.library_public for all to authenticated
  using (owner_id = auth.uid() and exists(select 1 from public.library_owners where id = auth.uid()))
  with check (owner_id = auth.uid() and exists(select 1 from public.library_owners where id = auth.uid()));
grant select on public.library_public to anon, authenticated;
grant insert, update on public.library_public to authenticated;

create function public.library_save(expected_revision bigint, next_document jsonb, public_document jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare new_revision bigint;
begin
  if not exists(select 1 from public.library_owners where id = auth.uid()) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  insert into public.library_state(owner_id, document) values(auth.uid(), '{"works":[],"records":[],"events":[],"lists":[],"applied":[]}'::jsonb)
    on conflict (owner_id) do nothing;
  update public.library_state set document = next_document, revision = revision + 1, updated_at = now()
    where owner_id = auth.uid() and revision = expected_revision returning revision into new_revision;
  if new_revision is null then raise exception 'Library changed on another device' using errcode = '40001'; end if;
  insert into public.library_public(owner_id, document, revision) values(auth.uid(), public_document, new_revision)
    on conflict(owner_id) do update set document = excluded.document, revision = excluded.revision, updated_at = now();
  return new_revision;
end;
$$;
revoke all on function public.library_save(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.library_save(bigint, jsonb, jsonb) to authenticated;

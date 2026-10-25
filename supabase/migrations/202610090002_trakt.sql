-- Credentials are encrypted by the server; this table never enters public DTOs or backups.
create table public.library_trakt (
  owner_id uuid primary key references public.library_owners(id) on delete cascade,
  generation uuid not null,
  account_key text not null,
  username text not null,
  credentials text not null,
  lease_nonce uuid,
  lease_until timestamptz not null default '-infinity',
  preview jsonb,
  last_checked_at timestamptz,
  last_imported_at timestamptz
);
alter table public.library_trakt enable row level security;
create policy trakt_owner_access on public.library_trakt for all to authenticated
  using (owner_id = auth.uid() and exists(select 1 from public.library_owners where id = auth.uid()))
  with check (owner_id = auth.uid() and exists(select 1 from public.library_owners where id = auth.uid()));
grant select, insert, update, delete on public.library_trakt to authenticated;
revoke all on public.library_trakt from anon;

-- Disconnect and import commit serialize on the same row: a stale request cannot
-- commit after its connection has been removed or replaced.
create function public.library_trakt_save(expected_revision bigint, next_document jsonb, public_document jsonb, expected_generation uuid, expected_lease uuid)
returns bigint language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.library_trakt where owner_id = auth.uid()
    and generation = expected_generation and lease_nonce = expected_lease and lease_until > now() for update;
  if not found then raise exception 'Trakt connection changed' using errcode = '40001'; end if;
  return public.library_save(expected_revision, next_document, public_document);
end;
$$;
revoke all on function public.library_trakt_save(bigint,jsonb,jsonb,uuid,uuid) from public,anon;
grant execute on function public.library_trakt_save(bigint,jsonb,jsonb,uuid,uuid) to authenticated;

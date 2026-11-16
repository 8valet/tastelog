-- Replace broad FOR ALL sync policies with operation-specific write policies.
-- The existing visibility policy is the only SELECT policy, avoiding
-- redundant permissive checks on every indexed read.

drop policy read_works_owner_sync on public.library_read_works;
create policy read_works_insert on public.library_read_works
  for insert to authenticated
  with check(owner_id=(select auth.uid()));
create policy read_works_update on public.library_read_works
  for update to authenticated
  using(owner_id=(select auth.uid()))
  with check(owner_id=(select auth.uid()));
create policy read_works_delete on public.library_read_works
  for delete to authenticated
  using(owner_id=(select auth.uid()));

drop policy read_events_owner_sync on public.library_read_events;
create policy read_events_insert on public.library_read_events
  for insert to authenticated
  with check(owner_id=(select auth.uid()));
create policy read_events_update on public.library_read_events
  for update to authenticated
  using(owner_id=(select auth.uid()))
  with check(owner_id=(select auth.uid()));
create policy read_events_delete on public.library_read_events
  for delete to authenticated
  using(owner_id=(select auth.uid()));

drop policy read_lists_owner_sync on public.library_read_lists;
create policy read_lists_insert on public.library_read_lists
  for insert to authenticated
  with check(owner_id=(select auth.uid()));
create policy read_lists_update on public.library_read_lists
  for update to authenticated
  using(owner_id=(select auth.uid()))
  with check(owner_id=(select auth.uid()));
create policy read_lists_delete on public.library_read_lists
  for delete to authenticated
  using(owner_id=(select auth.uid()));

import { readFile, readdir } from 'node:fs/promises';
export const ownerId = '11111111-1111-4111-8111-111111111111';
export const strangerId = '22222222-2222-4222-8222-222222222222';
export const bootstrap = `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`;
export async function initialize(db) {
  await db.exec(bootstrap);
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  const migrations = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  for (const migration of migrations) await db.exec(await readFile(new URL(migration, directory), 'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)', [ownerId, strangerId]);
  await db.query('insert into public.library_owners(id) values($1)', [ownerId]);
}

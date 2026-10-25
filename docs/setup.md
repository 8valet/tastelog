# Database and owner setup

## 1. Create your database

Create a Supabase project you control. In Authentication settings, disable new user signups and anonymous sign-in. Create one confirmed owner user with an email and a strong password in the Auth dashboard. Copy that user's UUID; the database password is a different credential from the owner's login password.

In the Supabase SQL editor, apply these files in order, once each:

1. `supabase/migrations/202610090001_library.sql`
2. `supabase/migrations/202610090002_trakt.sql`
3. `supabase/migrations/202610200001_public_visibility_projection.sql`

All three are safe to apply to a new project in that order; the Trakt tables can stay unused. Do not repeatedly run these migrations over existing tables. The third migration removes accidentally retained private fields from older visitor snapshots; it has no personal records to backfill in a new installation.

Then allowlist the owner, replacing the example with the UUID of the Auth user you created:

```sql
insert into public.library_owners(id) values ('YOUR_OWNER_USER_UUID');
```

The placeholder must be replaced with a real UUID before execution. Do not disable RLS to solve a setup error.

## 2. Configure the app

Copy `.env.example` to `.env.local` and fill in:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PROJECT_PUBLISHABLE_KEY
LIBRARY_OWNER_ID=YOUR_OWNER_USER_UUID
```

These are placeholders. Obtain your own URL and publishable key from the project's Connect/API settings. Do not use a service-role or secret key. The owner ID must match both Auth and `library_owners`.

The app checks the user's identity with Supabase before accessing owner data. Database row policies separately require the matching allowlisted owner. The public projection is available to visitors; unpublished records and private notes are excluded.

## 3. Set recovery URLs

For local use, set the Auth Site URL and allowlisted redirect to `http://localhost:3000/admin/library/reset-password`. Before production, change the Site URL to `https://YOUR_DOMAIN/admin/library/reset-password` and allowlist that exact redirect. You may keep a localhost redirect for local development.

The app does not send public recovery emails. To recover access, select the existing owner user in Supabase Auth and send a password recovery email. Open the newest link and continue on the reset screen. Default recovery fragments and custom `token_hash` links are supported. Keep the same owner identity and records. Supabase's default email sender has delivery and rate restrictions; configure SMTP if needed rather than bypassing authentication.

## 4. Run and verify

```sh
npm run dev
```

Open `/admin/library`, sign in, and add one title manually. Refresh to confirm it saved. Open `/library` in a signed-out browser: the title should remain hidden until you explicitly publish it. Try a second device after deploying to an HTTPS host.

## Backups

In Admin, download a complete JSON backup before replacing data. A restore validates and replaces the state after review; preserve a pre-restore copy. CSV is a collection summary and cannot restore the diary or ordered lists.

New backups use the `media-library` version 1 envelope. Existing `aziz-library` version 1 backups remain readable for compatibility with the original application. That format identifier is retained deliberately; no original records ship with it. Never commit a personal backup or recovery URL.

## Troubleshooting

- **Setup screen persists:** check all three database variables, the owner UUID, and restart/rebuild.
- **Login fails:** check the owner email/password, confirmed Auth account, configured owner ID, and matching allowlist row.
- **Saving fails:** check that all migrations were applied and the owner IDs match. Preserve the draft; do not disable authorization.
- **Catalog is unavailable:** manual entry still works. Add that provider's settings and restart.
- **Another device changed the library:** refresh and retry the retained draft. Revision checks prevent silent overwrites.

Official references: [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), and [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

# Architecture

Tastelog uses Next.js App Router, React, TypeScript, Supabase Auth/Postgres, Zod validation, and Radix Select. See `package.json` and the committed lockfile for exact dependency versions.

## State and privacy

One allowlisted owner has a versioned JSONB aggregate containing works, collection records, diary entries, ordered lists, and request IDs. `library_state` holds the private aggregate; `library_public` holds the visitor projection; `library_owners` holds the owner allowlist; `library_trakt` holds encrypted tokens and pending review state.

Saves atomically update private state and the public projection, with a revision check against concurrent edits. Request IDs make retries idempotent. Private notes, progress/platform/hours, removed data, and provider provenance do not enter the visitor projection. A public list can reveal a title's metadata without exposing its private collection record.

Authorization happens in route/server code and independently through database row policies. The app uses the owner session and publishable key, never a service-role key. Supabase verifies the user before owner access. Writes use server validation and same-origin checks.

The document is bounded to 5,000 works/records, 20,000 diary entries, and 1,000 lists. The browser paginates presentation, not database reads. Same-route section/filter navigation reuses the loaded snapshot through the Next-integrated native History API; direct loads, refreshes, writes, catalogs, and Trakt operations use the server.

## Source map

| Area | Path |
| --- | --- |
| Public/admin entry points | `app/(en)/library/page.tsx`, `app/(en)/admin/library/page.tsx` |
| Main UI and management | `app/(en)/library/library-app.tsx` |
| Controls and artwork | `controls.tsx`, `cover.tsx` in the library directory |
| Canonical styles | `library-base.css`, `library-additions.css` |
| Statistics and roulette | `library-stats.tsx`, `library-roulette.tsx`, `lib/library/roulette.ts` |
| Model, commands, projection and backups | `lib/library/model.ts` |
| Search and review | `lib/library/text.ts`, `discovery.ts`, `catalog-repair.tsx` |
| Storage/auth/HTTP | `lib/library/server.ts`, `http.ts`, `proxy.ts` |
| Catalog and Trakt adapters | `lib/library/catalog.ts`, `trakt*.ts` |
| API routes | `app/api/library/` |
| Public presentation settings | `lib/config.ts` |
| Database | `supabase/migrations/` |
| Isolated fixtures | `tests/fixtures/`, `scripts/library-test-server.mjs` |

## Tests

Unit/model/database tests exercise privacy, RLS, concurrent writes, backup round trips, ratings, search, review, and roulette selection. PGlite runs the real migrations against a synthetic local Auth schema.

Playwright starts a separate local synthetic auth/database service on 3212 and the app on 3211 with `.next-library-tests`. The application contains no fixture mode or auth bypass. Fixtures are not imported by application code. The tests exercise owner and visitor behavior, recovery, desktop/phone controls, reduced motion, and mocked Trakt review. No real account settings or collections are used.

Original import scripts, private migration material, curated suggestions, deployment history, personal poster mappings, and unrelated portfolio code are excluded from this repository.

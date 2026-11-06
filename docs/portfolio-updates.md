# Controlled portfolio updates

TasteLog is the source of truth for reusable library code. The portfolio
adopts reviewed changes from a pinned TasteLog release. Keep the update
record below in the portfolio with the PR that adopts the changes.

For an urgent portfolio fix, record the affected behavior, the portfolio
fix commit if available, and the upstream TasteLog issue or PR. Reproduce it
with synthetic data in TasteLog. Keep the portfolio fix in place until the
adopted release contains a verified replacement.

## Ownership boundary

| TasteLog owns | Portfolio owns |
| --- | --- |
| Reusable library models, browsing, commands, privacy and backup contracts | Site name, logos, typography, colors, layout shell and localized copy |
| Library API behavior, server adapters and reviewed schema migrations | Photography, original artwork, custom covers and personal poster mappings |
| Generic library components and canonical CSS behavior | Portfolio routes, navigation, SEO, social images and presentation overrides |
| Synthetic fixtures and regression tests | Environment files, credentials, owner identity, provider accounts and tokens |
| Versioned compatibility and upgrade notes | Personal database, real collections, backups, import history and deployment settings |

Shared behavior should have narrow configuration/adaptor boundaries for portfolio
presentation. Public name/description settings already exist; broader branding
hooks should be designed in TasteLog as needed. This is currently an application,
not a published embeddable package. Do not claim a package upgrade mechanism
exists or add packaging just to ship this batch.

## Version and provenance

Use a reviewed source transplant for now. Never replace the portfolio repository
with TasteLog or merge its entire standalone application. Do not follow `main`,
an open PR, or a floating tag automatically.

For each later adoption, save a small manifest in the portfolio containing:

- Upstream repository, stable release tag, and resolved full commit SHA.
- Previous adopted SHA, or `unestablished` for the first adoption.
- Explicit upstream-to-portfolio path map and selected file checksums.
- Migration IDs, backup/schema compatibility, and regeneration commands.
- Each intentionally retained portfolio override and temporary downstream fix.
- Test evidence and the previously verified portfolio commit for rollback.

Copy this record into the portfolio when preparing an adoption:

```text
Upstream: https://github.com/8valet/tastelog
Stable tag:
Resolved full commit:
Previous adopted commit: unestablished
Files: upstream path -> portfolio path, upstream SHA-256
Retained overrides and downstream fixes: path, reason, upstream issue/PR
Migrations and backup compatibility:
Regeneration commands:
Synthetic test evidence:
Previously verified portfolio commit for rollback:
```

If a stable tag has not been selected and verified, stop before copying
release files into the portfolio. A baseline comparison can still identify
differences and fixes to bring upstream.

Do not fabricate a baseline for today's divergent portfolio. Establish it by
comparing generic library files against a stable TasteLog commit, documenting
differences, and retaining any unported fixes. The local rapid-filter fix is one
known difference tracked as TL-FILTER-001 in the development plan.

## Prepare an adoption branch

1. Start from a clean, agreed portfolio baseline in an isolated branch/checkout;
   preserve existing uncommitted work. Resolve the chosen stable tag to its SHA
   and verify its checks and release notes. No stable target is selected today.
2. Compare old and new upstream SHAs. On first adoption, review each mapped file
   against the established baseline. Select only the reusable library changes.
   Likely areas are `lib/library/`, `app/api/library/`, library/admin components,
   canonical library CSS, related tests, and applicable migrations. Each path
   still needs explicit review; this is not a recursive copy allowlist.
3. Retain portfolio theme, shell, routes, artwork, metadata, and branding. Exclude
   TasteLog's global layouts, icon, Open Graph image, demo assets, site-wide CSS,
   environment/deployment settings, private directories, and personal data.
   Review shared files such as `proxy.ts`, config, dependencies, and lockfile
   individually. Reconcile dependencies and regenerate the lockfile deliberately.
4. Resolve overlapping UI changes with the portfolio presentation intact. Any
   reusable correction discovered here returns to TasteLog with a synthetic
   regression; record temporary downstream exceptions in the manifest.
5. Regenerate combined library CSS from canonical sources. Review the final diff
   and ensure excluded paths did not change. Do not use a synchronization command
   that deletes or overwrites downstream files indiscriminately.

## Validate with synthetic data

Run TasteLog's relevant regression contract in the portfolio's isolated fixture
environment, then its own build, lint, types, browser, and visual checks. Cover
owner/visitor privacy, explicit sharing, filters/rapid actions/history, overview
order, login, save conflicts, backup restore, and failure recovery. Check phone,
desktop, keyboard, reduced motion, portfolio navigation, and both site languages
where applicable. Use placeholders for personal artwork and invented records.

Never point test configuration at the personal database. Run any migration only
against a disposable synthetic schema first. Verify old snapshots, fresh setup,
repeated upgrades, authorization, and public projection behavior. Keep schema and
backup compatibility separate from application versioning.

## Later promotion and rollback

Prepare a reviewable portfolio diff, manifest, test results, migration plan, and
rollback plan. Stop for an explicit instruction to merge or deploy. A stable
TasteLog release does not authorize a portfolio update or a database migration.

Before an authorized production change, arrange a private database backup outside
TasteLog, verify recovery, and record the currently running portfolio commit.
Review schema upgrades separately; use additive compatible changes where possible.
If the new code fails, restore the previous verified portfolio application commit.
Do not assume application rollback reverses a migration. For an incompatible
schema change, prepare a tested forward repair or an explicitly authorized private
restore that accounts for writes made since the backup. Never perform destructive
restores automatically or change publication choices as part of rollback.

Credentials, provider tokens/encryption keys, original artwork, and the personal
database remain in portfolio-controlled storage throughout. They are never
bundled into a TasteLog release, adoption manifest, test artifact, or public PR.

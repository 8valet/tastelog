# Library development and planned release

Recorded 2026-10-28. Status: collecting features for one planned release.
The proposed release is v1.1.0. Publication is tracked by the GitHub release tag.

## Source of truth

TasteLog owns reusable library behavior, models, privacy rules, API contracts,
database migrations, catalog adapters, and regression coverage. New shared work
starts here. The portfolio consumes stable, reviewed TasteLog versions and owns
its presentation and personal configuration. An urgent portfolio fix must be
tracked here and reproduced with synthetic fixtures before the next update.

This checkout started from `main` at
`0f83a97426d0bbb5d4b8219e628c48d3731b19a2`.
Do not copy the portfolio working tree wholesale: it contains unrelated changes
and personal material, and its library fixes are not all committed upstream.

## Review of existing work

### PR #1: contributor preparation

[Prepare Tastelog for public contributors](https://github.com/8valet/tastelog/pull/1)
is open and unmerged. Reviewed head:
`23761e7ab0b23ac1030d8c933456a057227f5d41`.

The diff adds contributor templates, dependency/security checks, setup copy,
TasteLog presentation, first-run guidance, dependency updates, accessible rating
semantics and names, and missing-cover contrast coverage. It does not modify
the model, public projection, or database migrations. No blocking defect was
identified in the inspected source changes. This is a source review plus existing
CI evidence, not a new local execution of the PR's browser suite.

GitHub checks at this head report success for CI verification, CodeQL, and
JavaScript/TypeScript analysis. The PR description reports lint, types, unit
tests, 11 browser tests, build, release scan, and dependency audits passing.
Recheck the final combined batch after integration; earlier checks do not certify
future changes or live provider behavior.

Overlap to resolve during implementation:

- `library-app.tsx` is touched by PR #1 and by both browsing fixes below. Keep
  its onboarding and accessible controls while integrating behavior changes.
- Browser tests now expect "Add title" and "Settings". Port behavioral
  regressions using the final accessible names rather than old portfolio copy.
- Preserve canonical CSS sources and regenerate `library.css` if styles change.
- The TasteLog monogram, icon, Open Graph image, and global branding in PR #1
  belong to the standalone app; exclude them from portfolio updates.
- Demo records and ratings are illustrative. Existing demo images fetch
  third-party catalog covers; these are not personal art or MIT-licensed assets.
  New development/test fixtures should use invented titles and local placeholder
  artwork with mocked transports, without needing live image hosts.

Recommendation: retain PR #1 as a candidate input to the planned batch. It does
not resolve issue #2 or the rapid-filter bug. No merge or release is authorized
by this review.

### Issue #2: visitor browsing and preview order

[Next release: improve visitor collection browsing and preserve owner preview order](https://github.com/8valet/tastelog/issues/2)
was pending in the baseline and PR #1. The local TasteLog candidate implements
the visitor default and public overview projection.

- [x] Default visitors to all shared statuses, with an explicit All statuses
  control. Preserve explicit URL filters, list behavior, and the owner's default.
- [x] Preserve owner preview selection/order for eligible shared titles by
  publishing only bounded category/title-ID order. Exclude private/removed
  collection entries, even if their metadata is visible through a public list.
- [x] Refresh the projection on successful owner saves. Existing snapshots
  keep their public-only ordering until refreshed by a save.
- [ ] Verify privacy and owner/public ordering with model, database, and browser
  tests using synthetic data, including favorites, private diary history,
  removals, no shared titles, existing snapshots, and repeat upgrades.

The server derives the order from the owner state when saving. It publishes
only the category, overview label, and up to five eligible title IDs per
category. Existing snapshots use the same public-only fallback as before
until an owner save. This upgrade requires no database migration or bulk
republishing.

### TL-FILTER-001: rapid actions restore a cleared filter

Status: fixed in the local portfolio source and ported to the local TasteLog
working tree. This local tracking ID is not a GitHub issue number.

Evidence: portfolio `app/(en)/library/library-app.tsx` (`navigateFilter`),
`tests/library-e2e/accessibility.spec.mjs` (test named "rapid collection filter
changes compose without restoring a removed filter"), and
`docs/portfolio-quality-audit-2026-10-25.md`. These were inspected in the local
portfolio checkout; no immutable fix commit was established. The audit reports
the regression failed before and passed after its fix; it was not rerun here.

Reproduction: open
`/admin/library?view=collection&type=movies&status=all&genre=Drama` using synthetic
records. In a single browser evaluation, click the Genre: Drama chip and then
the completed-status button before React renders new search parameters.
Expected: `genre` stays absent, `status=completed`, and unrelated filters survive.
Current TasteLog source builds both changes from the captured `useSearchParams`
snapshot, so the second action can restore Drama. PR #1 retains that code.

The portfolio fix constructs parameters from `window.location.search` and derives
the current view from those parameters. `history.pushState` updates synchronously,
so the next action composes with the previous one before React catches up.

- [x] Port the focused fix into TasteLog without copying portfolio presentation.
- [x] Verify the deterministic same-turn regression with the synthetic test
  server. It failed before the port and passed after it, including Back and
  Forward restoration.
- [ ] Cover owner and visitor browsing, diary view retention, page reset,
  year/decade exclusivity, and explicit URL filters beyond the rapid-action
  regression.
- [ ] Keep the portfolio fix until its replacement is verified in a stable
  TasteLog adoption; do not overwrite it with an older upstream implementation.

## Plan for the first portfolio update

1. **Finish the reusable fixes in TasteLog.** Review the local rapid-filter
   change and its passing regression. Implement issue #2 with synthetic tests
   for visitor status filters and public overview order. Test empty libraries,
   private diary activity, removed titles, and older public snapshots. Review
   the separate accessibility and ratings work for overlap before combining it.
2. **Verify the release candidate.** Run the clean-install checks below and
   verify backup compatibility and opt-in sharing. Record the candidate commit
   and the results for review. Wait for explicit approval before merging or
   publishing a stable tag.
3. **Prepare a portfolio PR from that stable tag and full commit.** Start from
   an agreed clean portfolio baseline. Use the update record in
   [the portfolio guide](portfolio-updates.md) to list every imported path
   and retained override. Check that the diff excludes personal artwork,
   credentials, records, backups, and deployment settings. Validate the
   portfolio with synthetic data and document rollback.
4. **Promote after separate approval.** Before any authorized production change,
   verify a private backup and record the running portfolio commit. Review and
   authorize any database migration separately. After deployment, check that
   public browsing works and that private records stay private.

For later updates, start shared fixes in TasteLog. If the portfolio needs an
urgent patch first, link it to the corresponding TasteLog issue or PR and keep
it until a verified stable release replaces it.

## Batch and validation gates

The local browsing candidate passed 25 unit and database tests, 12 browser
tests, lint, type checking, the production build, and the release scan.
The v1.1.0 candidate upgrades Next.js and Zod to resolve the critical and
high-severity advisories. The audit still reports moderate findings in the
lint toolchain.

1. Collect additional features here; agree final scope before choosing a version.
2. Integrate PR #1 deliberately and implement issue #2 plus TL-FILTER-001 with
   focused synthetic regressions. Keep unfinished items visibly pending.
3. Run clean-install checks on the combined candidate: `npm ci`, `npm test`,
   `npm run lint`, `npm run build`, `npm run typecheck`, relevant/full
   `npm run test:library:e2e`, dependency audit, and `npm run check:release`.
   Run the release scan with all intended files tracked; it ignores untracked
   files and is not a complete personal-data or secret audit.
4. Review anonymous responses and upgrade fixtures for private-data leakage.
   Test fresh and existing installations, idempotent upgrades, backups, and
   explicit sharing. No migration may automatically publish an owner's data.
5. Record exact commit, checks, known limitations, schema compatibility, and
   rollback requirements. Prepare release notes and a portfolio update diff.
6. Stop before merge/release/tag/publication/deployment until explicitly requested.
   Portfolio adoption is a separate reviewed operation following
   [the update process](portfolio-updates.md).

All development uses isolated synthetic accounts, records, backups, and mocked
catalog/Trakt transports. Do not load the personal database or use production
credentials to validate this batch. Never include private account screenshots,
tokens, personal imports, or custom poster mappings in fixtures or review output.

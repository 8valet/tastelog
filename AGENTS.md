<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Library development policy

TasteLog is the canonical source for future reusable library development. Read
`docs/development-plan.md` before planning library changes and
`docs/portfolio-updates.md` before preparing a downstream portfolio update.

- Build and test reusable features here first. Track any emergency downstream
  fix here with a synthetic regression before the next portfolio update.
- Preserve empty installations, opt-in sharing, and private defaults for records,
  diary entries, lists, and imports. Never generalize a personal publication
  request into an automatic migration for other installations.
- Use synthetic accounts, records, exports, and mocked external services for
  development and tests. Never copy portfolio credentials, artwork, personal
  mappings, database content, or account logs into this repository.
- Keep portfolio branding and deployment configuration downstream. Updates must
  be reviewed against an explicitly pinned stable TasteLog tag and commit.
- We are collecting features for one planned release. Do not choose a final
  version, publish a release/tag/package, merge release work, deploy, or update
  the live portfolio without a later explicit instruction. Routine local work
  and verification may continue.

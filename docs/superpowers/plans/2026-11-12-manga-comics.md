# Manga & Comics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a shared Manga & Comics category with per-title editable format labels for manga, manhwa, comics, and custom formats.

**Architecture:** Extend the existing Work type and schema with a new category plus an optional format field; optionality keeps legacy records and version-1 backups valid. Reuse existing category-driven browsing and manual entry, and show/edit the format in title details and metadata repair. Manga & Comics stays manual-entry only because no compatible catalog is configured.

**Tech Stack:** Next.js 16.3.8, React 19, TypeScript, Zod 4, Node test runner, CSS build script.

**Spec:** `docs/superpowers/specs/2026-11-12-manga-comics-design.md`

## Global Constraints

- Preserve empty installations, opt-in sharing, and private defaults.
- Use synthetic records and no live catalog credentials or personal data.
- Do not choose a release version, publish, merge release work, deploy, or update the live portfolio.
- Read the installed Next.js guide under `node_modules/next/dist/docs/` before writing code.

## Review Focus

- Legacy version-1 backups with no format remain importable — model compatibility test.
- Custom format labels are trimmed, bounded, and optional — schema and model test.
- Public projection carries format only for explicitly shared works — projection test.
- Manga & Comics does not trigger a catalog request without a configured provider — manual-entry UI check.
- Format survives backup export/import and CSV export — export regression.

---

### Task 1: Extend the Work model compatibly

**Files:**
- Modify: `lib/library/model.ts`
- Modify: `lib/library/catalog.ts`
- Test: `tests/library-model.test.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `Work['type']` includes `'comics'`; `Work` has optional `format?: string` with a bounded trimmed string schema.
- Built-in format choices: `Manga`, `Manhwa`, `Comics`; custom text remains valid within the same bound.

- [x] Add model assertions for a comics work with each built-in label and a custom label, rejection of blank/oversized labels, and acceptance of a legacy work without `format`.
- [x] Run the focused model test and confirm the new assertions fail before implementation.
- [x] Add `'comics'` to `types` and `typeNames` as `Manga & Comics`; add optional bounded `format` to `workSchema`.
- [x] Assert `publishState` retains format only through the normal shared-work projection, and backup import/export preserves format while old backups remain valid.
- [x] Append `Format` to CSV output after all existing columns, preserving their order.
- [x] Run model and config tests; confirm they pass.

### Task 2: Integrate category and format in the library UI

**Files:**
- Modify: `app/(en)/library/library-app.tsx`
- Modify: `app/(en)/library/catalog-repair.tsx`
- Modify: `app/(en)/library/controls.tsx`
- Modify: `app/(en)/library/library-stats.tsx`
- Modify: `app/(en)/library/library-roulette.tsx`
- Modify: `lib/library/discovery.ts`
- Modify: `app/(en)/library/library-additions.css` only if a new selector is needed
- Regenerate: `app/(en)/library/library.css` via `npm run build:library-css`
- Test: `tests/library-e2e/manga-comics.spec.mjs`
- Test: `tests/library-model.test.ts`

**Interfaces:**
- Consumes: `types`, `typeNames`, `Work['type']`, and optional `Work['format']` from Task 1.
- Produces: manual Manga & Comics creation with a format selector and a custom-label option; detail/edit display of the saved format.
- Also produces: reading-specific statuses and labels; category included in overview, stats, and roulette; catalog availability explicitly false.

- [x] Add UI coverage for selecting Manga & Comics, saving a custom format, rendering/editing it, reading status choices, overview, and category browsing.
- [x] Add the category to manual add, collection filters, diary category selection, stats and roulette using existing `types` iteration; verify search is unavailable for this category and manual entry remains available.
- [x] Add a format selector with Manga, Manhwa, Comics, Custom, and No format; accept trimmed custom text within the schema limit, preserve values during unrelated metadata edits, and allow clearing a saved format.
- [x] Display format with category in title details and metadata repair; do not present it as a story genre.
- [x] Regenerate canonical CSS if changed; run focused tests plus `npm run typecheck` and `npm run lint`.

## Final review

- [x] Check the diff for unrelated files and generated CSS consistency.
- [x] Confirm current git status includes only intended work; do not merge or release.
- [x] Run unit tests (26/26), typecheck, lint, production build, full browser suite (11/11), and `git diff --check`.

# Manga & Comics section design

Date: 2026-11-12

## Intent
Add one place in TasteLog to track manga, manhwa, and comics, with editable format labels so owners can use or add formats without confusing format with story genre.

## Goals and constraints
- Add a single top-level `Manga & Comics` media category.
- Add an optional format value with built-in labels for Manga, Manhwa, and Comics, and allow custom labels.
- Keep titles, genres, status, ratings, diary, lists, exports, and sharing behavior consistent with other categories.
- Preserve existing records and empty/private defaults. No portfolio branding, release, deployment, or publication work.

## Approaches
- Use genre tags for formats: rejected because manga/manhwa/comics are formats, not story genres.
- Create separate categories: rejected because it splits one reading collection across sections.
- One Manga & Comics category plus editable format labels: selected because it groups browsing and preserves format distinctions while allowing customization.

## Implementation choices
Persist format on each work, make it optional for existing and imported records, and provide the built-in labels plus a custom entry in the title editor. No external catalog integration is included; titles can be entered manually. The builder will adapt all category-dependent browsing and forms, maintain backup compatibility, and add focused synthetic regressions.

import type { LibraryState } from './model.ts';
import { overviewPicks } from './discovery.ts';
import { types } from './model.ts';

/**
 * The public UI needs the whole collection's lightweight metadata for charts,
 * lists, and facets, but only the featured works need full descriptions on
 * the initial render. Owner snapshots are deliberately never projected:
 * optimistic edits and backups require the complete document.
 */
export function projectPublicLibrary(state: LibraryState): LibraryState {
  const featured = new Set<string>();
  for (const type of types) {
    for (const record of overviewPicks(state, type).records) featured.add(record.workId);
  }
  const recent = state.events.filter(event => !event.deletedAt)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);
  for (const event of recent) featured.add(event.workId);
  for (const list of state.lists.filter(list => !list.deletedAt)) {
    for (const id of list.workIds.slice(0, 3)) featured.add(id);
  }
  return {
    ...state,
    works: state.works.map(work => featured.has(work.id) ? work : { ...work, summary: '', sourceUrl: '' }),
  };
}

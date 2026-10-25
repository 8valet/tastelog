import type { LibraryState, Work } from './model.ts';

export function plannedTitles(state: LibraryState, categories: readonly Work['type'][]): Work[] {
  const selected = new Set(categories);
  const planned = new Set(state.records.filter(record => !record.deletedAt && record.status === 'backlog').map(record => record.workId));
  return state.works.filter(work => selected.has(work.type) && planned.has(work.id));
}

export function pickTitle(candidates: readonly Work[], random: () => number = Math.random): Work | null {
  return candidates.length ? candidates[Math.floor(random() * candidates.length)] : null;
}

import type { LibraryState, Work } from './model.ts';
import { matchesTitle, searchKey } from './text.ts';

export function duplicateCandidates(state: LibraryState) {
  const active = new Set(state.records.filter(r => !r.deletedAt).map(r => r.workId));
  const groups = new Map<string, Work[]>(), seen = new Set<string>(), pairs: [Work, Work][] = [];
  for (const work of state.works.filter(w => active.has(w.id))) {
    for (const title of [work.title, ...(work.aliases || [])]) {
      const key = `${work.type === 'games' ? 'game' : 'screen'}:${searchKey(title)}`;
      for (const other of groups.get(key) || []) {
        if (other.id === work.id || work.year && other.year && work.year !== other.year) continue;
        const pair = [other.id, work.id].sort().join('|');
        if (!seen.has(pair)) { pairs.push([other, work]); seen.add(pair); }
      }
      groups.set(key, [...(groups.get(key) || []), work]);
    }
  }
  return pairs;
}
export function browseDiary(state: LibraryState, filters: { q?: string; type?: string; from?: string; to?: string; page?: string }, pageSize = 30) {
  const works = new Map(state.works.map(w => [w.id, w]));
  const events = state.events.filter(e => !e.deletedAt && (!filters.type || works.get(e.workId)?.type === filters.type) && (!filters.q || matchesTitle(works.get(e.workId)!, filters.q) || searchKey(e.review).includes(searchKey(filters.q))) && (!filters.from || e.date && e.date >= filters.from) && (!filters.to || e.date && e.date <= filters.to)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(events.length / pageSize)), page = Math.min(pages, Math.max(1, Number.parseInt(filters.page || '1') || 1));
  return { events: events.slice((page - 1) * pageSize, page * pageSize), total: events.length, page, pages };
}
export function overviewPicks(state: LibraryState, type: Work['type']) {
  const overviewPickLimit = 5;
  const ids = new Set(state.works.filter(w => w.type === type).map(w => w.id));
  const records = state.records.filter(r => !r.deletedAt && ids.has(r.workId));
  const favorites = records.filter(r => r.favorite).sort((a, b) => a.favorite! - b.favorite!);
  if (favorites.length) return { label: 'Favorites', records: favorites.slice(0, overviewPickLimit) };
  const lastWatch = new Map<string, string>();
  for (const e of state.events) if (!e.deletedAt && e.date && (!lastWatch.has(e.workId) || lastWatch.get(e.workId)! < e.date)) lastWatch.set(e.workId, e.date);
  return { label: 'Recently watched / finished', records: records.filter(r => r.status === 'completed').sort((a, b) => (lastWatch.get(b.workId) || '').localeCompare(lastWatch.get(a.workId) || '') || b.updatedAt.localeCompare(a.updatedAt) || a.workId.localeCompare(b.workId)).slice(0, overviewPickLimit) };
}

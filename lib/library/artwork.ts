import type { Work } from './model';

// Each installation uses its own saved artwork. No personal import mappings ship.
export function posterSources(work: Pick<Work, 'id' | 'sourceUrl' | 'poster'>): string[] {
  return work.poster ? [work.poster] : [];
}

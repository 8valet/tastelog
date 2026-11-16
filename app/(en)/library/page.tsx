import { libraryConfig } from '../../../lib/config';
import type { Metadata } from 'next';
import { configured, readLibraryPage } from '../../../lib/library/server';
import { catalogAvailability } from '../../../lib/library/catalog';
import { emptyState } from '../../../lib/library/model';
import LibraryApp from './library-app';
import './library.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: libraryConfig.name,
  description: libraryConfig.description,
  robots: { index: false, follow: false },
  openGraph: { title: libraryConfig.name, description: libraryConfig.description, type: 'website' },
};
type LibraryPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  let snapshot = { state: emptyState(), revision: 0, owner: false }, error = '';
  let initialBrowse;
  const raw = await searchParams;
  const filters = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
  if (configured()) {
    try {
      const loaded = await readLibraryPage(filters, filters.view === 'collection');
      snapshot = loaded.snapshot;
      initialBrowse = loaded.initialBrowse;
    } catch { error = 'The library could not be loaded. Please try again shortly.'; }
  }
  return <LibraryApp key={`${snapshot.owner}:${snapshot.revision}`} initial={snapshot} initialBrowse={initialBrowse} preview={true} configured={configured()} catalogs={catalogAvailability()} initialError={error} />;
}

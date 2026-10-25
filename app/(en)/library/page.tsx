import { libraryConfig } from '../../../lib/config';
import type { Metadata } from 'next';
import { configured, readLibrary } from '../../../lib/library/server';
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
export default async function LibraryPage() {
  let snapshot = { state: emptyState(), revision: 0, owner: false }, error = '';
  if (configured()) { try { snapshot = await readLibrary(); } catch { error = 'The library could not be loaded. Please try again shortly.'; } }
  return <LibraryApp key={`${snapshot.owner}:${snapshot.revision}`} initial={snapshot} configured={configured()} catalogs={catalogAvailability()} initialError={error} />;
}

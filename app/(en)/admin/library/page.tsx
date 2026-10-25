import type { Metadata } from 'next';
import { configured, readLibrary } from '../../../../lib/library/server';
import { catalogAvailability } from '../../../../lib/library/catalog';
import { emptyState } from '../../../../lib/library/model';
import LibraryApp from '../../library/library-app';
import '../../library/library.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Library admin', robots: { index: false, follow: false } };
export default async function LibraryAdmin() {
  let snapshot = { state: emptyState(), revision: 0, owner: false }, error = '';
  if (configured()) { try { snapshot = await readLibrary(); } catch { error = 'The library could not be loaded. Check the database setup and try again.'; } }
  // An anonymous admin request receives the public DTO only, followed by the login form.
  return <LibraryApp key={`${snapshot.owner}:${snapshot.revision}`} initial={snapshot} configured={configured()} catalogs={catalogAvailability()} initialError={error} admin />;
}

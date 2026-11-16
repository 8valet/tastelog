import { NextRequest } from 'next/server';
import { readLibrary, readIndexedBrowse, readIndexedWork, writeLibrary } from '../../../lib/library/server';
import { body, failure, json } from '../../../lib/library/http';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    // Indexed detail and collection queries never load the full JSON document.
    if (params.has('work')) {
      const workId = params.get('work') || '';
      if (!/^[a-zA-Z0-9:_-]{1,180}$/.test(workId)) return json({ error: 'Invalid title identifier.' }, 400);
      const data = await readIndexedWork(workId);
      return data ? json(data) : json({ error: 'Title not found.' }, 404);
    }
    if (params.has('browse')) {
      const filters = Object.fromEntries(params);
      return json(await readIndexedBrowse(filters));
    }
    // Full snapshots are deliberately opt-in for owner editing, backups,
    // legacy integrations, and recovery. They are never part of normal browsing.
    return json(await readLibrary());
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const saved = await writeLibrary(await body(request));
    // The owner already has the full snapshot in the browser. Returning it on
    // every mutation needlessly transfers a megabyte-scale document again.
    return json({ revision: saved.revision, owner: saved.owner });
  } catch (error) { return failure(error); }
}

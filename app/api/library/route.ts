import { NextRequest } from 'next/server';
import { readLibrary, writeLibrary } from '../../../lib/library/server';
import { body, failure, json } from '../../../lib/library/http';
import { browse } from '../../../lib/library/model';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const data = await readLibrary();
    if (request.nextUrl.searchParams.has('browse')) return json(browse(data.state, Object.fromEntries(request.nextUrl.searchParams)));
    return json(data);
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

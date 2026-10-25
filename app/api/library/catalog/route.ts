import { NextRequest } from 'next/server';
import { z } from 'zod';
import { catalogDetails, searchCatalog } from '../../../../lib/library/catalog';
import { ownerSession, LibraryError } from '../../../../lib/library/server';
import { failure, json } from '../../../../lib/library/http';
import { types } from '../../../../lib/library/model';
const input = z.object({ type: z.enum(types), q: z.string().trim().min(2).max(200).optional(), id: z.string().regex(/^\d{1,12}$/).optional() }).refine(v => Boolean(v.q || v.id), 'Enter at least two characters.');
let requests: number[] = [];
export async function GET(request: NextRequest) {
  try {
    await ownerSession(true);
    requests = requests.filter(t => t > Date.now() - 60000);
    if (requests.length >= 40) throw new LibraryError('Please wait a moment before searching again.', 429);
    requests.push(Date.now());
    const f = input.parse(Object.fromEntries(request.nextUrl.searchParams));
    return json(f.id ? { work: await catalogDetails(f.type, f.id) } : { works: await searchCatalog(f.type, f.q!) });
  } catch (error) { return failure(error); }
}

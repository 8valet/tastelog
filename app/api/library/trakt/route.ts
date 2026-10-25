import { NextRequest } from 'next/server';
import { z } from 'zod';
import { body, failure, json } from '../../../../lib/library/http';
import { disconnectTrakt, importTrakt, previewTrakt, startTrakt, traktStatus } from '../../../../lib/library/trakt';
import { ownerSession } from '../../../../lib/library/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect') }).strict(),
  z.object({ action: z.literal('disconnect') }).strict(),
  z.object({ action: z.literal('preview'), page: z.number().int().min(1).max(10000), timezone: z.string().min(1).max(100) }).strict(),
  z.object({ action: z.literal('import'), previewId: z.string().uuid(), selected: z.array(z.string().regex(/^trakt:[a-f0-9]{64}$/)).min(1).max(50), revision: z.number().int().nonnegative(), requestId: z.string().uuid() }).strict(),
]);
export async function GET(request: NextRequest) { try { return json(await traktStatus(request)); } catch (error) { return failure(error); } }
export async function POST(request: NextRequest) {
  try {
    const input = inputSchema.parse(await body(request, 10000));
    await ownerSession(true);
    switch (input.action) {
      case 'connect': return json(await startTrakt(request));
      case 'disconnect': return json(await disconnectTrakt());
      case 'preview': return json(await previewTrakt(input.page, input.timezone));
      case 'import': return json(await importTrakt(input));
    }
  } catch (error) { return failure(error); }
}

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { LibraryError } from './server';
import { LibraryCommandError } from './model';

export const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Cookie', 'X-Robots-Tag': 'noindex, nofollow' };
export function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: privateHeaders }); }
export function failure(error: unknown) {
  if (error instanceof LibraryCommandError) return json({ error: error.message }, 400);
  if (error instanceof ZodError) return json({ error: error.issues[0]?.message ?? 'Check the information and try again.' }, 400);
  return json({ error: error instanceof LibraryError ? error.message : 'The request could not be completed. Your changes have not been saved.' }, error instanceof LibraryError ? error.status : 500);
}
export async function body(request: NextRequest, limit = 6_000_000) {
  const origin = request.headers.get('origin');
  if (origin !== request.nextUrl.origin) throw new LibraryError('Open this form on the library website before submitting.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new LibraryError('Send a JSON request.', 415);
  if (Number(request.headers.get('content-length') ?? 0) > limit) throw new LibraryError('This file is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LibraryError('The request is empty.');
  let length = 0, raw = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new LibraryError('This file is too large.', 413); }
    raw += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(raw + decoder.decode()); } catch { throw new LibraryError('The file is not valid JSON.'); }
}

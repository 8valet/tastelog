import { NextRequest } from 'next/server';
import { z } from 'zod';
import { libraryClient, LibraryError } from '../../../../lib/library/server';
import { body, failure, json } from '../../../../lib/library/http';
const input = z.object({ email: z.email().max(320), password: z.string().min(1).max(1000) }).strict();
export async function POST(request: NextRequest) {
  try {
    const credentials = input.parse(await body(request, 10000));
    const client = await libraryClient();
    const { data, error } = await client.auth.signInWithPassword(credentials);
    if (error || data.user?.id !== process.env.LIBRARY_OWNER_ID) {
      if (data.session) await client.auth.signOut();
      throw new LibraryError('That login could not be verified as the library owner. Check your email and password.', 401);
    }
    return json({ success: true });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    await body(request, 100);
    const client = await libraryClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new LibraryError('Sign out failed. Please try again.', 503);
    return json({ success: true });
  } catch (error) { return failure(error); }
}

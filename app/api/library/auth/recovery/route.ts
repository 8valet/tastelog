import { NextRequest } from 'next/server';
import { z } from 'zod';
import { libraryClient, LibraryError, ownerSession } from '../../../../../lib/library/server';
import { body, failure, json } from '../../../../../lib/library/http';

const linkInput = z.union([
  z.object({ tokenHash: z.string().min(20).max(512) }).strict(),
  z.object({ accessToken: z.string().min(20).max(12000), refreshToken: z.string().min(1).max(2000) }).strict(),
]);
const passwordInput = z.object({ password: z.string().min(12).max(1000) }).strict();

export async function POST(request: NextRequest) {
  try {
    const link = linkInput.parse(await body(request, 16000));
    const client = await libraryClient();
    const { data, error } = 'tokenHash' in link
      ? await client.auth.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' })
      : await client.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
    const verified = error || !data.session ? null : await client.auth.getUser();
    if (error || !data.session || verified?.error || verified?.data.user?.id !== process.env.LIBRARY_OWNER_ID) {
      if (data.session) await client.auth.signOut({ scope: 'local' });
      throw new LibraryError('This reset link is invalid or has expired. Request a new password recovery email in Supabase.', 401);
    }
    return json({ success: true });
  } catch (error) { return failure(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const { password } = passwordInput.parse(await body(request, 5000));
    const { client } = await ownerSession(true);
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new LibraryError(error.code === 'same_password'
      ? 'Choose a different password from the previous one.'
      : 'The password could not be changed. Use at least 12 characters and try again.', 400);
    const signedOut = await client.auth.signOut({ scope: 'global' });
    return json({ success: true, sessionsRevoked: !signedOut.error });
  } catch (error) { return failure(error); }
}

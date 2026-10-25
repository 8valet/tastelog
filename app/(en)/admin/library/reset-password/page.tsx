import type { Metadata } from 'next';
import { configured, ownerSession } from '../../../../../lib/library/server';
import ResetPassword from './reset-password';
import '../../../library/library.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reset library password', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === 'string' && params.token_hash.length <= 512 ? params.token_hash : '';
  let authenticated = false;
  if (configured()) { try { authenticated = (await ownerSession()).owner; } catch { /* Offer recovery instead of assuming a session. */ } }
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = projectUrl ? new URL(projectUrl).hostname.split('.')[0] : '';
  return <ResetPassword tokenHash={tokenHash} authenticated={authenticated} dashboardUrl={projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/auth/users` : 'https://supabase.com/dashboard'} />;
}

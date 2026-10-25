import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return response;

  const pathname = request.nextUrl.pathname;
  const isLibraryApi = pathname === '/api/library' || pathname.startsWith('/api/library/');
  if (!isLibraryApi) {
    const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: values => {
          for (const { name, value } of values) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of values) response.cookies.set(name, value, { ...options, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
        },
      },
      global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store', signal: options?.signal ?? AbortSignal.timeout(12000) }) },
    });
    try { await client.auth.getUser(); } catch { /* Server-rendered pages refresh cookies here; page data still verifies ownership. */ }
  }

  // API handlers verify identity themselves and can refresh cookies through Route Handler cookies().
  // Avoid a second Supabase auth request before those handlers run.
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Vary', 'Cookie');
  if (pathname.startsWith('/admin/library/reset-password')) response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
export const config = { matcher: ['/library/:path*', '/admin/library/:path*', '/api/library/:path*'] };

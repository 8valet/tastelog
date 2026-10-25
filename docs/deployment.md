# Deployment

Tastelog needs a Node.js server; a static export cannot run authentication, catalog lookups, or database writes. Deploy your own instance. The repository does not deploy automatically or reuse the original portfolio's hosting/database.

## Node hosting

Use Node.js 24 or newer. Install from the lockfile, set the environment variables from `.env.example`, then build and start:

```sh
npm ci
npm run build
npm start
```

`next start` listens on port 3000 by default. You can pass a different port with `npm start -- -p 3100`. Use a trusted HTTPS reverse proxy in production and keep the app origin consistent with Supabase recovery and Trakt callbacks. Production auth cookies are secure and require HTTPS.

## Vercel

Import your own fork/repository as a Next.js project. Use the repository root, Node 24 or newer, `npm run build`, and framework output defaults. Add your own environment values before building. No `.vercel` project identity or deployment credentials are included.

Set `SITE_URL` to the production HTTPS origin. Configure the exact password-reset URL in Supabase. If using Trakt, its registered callback and `TRAKT_REDIRECT_URI` must use the same origin. Settle the production domain before connecting Trakt; preview domains should use separate settings or leave Trakt disabled.

## After deploying

1. Visit `/library` signed out and confirm no private titles are shown.
2. Sign in at `/admin/library`, add a private title, refresh, and confirm it persists.
3. Publish a title deliberately and verify only its intended fields appear signed out.
4. Check a second device and password recovery.
5. Test each optional catalog and Trakt connection with your own credentials.

The app sends `private, no-store` for library responses. Do not add shared caches in front of owner pages or APIs. Keep public signups disabled and leave database RLS enabled. Rebuild when changing `NEXT_PUBLIC_` variables.

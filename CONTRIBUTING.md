# Contributing

Open an issue describing the concrete behavior before proposing major changes. Keep the single-owner model, private/public separation, half-star ratings, and independent diary/current ratings intact.

Use Node 24 or newer, `npm ci`, then run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and the relevant Playwright tests. New UI flows should work with keyboard input, narrow phones, missing artwork, and reduced motion.

Use synthetic test data. Never include API keys, passwords, cookies, recovery URLs, personal exports, logs from real accounts, or screenshots of private collections in issues, commits, or pull requests. Keep styles in the canonical CSS sources and regenerate the combined file.

Read the installed Next.js documentation under `node_modules/next/dist/docs/` before changing framework conventions. Keep dependency versions and the lockfile in sync.

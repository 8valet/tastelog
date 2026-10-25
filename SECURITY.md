# Security

Do not disclose credentials or private library records in public issues. For a suspected vulnerability, use the repository's private vulnerability reporting feature if available; otherwise contact the maintainer privately before publishing details.

Keep public signups disabled, use a publishable Supabase key, preserve RLS and owner checks, and deploy with HTTPS. Do not cache private library responses. The Trakt encryption key must stay secret and stable. Back up data before restoring or changing storage.

This application is intended for one owner per installation. It has not been audited as a public multi-user service. Automated tests cover isolated fixtures; live email/provider behavior depends on your settings and external services.

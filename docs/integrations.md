# Catalogs and Trakt

All integrations are optional. Use your own developer accounts and review each provider's current terms, attribution, and permitted use before deploying. A configured credential is not proof of a successful request. Missing settings leave manual entry available.

## Movies and TV: TMDB

Register an application in [TMDB API settings](https://www.themoviedb.org/settings/api). Set `TMDB_READ_TOKEN` to the API Read Access Token (bearer token). The separate API key field is not the setting this adapter uses. Search/details provide metadata and posters, not playback. Retain the Credits attribution in Admin and follow any branding requirements for your intended use.

[TMDB authentication documentation](https://developer.themoviedb.org/docs/authentication-application)

## Anime: MyAnimeList

Register an application in [MyAnimeList API configuration](https://myanimelist.net/apiconfig) and set `MAL_CLIENT_ID`. The adapter uses official v2 catalog search/details with `X-MAL-CLIENT-ID`. It does not connect a MAL user account or sync a user's list. AniList is not integrated.

## Games: IGDB / Twitch

Register your own confidential application in the [Twitch developer console](https://dev.twitch.tv/console/apps). Set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. The server obtains an application token and uses IGDB search/details. Game artwork uses portrait covers; missing artwork has a built-in fallback.

[IGDB setup documentation](https://api-docs.igdb.com/#account-creation)

## Trakt history review

Trakt requires your own deployed HTTPS app. Register the exact callback `https://YOUR_DOMAIN/api/library/trakt/callback` in your Trakt application, then set `TRAKT_CLIENT_ID` and `TRAKT_REDIRECT_URI`.

Generate a new local encryption key:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Save the result as `TRAKT_ENCRYPTION_KEY` on your server. Keep it stable and backed up securely; changing it makes previously stored Trakt tokens unreadable. Never put it in a public variable or commit it. This is a local encryption key, not an API credential to paste into chat.

Deploy/rebuild, sign in at the exact HTTPS origin configured in the callback, and open Admin → Harbor → Trakt → Connect Trakt. The app uses S256 PKCE and encrypted server storage. It intentionally refuses localhost HTTP OAuth connections.

Use **Check for watches**, review the titles, then select what to import. Imports are private and do not write back to Trakt. Existing manual ratings and states are preserved. TV tracking is at title level; there is no episode mapping. Harbor is one possible upstream Trakt client, not a direct integration: it must use the same Trakt account. Automatic background sync is not enabled.

Use your own provider accounts to verify real searches and OAuth after setup. The automated browser suite mocks external transports and does not establish live provider approval, token renewal, revocation, or email delivery.

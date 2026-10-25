export const traktFailureMessages = {
  origin: 'Open your library at the HTTPS origin configured for Trakt, then start Connect Trakt there.',
  session: 'Your library sign-in expired during the connection. Sign in to the library, then choose Connect Trakt again.',
  attempt: 'The connection attempt was lost. Choose Connect Trakt again and finish in the same browser.',
  expired: 'The connection attempt expired. Choose Connect Trakt again to start a fresh connection.',
  cancelled: 'Trakt access was not approved. Choose Connect Trakt again if you want to connect.',
  state: 'The connection could not be verified. Choose Connect Trakt again and finish in the same browser.',
  code: 'Trakt did not return a valid sign-in result. Choose Connect Trakt again.',
  token: 'Trakt could not complete sign-in with the website. Your library is unchanged. Try Connect Trakt again; if this repeats, report this message.',
  profile: 'Trakt sign-in returned, but the website could not verify your Trakt account. Your library is unchanged. Report this message if it repeats.',
  save: 'Your Trakt connection could not be saved. Your library is unchanged. Report this message if it repeats.',
} as const;
export type TraktFailureReason = keyof typeof traktFailureMessages;
export function traktFailureMessage(reason: string | null) {
  return reason && Object.hasOwn(traktFailureMessages, reason)
    ? traktFailureMessages[reason as TraktFailureReason]
    : 'Trakt sign-in was not completed. Your library is unchanged; start the connection again.';
}

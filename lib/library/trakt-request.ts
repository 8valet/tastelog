export function traktRequestHeaders(clientId: string, supplied?: HeadersInit) {
  const headers = new Headers(supplied);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  headers.set('User-Agent', 'Tastelog/1.0');
  headers.set('trakt-api-key', clientId);
  headers.set('trakt-api-version', '2');
  return headers;
}

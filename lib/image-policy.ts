// Only known public artwork providers may be fetched by the server optimizer.
// Other owner-selected HTTPS artwork keeps the native browser fallback.
export const posterImageHosts = [
  'image.tmdb.org',
  'cdn.myanimelist.net',
  'm.media-amazon.com',
  'images.igdb.com',
  'shared.fastly.steamstatic.com',
  'cdn.akamai.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'images.steamusercontent.com',
];

export function canOptimizePoster(source: string) {
  if (source.startsWith('/') && !source.startsWith('//')) return !/\.svg(?:\?|$)/i.test(source);
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && posterImageHosts.includes(url.hostname);
  } catch { return false; }
}

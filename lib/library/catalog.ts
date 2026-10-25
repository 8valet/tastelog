import 'server-only';
import { Work, workSchema } from './model';
import { LibraryError } from './server';

export function catalogAvailability() {
  return { movies: Boolean(process.env.TMDB_READ_TOKEN), tv: Boolean(process.env.TMDB_READ_TOKEN), anime: Boolean(process.env.MAL_CLIENT_ID), games: Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) };
}
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new LibraryError('This catalog is temporarily unavailable. Try again or add the title manually.', 502);
  return response.json();
}
const year = (value?: string) => value && /^\d{4}/.test(value) ? Number(value.slice(0, 4)) : null;
type TmdbTitle = { id: number; title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string; poster_path?: string; overview?: string; genre_ids?: number[]; genres?: { id: number; name: string }[]; number_of_episodes?: number; number_of_seasons?: number };
async function tmdb(path: string) { return request(`https://api.themoviedb.org/3/${path}`, { headers: { Authorization: `Bearer ${process.env.TMDB_READ_TOKEN}` } }); }
function tmdbWork(t: TmdbTitle, type: 'movies' | 'tv', genres: { id: number; name: string }[] = []): Work {
  const kind = type === 'movies' ? 'movie' : 'tv';
  return workSchema.parse({ id: `tmdb:${kind}:${t.id}`, type, title: t.title || t.name, aliases: [t.original_title, t.original_name].filter(Boolean), year: year(t.release_date || t.first_air_date),
    poster: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : '',
    genres: (t.genres || genres.filter(g => t.genre_ids?.includes(g.id))).map(g => g.name), episodes: t.number_of_episodes ?? null, seasons: t.number_of_seasons ?? null,
    summary: t.overview || '', provider: 'tmdb', providerId: String(t.id), sourceUrl: `https://www.themoviedb.org/${kind}/${t.id}` });
}
type MalTitle = { id: number; title: string; main_picture?: { large?: string; medium?: string }; start_date?: string; synopsis?: string; genres?: { name: string }[]; num_episodes?: number; alternative_titles?: { en?: string; ja?: string; synonyms?: string[] } };
const malFields = 'id,title,main_picture,start_date,synopsis,genres,num_episodes,alternative_titles';
async function mal(path: string) { return request(`https://api.myanimelist.net/v2/${path}`, { headers: { 'X-MAL-CLIENT-ID': process.env.MAL_CLIENT_ID! } }); }
function malWork(t: MalTitle): Work {
  return workSchema.parse({ id: `mal:anime:${t.id}`, type: 'anime', title: t.title, aliases: [...new Set([t.alternative_titles?.en, t.alternative_titles?.ja, ...(t.alternative_titles?.synonyms || [])].filter(Boolean))], year: year(t.start_date), poster: t.main_picture?.large || t.main_picture?.medium || '', genres: t.genres?.map(g => g.name) || [],
    episodes: t.num_episodes || null, seasons: null, summary: t.synopsis || '', provider: 'mal', providerId: String(t.id), sourceUrl: `https://myanimelist.net/anime/${t.id}` });
}
type Game = { id: number; name: string; first_release_date?: number; summary?: string; cover?: { image_id: string }; genres?: { name: string }[]; url?: string; alternative_names?: { name: string }[] };
let twitchToken: { value: string; expires: number } | null = null;
async function igdb(query: string) {
  if (!twitchToken || twitchToken.expires < Date.now()) {
    const params = new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID!, client_secret: process.env.TWITCH_CLIENT_SECRET!, grant_type: 'client_credentials' });
    const result = await request('https://id.twitch.tv/oauth2/token', { method: 'POST', body: params });
    twitchToken = { value: result.access_token, expires: Date.now() + Math.max(0, result.expires_in - 120) * 1000 };
  }
  return request('https://api.igdb.com/v4/games', { method: 'POST', headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${twitchToken.value}`, 'Content-Type': 'text/plain' }, body: query });
}
const gameFields = 'fields id,name,first_release_date,summary,cover.image_id,genres.name,url,alternative_names.name;';
function gameWork(t: Game): Work {
  return workSchema.parse({ id: `igdb:game:${t.id}`, type: 'games', title: t.name, aliases: t.alternative_names?.map(n => n.name) || [], year: t.first_release_date ? new Date(t.first_release_date * 1000).getUTCFullYear() : null,
    poster: t.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${t.cover.image_id}.jpg` : '', genres: t.genres?.map(g => g.name) || [],
    episodes: null, seasons: null, summary: t.summary || '', provider: 'igdb', providerId: String(t.id), sourceUrl: t.url || `https://www.igdb.com/games/${t.id}` });
}
export async function searchCatalog(type: Work['type'], query: string): Promise<Work[]> {
  if (!catalogAvailability()[type]) throw new LibraryError('This catalog is not connected yet. You can still add a title manually.', 503);
  try {
    if (type === 'movies' || type === 'tv') {
      const kind = type === 'movies' ? 'movie' : 'tv';
      const [results, genres] = await Promise.all([tmdb(`search/${kind}?query=${encodeURIComponent(query)}&include_adult=false`), tmdb(`genre/${kind}/list`)]);
      return (results.results as TmdbTitle[]).slice(0, 20).map(t => tmdbWork(t, type, genres.genres));
    }
    if (type === 'anime') {
      const result = await mal(`anime?q=${encodeURIComponent(query)}&limit=20&fields=${malFields}`);
      return (result.data as { node: MalTitle }[]).map(t => malWork(t.node));
    }
    // JSON quoting escapes quotes, slashes and newlines rather than interpolating query syntax.
    const result = await igdb(`${gameFields} search ${JSON.stringify(query)}; limit 20;`);
    return (result as Game[]).map(gameWork);
  } catch (error) { if (error instanceof LibraryError) throw error; throw new LibraryError('The catalog could not be searched. Try again or add the title manually.', 502); }
}
export async function catalogDetails(type: Work['type'], providerId: string): Promise<Work> {
  if (!/^\d{1,12}$/.test(providerId)) throw new LibraryError('Choose a valid catalog title.');
  if (!catalogAvailability()[type]) throw new LibraryError('This catalog is not connected.', 503);
  try {
    if (type === 'movies' || type === 'tv') return tmdbWork(await tmdb(`${type === 'movies' ? 'movie' : 'tv'}/${providerId}`), type);
    if (type === 'anime') return malWork(await mal(`anime/${providerId}?fields=${malFields}`));
    const results = await igdb(`${gameFields} where id = ${providerId}; limit 1;`);
    if (!results[0]) throw new LibraryError('That catalog title was not found.', 404);
    return gameWork(results[0]);
  } catch (error) { if (error instanceof LibraryError) throw error; throw new LibraryError('Title details could not be loaded. Try again.', 502); }
}

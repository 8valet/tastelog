import { test, expect } from '@playwright/test';
import { suggestions } from '../fixtures/works.ts';
import { historyEntry, hash } from '../../lib/library/trakt-core.ts';
const origin = 'http://localhost:3211';
async function login(page) {
  for (const password of ['new-isolated-password', 'library-test-password']) {
    const response = await page.request.post('/api/library/auth', { headers: { Origin: origin }, data: { email: 'owner@library.test', password } });
    if (response.ok()) { await page.goto('/admin/library'); return; }
  }
  throw new Error('Isolated fixture sign-in failed');
}
test('Trakt routes require owner/origin and the local connection explains HTTPS without contacting Trakt', async ({ page, browser }) => {
  const anon = await browser.newContext();
  expect((await anon.request.get(`${origin}/api/library/trakt`)).status()).toBe(401);
  expect((await anon.request.post(`${origin}/api/library/trakt`, { headers: { Origin: origin }, data: { action: 'connect' } })).status()).toBe(401);
  expect((await anon.request.post(`${origin}/api/library/trakt`, { headers: { Origin: 'https://unrelated.test' }, data: { action: 'connect' } })).status()).toBe(403);
  await login(page);
  await expect(page.getByRole('button', { name: 'Add / Log', exact: true })).toBeVisible();
  const status = await (await page.request.get('/api/library/trakt')).json(); expect(status.connected).toBe(false); expect(status.canConnect).toBe(false);
  const denied = await page.request.post('/api/library/trakt', { headers: { Origin: origin }, data: { action: 'connect' } }); expect(denied.status()).toBe(409);
  await page.goto('/admin/library?view=settings');
  await expect(page.getByRole('button', { name: 'Connect Trakt', exact: true })).toBeDisabled();
  await expect(page.getByText('Sign-in requires the deployed HTTPS library. This local page cannot connect Trakt.')).toBeVisible();
  const callback = await page.request.get('/api/library/trakt/callback?code=isolated-private-code&state=isolated-state', { maxRedirects: 0 });
  expect(callback.status()).toBe(303);
  const redirect = new URL(callback.headers().location);
  expect(redirect.searchParams.get('trakt_reason')).toBe('origin');
  expect(redirect.searchParams.has('code')).toBe(false);
  expect(redirect.searchParams.has('state')).toBe(false);
  await anon.close();
});

test('failed connections explain recovery without leaving stale errors after a successful connection', async ({ page }) => {
  await login(page);
  let connected = false;
  await page.route('**/api/library/trakt', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ configured: true, canConnect: true, connected, username: 'fixture', preview: null }) }));
  await page.goto('/admin/library?view=settings&trakt=failed&trakt_reason=token');
  const connectionSection = page.getByRole('region', { name: 'Harbor → Trakt' });
  await expect(connectionSection.getByRole('alert')).toHaveText('Trakt could not complete sign-in with the website. Your library is unchanged. Try Connect Trakt again; if this repeats, report this message.');
  await expect(page.getByRole('button', { name: 'Connect Trakt', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  connected = true;
  await page.reload();
  await expect(page.getByText('Connected · @fixture', { exact: true })).toBeVisible();
  await expect(connectionSection.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check for watches', exact: true })).toBeEnabled();
});

test('review selection, private import, duplicates, outages and disconnect are clear on desktop and phone', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('button', { name: 'Add / Log', exact: true })).toBeVisible();
  // Only the provider/connection transport is mocked. The import uses the real
  // application command endpoint and isolated Postgres storage.
  const work = { ...suggestions[0], id: 'tmdb:movie:999', provider: 'tmdb', providerId: '999', title: 'Trakt private fixture' };
  const entry = historyEntry({ id: 991, watched_at: '2026-10-09T22:30:00Z', type: 'movie' }, work, hash('fixture-trakt-account'), 'Asia/Riyadh');
  let connected = true, fail = false, conflict = true, retryId = null;
  let preview = null;
  await page.route('**/api/library/trakt', async route => {
    const input = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    const fulfill = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (!input) return fulfill({ configured: true, canConnect: true, connected, username: 'fixture', preview });
    if (input.action === 'preview') {
      if (fail) return fulfill({ error: 'Trakt is limiting requests. Wait before trying again; your library is unchanged.' }, 429);
      preview = { id: crypto.randomUUID(), page: 1, pages: 1, total: 2, checkedAt: new Date().toISOString(), timezone: 'Asia/Riyadh', entries: [{ entry, duplicate: false, removed: false }], skipped: [{ title: 'Anime fixture', reason: 'Needs a reviewed mapping.' }] }; return fulfill(preview);
    }
    if (input.action === 'import') {
      expect(input.selected).toEqual([entry.event.id]);
      if (conflict) {
        retryId = input.requestId; conflict = false;
        const current = await (await page.request.get('/api/library')).json();
        await page.request.post('/api/library', { headers: { Origin: origin }, data: { revision: current.revision, requestId: crypto.randomUUID(), command: { op: 'list', list: { id: 'fixture:conflict', name: 'Other device fixture', description: '', visibility: 'private', workIds: [] } } } });
        const rejected = await page.request.post('/api/library', { headers: { Origin: origin }, data: { revision: input.revision, requestId: input.requestId, command: { op: 'trakt-import', entries: [entry] } } });
        expect(rejected.status()).toBe(409); return fulfill(await rejected.json(), 409);
      }
      expect(input.requestId).toBe(retryId);
      const response = await page.request.post('/api/library', { headers: { Origin: origin }, data: { revision: input.revision, requestId: input.requestId, command: { op: 'trakt-import', entries: [entry] } } });
      expect(response.status()).toBe(200);
      preview.entries[0].duplicate = true;
      const snapshot = await (await page.request.get('/api/library')).json();
      return fulfill(snapshot);
    }
    if (input.action === 'disconnect') { connected = false; preview = null; return fulfill({ disconnected: true, revoked: true }); }
    throw new Error('Unexpected connection action');
  });
  await page.goto('/admin/library?view=settings');
  await page.getByRole('button', { name: 'Check for watches', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review watch history' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Import.*selected watches/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Select all new watches on this page' }).click();
  await page.getByRole('button', { name: 'Import 1 selected watches' }).click();
  await expect(page.getByText(/Your library changed on another device/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 1 selected watches' })).toBeEnabled();
  await page.getByRole('button', { name: 'Refresh library and connection' }).click();
  await expect(page.getByText(/Your library changed on another device/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Import 1 selected watches' }).click();
  await expect(page.getByText('Selected titles saved to your private collection.')).toBeVisible();
  await expect(page.getByText('Already imported · kept as edited', { exact: false })).toBeVisible();
  const state = await (await page.request.get('/api/library')).json(); expect(state.state.events.some(e => e.id === entry.event.id && e.source.watchedAt === '2026-10-09T22:30:00.000Z')).toBe(true);
  const publicState = await (await page.request.get('/library')).text(); expect(publicState).not.toContain('fixture-trakt-account');
  fail = true; await page.getByRole('button', { name: 'Check for watches', exact: true }).click(); await expect(page.getByText(/Trakt is limiting requests/)).toBeVisible(); await expect(page.getByRole('heading', { name: 'Review watch history' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click(); await page.getByRole('button', { name: 'Disconnect Trakt', exact: true }).click(); await expect(page.getByText('Trakt disconnected. Imported entries are kept.')).toBeVisible(); await expect(page.getByRole('button', { name: 'Connect Trakt', exact: true })).toBeEnabled();
});

 test('MVP series review shows title status without episode controls', async ({ page }) => {
  await login(page);
  const work = { ...suggestions[0], id: 'tmdb:tv:46260', type: 'tv', provider: 'tmdb', providerId: '46260', title: 'Naruto MVP fixture', genres: ['Animation'] };
  const entry = historyEntry({ id: 992, watched_at: '2026-10-10T16:00:00Z', type: 'episode', episode: { season: 1, number: 2 } }, work, hash('fixture-trakt-account'), 'Asia/Riyadh');
  const preview = { id: crypto.randomUUID(), page: 1, pages: 1, total: 1, checkedAt: new Date().toISOString(), timezone: 'Asia/Riyadh', entries: [{ entry, duplicate: false, removed: false }], skipped: [] };
  await page.route('**/api/library/trakt', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ configured: true, canConnect: true, connected: true, username: 'fixture', preview }) }));
  await page.goto('/admin/library?view=settings');
  await expect(page.getByText('Mark Watching · private', { exact: false })).toBeVisible();
  await expect(page.getByText('watches need manual matching', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select all new watches on this page' }).click();
  await expect(page.getByRole('button', { name: 'Import 1 selected watches' })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/admin/library');
  await page.getByRole('button', { name: 'Add / Log', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /The Paper Observatory/ }).first().click();
  await page.getByRole('combobox', { name: 'What would you like to do?' }).click();
  await expect(page.getByRole('option', { name: 'Log episodes' })).toHaveCount(0);
 });

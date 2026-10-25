import { test, expect } from '@playwright/test';
import { suggestions } from '../fixtures/works.ts';
const origin = 'http://localhost:3211';
async function login(page) {
  await page.goto('/admin/library');
  await page.getByLabel('Email', { exact: true }).fill('owner@library.test');
  await page.getByLabel('Password', { exact: true }).fill('library-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add / Log', exact: true })).toBeVisible();
}
async function choose(page, label, option) {
  const scope = await page.getByRole('dialog').count() ? page.getByRole('dialog') : page;
  await scope.getByRole('combobox', { name: label, exact: true }).click();
  await scope.getByRole('option', { name: option, exact: true }).click();
}
async function commit(page, name) {
  const [response] = await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/library') && r.request().method() === 'POST'), page.getByRole('button', { name, exact: true }).click()]);
  expect(response.status()).toBe(200);
}
async function command(request, cmd) {
  const current = await (await request.get(`${origin}/api/library`)).json();
  const response = await request.post(`${origin}/api/library`, { headers: { Origin: origin }, data: { revision: current.revision, requestId: crypto.randomUUID(), command: cmd } });
  expect(response.status()).toBe(200); return response.json();
}
test('owner logging, privacy, cross-session saving, catalogs fallback, lists, backups and keyboard/mobile UI', async ({ page, browser }) => {
  const anon = await browser.newContext();
  expect((await anon.request.get(`${origin}/api/library/export`)).status()).toBe(401);
  const bad = await anon.request.post(`${origin}/api/library`, { headers: { Origin: origin }, data: { revision: 0, requestId: 'unauthorized', command: { op: 'save', work: suggestions[0], patch: {} } } });
  expect(bad.status()).toBe(401);
  await login(page);
  await command(page.request, { op: 'save', work: suggestions[0], patch: {} });
  await page.reload();
  await page.getByRole('button', { name: 'Add / Log', exact: true }).click();
  await expect(page.getByText('This catalog is not connected yet.', { exact: false })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /The Paper Observatory/ }).click();
  await commit(page, 'Save entry');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/admin/library?view=collection&status=all');
  let state = await (await page.request.get('/api/library')).json();
  expect(state.state.events).toHaveLength(0); expect(state.state.records[0].visibility).toBe('private');
  const privateResponse = await anon.request.get(`${origin}/api/library`); expect(JSON.stringify(await privateResponse.json())).not.toContain('The Paper Observatory');
  await page.getByRole('button', { name: 'The Paper Observatory', exact: true }).click();
  await page.getByRole('slider', { name: 'My current rating', exact: true }).focus(); await page.keyboard.press('End'); await page.keyboard.press('ArrowLeft');
  await choose(page, 'Status', 'Watched');
  await choose(page, 'Collection visibility', 'Publish title, status and current rating');
  await page.getByLabel('Favorite · order can be edited in Admin').check();
  await page.getByText('Private notes', { exact: true }).click();
  await page.getByLabel('Notes', { exact: true }).fill('SECRET_OWNER_NOTE');
  await commit(page, 'Save changes');
  await expect(page.getByText('Saved to your library.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  state = await (await page.request.get('/api/library')).json(); expect(state.state.events).toHaveLength(0);
  const publicData = await (await anon.request.get(`${origin}/api/library`)).json();
  expect(publicData.state.records[0].rating).toBe(4.5); expect(JSON.stringify(publicData)).not.toContain('SECRET_OWNER_NOTE');
  const device2 = await browser.newContext(); const phone = await device2.newPage(); await login(phone);
  const second = await (await device2.request.get(`${origin}/api/library`)).json(); expect(second.state.records[0].rating).toBe(4.5);
  await page.reload(); await expect(page.getByRole('img', { name: '4.5 out of 5 stars', exact: true }).first()).toBeVisible();

  // Populate only the isolated test database with the nine synthetic fixtures.
  for (const [index, w] of suggestions.entries()) if (index) await command(page.request, { op: 'save', work: w, patch: { rating: index % 3 ? 4 : null, favorite: index % 3 + 1, visibility: index < 3 ? 'public' : 'private', status: index === 3 ? 'active' : 'backlog', notes: 'TEST_FIXTURE_PRIVATE', episodes: index === 3 ? 3 : 0 } });
  await page.goto('/admin/library?view=overview');
  await commit(page, 'Mark Watched'); await expect(page.getByText('Marked Watched.', { exact: true })).toBeVisible();
  await commit(page, 'Undo');
  const afterUndo = await (await page.request.get('/api/library')).json(); expect(afterUndo.state.records.find(r => r.workId === suggestions[3].id).episodes).toBe(3);
  await page.getByRole('link', { name: 'Collection', exact: true }).click();
  await choose(page, 'Sort by', 'My rating: highest'); await expect(page).toHaveURL(/sort=highest/);
  await choose(page, 'Genre', 'Drama (5)'); await expect(page).toHaveURL(/genre=Drama/);
  await page.reload(); await expect(page.getByRole('combobox', { name: 'Genre', exact: true })).toContainText('Drama');
  await page.getByRole('button', { name: 'Games', exact: true }).click(); await expect(page.getByText('No matching titles', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Drama', exact: false }).click();
  const playedFilter = page.getByRole('button', { name: 'Played', exact: true });
  await playedFilter.focus(); await page.keyboard.press('Enter');
  await expect(playedFilter).toBeFocused(); await expect(playedFilter).toHaveAttribute('aria-pressed', 'false');
  await expect(page).toHaveURL(/status=all/);
  await page.getByRole('button', { name: 'Ember Circuit', exact: true }).click(); await page.getByLabel('Platform (optional)').fill('PC'); await page.getByLabel('Hours played (optional)').fill('30.5');
  await commit(page, 'Save changes'); await page.getByRole('button', { name: 'Close', exact: true }).click();

  // Log twice; clearing Today must preserve an unknown date and repeat events.
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Add / Log', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: /The Paper Observatory/ }).click();
    await choose(page, 'What would you like to do?', 'Log a watch / rewatch'); await page.getByRole('slider', { name: 'Rating for this diary entry (optional)', exact: true }).focus(); await page.keyboard.press('End'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.getByLabel('Also update my current rating', { exact: true }).check();
    await page.getByLabel('Date · today by default').fill('');
    await page.getByText('Add a review (optional)', { exact: true }).click(); await page.getByLabel('Review', { exact: true }).fill('SECRET_DIARY_REVIEW');
    await commit(page, 'Save entry'); await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  state = await (await page.request.get('/api/library')).json(); expect(state.state.events).toHaveLength(2); expect(state.state.events[0].date).toBeNull();
  expect(JSON.stringify(await (await anon.request.get(`${origin}/api/library`)).json())).not.toContain('SECRET_DIARY_REVIEW');
  await page.getByRole('link', { name: 'Diary', exact: true }).click(); await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await page.getByRole('slider', { name: 'Event rating', exact: true }).focus(); await page.keyboard.press('Home'); for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await commit(page, 'Save changes'); await expect(page.getByRole('dialog')).toHaveCount(0); state = await (await page.request.get('/api/library')).json(); expect(state.state.records[0].rating).toBe(4);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await commit(page, 'Remove entry'); await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('link', { name: 'Lists', exact: true }).click(); await page.getByRole('button', { name: 'Create list', exact: true }).click(); await page.getByLabel('List name', { exact: true }).fill('A shared evening');
  await choose(page, 'Visibility', 'Publish this list'); await page.getByRole('button', { name: 'Orbit Couriers', exact: true }).click(); await page.getByRole('button', { name: 'The Paper Observatory', exact: true }).click(); await commit(page, 'Save list'); await expect(page.getByRole('dialog')).toHaveCount(0);
  const publishedList = await (await anon.request.get(`${origin}/api/library`)).json(); expect(publishedList.state.lists[0].workIds).toEqual([suggestions[3].id, suggestions[0].id]); expect(publishedList.state.records.some(r => r.workId === suggestions[3].id)).toBe(false);
  expect(JSON.stringify(publishedList)).not.toContain('TEST_FIXTURE_PRIVATE');
  await page.getByRole('link', { name: 'Admin', exact: true }).click();
  await commit(page, 'Restore'); state = await (await page.request.get('/api/library')).json(); expect(state.state.events.every(e => e.deletedAt == null)).toBe(true);
  const exportResponse = await page.request.get('/api/library/export'); expect(exportResponse.status()).toBe(200); const backup = await exportResponse.json(); expect(backup.state.records).toHaveLength(9);
  await page.getByLabel('Review a library backup').setInputFiles({ name: 'library.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) }); await expect(page.getByText('Restore review', { exact: true })).toBeVisible();
  await page.getByLabel('I want to replace this library with the reviewed backup.').check(); await commit(page, 'Restore reviewed backup'); await expect(page.getByText('Backup restored.', { exact: true })).toBeVisible();
  const unauthorizedOrigin = await page.request.post('/api/library', { headers: { Origin: 'https://unrelated.example' }, data: { revision: 0, requestId: 'csrf', command: { op: 'save', work: suggestions[0], patch: {} } } }); expect(unauthorizedOrigin.status()).toBe(403);
  const stale = await page.request.post('/api/library', { headers: { Origin: origin }, data: { revision: 0, requestId: 'stale', command: { op: 'edit', workId: suggestions[0].id, patch: { rating: 1 } } } }); expect(stale.status()).toBe(409);

  // One batched desktop/phone capture round over the completed library and admin.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 811, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto('/admin/library?view=overview'); await expect(page.locator('.az-library[data-library-ready="true"]')).toBeVisible(); await expect(page.getByRole('button', { name: 'Ember Circuit', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `work/review/overview-${width}.png`, fullPage: true });
    await page.goto('/admin/library?view=collection&type=games&status=all'); await expect(page.locator('.az-library[data-library-ready="true"]')).toBeVisible();
    if (width <= 760) {
      const collectionColumns = await page.locator('.collection-grid').evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
      expect(collectionColumns).toBe(2);
      for (const name of ['Diary', 'Lists']) {
        const target = await page.getByRole('link', { name, exact: true }).boundingBox();
        expect(target?.width).toBeGreaterThanOrEqual(44);
        expect(target?.height).toBeGreaterThanOrEqual(44);
      }
    }
    await expect(page.getByRole('group', { name: 'Filter by status' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Genre', exact: true })).toBeVisible();
    const ratingTrigger = page.getByRole('button', { name: /My rating/ });
    await ratingTrigger.click();
    await expect(page.getByRole('dialog', { name: 'Filter by rating' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Filter by rating' })).toHaveCount(0);
    if (width <= 760) await page.screenshot({ path: `work/review/collection-controls-${width}.png` });
    const covers = page.locator('.poster-frame img'); await expect(covers).toHaveCount(3);
    for (const cover of await covers.all()) expect(await cover.evaluate(el => getComputedStyle(el).objectFit)).toBe('contain');
    await page.getByRole('combobox', { name: 'Genre', exact: true }).click(); await expect(page.getByRole('listbox')).toBeVisible();
    // Full-page screenshots resize the browser and intentionally dismiss Radix menus.
    // Capture open layers at the real viewport, so Escape is tested on an open menu.
    await page.screenshot({ path: `work/review/collection-${width}.png` }); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Ember Circuit', exact: true }).click(); await page.getByRole('slider', { name: 'My current rating', exact: true }).focus(); await page.getByRole('dialog').getByRole('combobox', { name: 'Status', exact: true }).click(); await expect(page.getByRole('listbox')).toBeVisible();
    await page.screenshot({ path: `work/review/detail-${width}.png` }); await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto('/admin/library?view=settings'); await expect(page.locator('.az-library[data-library-ready="true"]')).toBeVisible();
    if (width <= 760) {
      const portfolio = page.locator('footer').getByRole('link', { name: 'Public library', exact: false });
      expect((await portfolio.boundingBox()).height).toBeGreaterThanOrEqual(44);
      const sentence = await page.locator('footer > span').boundingBox();
      expect((await portfolio.boundingBox()).y).toBeGreaterThanOrEqual(sentence.y + sentence.height);
    }
    await page.screenshot({ path: `work/review/admin-${width}.png`, fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/admin/library?view=collection'); await page.getByRole('combobox', { name: 'Sort by', exact: true }).click(); expect(await page.getByRole('listbox').evaluate(el => getComputedStyle(el).animationName)).toBe('none'); await page.keyboard.press('Escape');

  // Failed/expired saves leave a manual draft in the form and never claim success.
  await page.getByRole('button', { name: 'Add / Log', exact: true }).click(); await page.getByRole('button', { name: /Can’t find it/ }).click(); await page.getByLabel('Title', { exact: true }).fill('Unsaved manual title'); await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.context().clearCookies(); await page.getByRole('button', { name: 'Save entry', exact: true }).click(); await expect(page.getByRole('dialog').getByText('Unsaved manual title', { exact: true })).toBeVisible(); await expect(page.getByRole('dialog').getByText('Sign in as the library owner to continue.', { exact: true })).toBeVisible();
  await anon.close(); await device2.close();
});

test('remove updates the collection immediately while the server save is still pending', async ({ page }) => {
  await login(page);
  const work = { ...suggestions[0], id: 'manual:latency-check', title: 'Latency check title', provider: 'manual', providerId: '', poster: '', aliases: [] };
  await command(page.request, { op: 'save', work, patch: { status: 'backlog' } });
  await page.goto('/admin/library?view=collection&status=backlog');

  let activeSave;
  await page.route('**/api/library', async route => {
    if (route.request().method() === 'POST' && activeSave) {
      const save = activeSave;
      activeSave = null;
      save.markRequestStarted();
      await save.gate;
    }
    await route.continue();
  });
  const holdNextSave = () => {
    let release;
    let markRequestStarted;
    const requestStarted = new Promise(resolve => { markRequestStarted = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    activeSave = { gate, markRequestStarted };
    return { requestStarted, release };
  };

  const removeSave = holdNextSave();
  await page.getByRole('button', { name: work.title, exact: true }).click();
  await page.getByRole('button', { name: 'Remove from collection', exact: true }).click();
  await removeSave.requestStarted;
  await expect(page.getByRole('button', { name: work.title, exact: true })).toHaveCount(0);
  await expect(page.getByText('Removing from your collection…', { exact: true })).toBeVisible();

  const saveResponse = page.waitForResponse(response => response.url().endsWith('/api/library') && response.request().method() === 'POST');
  removeSave.release();
  const response = await saveResponse;
  expect(response.status()).toBe(200);
  expect((await response.body()).byteLength).toBeLessThan(100);
  await expect(page.getByText('Moved to Recently removed. Diary and lists were kept.', { exact: true })).toBeVisible();
  const saved = await (await page.request.get('/api/library')).json();
  expect(saved.state.records.find(record => record.workId === work.id).deletedAt).toBeTruthy();

  const addedTitle = 'Latency check add title';
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Add / Log', exact: true }).click();
  await page.getByRole('button', { name: /Can’t find it/ }).click();
  await page.getByLabel('Title', { exact: true }).fill(addedTitle);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const addSave = holdNextSave();
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await addSave.requestStarted;
  await expect(page.getByRole('button', { name: addedTitle, exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  const addResponse = page.waitForResponse(response => response.url().endsWith('/api/library') && response.request().method() === 'POST');
  addSave.release();
  const addedResponse = await addResponse;
  expect(addedResponse.status()).toBe(200);
  expect((await addedResponse.body()).byteLength).toBeLessThan(100);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});


test('safe unrated logging, half stars, metadata correction and reviewed merge/undo', async ({ page }) => {
  await login(page);
  const stamp = new Date().toISOString();
  const source = { ...suggestions[0], id: 'manual:naruto', provider: 'manual', providerId: '', title: 'Naruto', year: 2002, type: 'movies', poster: '', aliases: [] };
  const target = { ...source, id: 'mal:anime:20', provider: 'mal', providerId: '20', type: 'anime' };
  const movie = suggestions[0];
  const record = (w, rating) => ({ workId: w.id, status: 'completed', rating, visibility: 'private', favorite: null, notes: w.id, episodes: 0, season: 1, platform: '', hours: null, addedAt: stamp, updatedAt: stamp, deletedAt: null });
  await command(page.request, { op: 'restore', state: { works: [movie, source, target], records: [record(movie, 5), record(source, 3), record(target, 4.5)], events: [], lists: [{ id: 'list:review', name: 'Imported favorites', description: '', visibility: 'private', workIds: [source.id, target.id], updatedAt: stamp, deletedAt: null }], applied: [] } });
  await page.goto('/admin/library?view=collection');
  await page.getByRole('button', { name: movie.title, exact: true }).click();
  await page.getByRole('button', { name: 'Log a watch', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'What would you like to do?', exact: true })).toContainText('Log a watch / rewatch');
  await expect(page.getByLabel('Also update my current rating', { exact: true })).toBeDisabled();
  await commit(page, 'Save entry');
  let state = (await (await page.request.get('/api/library')).json()).state;
  expect(state.records.find(r => r.workId === movie.id).rating).toBe(5);
  expect(state.events[0].rating).toBeNull();
  await page.getByRole('button', { name: movie.title, exact: true }).click();
  const stars = page.getByRole('slider', { name: 'My current rating', exact: true });
  await stars.focus(); await page.keyboard.press('ArrowLeft'); await expect(stars).toHaveAttribute('aria-valuenow', '4.5');
  await commit(page, 'Save changes'); await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('img', { name: '4.5 out of 5 stars' }).first()).toBeVisible();
  await page.goto('/admin/library?view=settings');
  await page.getByText('Possible duplicate titles · 1', { exact: true }).click(); await page.getByRole('button', { name: 'Review match', exact: true }).click();
  await page.getByText('Edit title metadata', { exact: true }).click(); await choose(page, 'Category', 'Anime');
  await page.getByLabel('Alternate titles · one per line', { exact: true }).fill('Ninja adventures'); await commit(page, 'Save metadata');
  await page.goto('/admin/library?view=collection&q=Ninja+adventures'); await expect(page.getByRole('button', { name: 'Naruto', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Naruto', exact: true }).click(); await page.getByRole('button', { name: 'Edit metadata / match catalog', exact: true }).click();
  await page.getByRole('button', { name: /Naruto.*Already in your library/ }).click();
  await expect(page.getByRole('button', { name: 'Save reviewed match', exact: true })).toBeDisabled();
  await page.getByLabel('I checked that these are the same work.', { exact: true }).check(); await commit(page, 'Save reviewed match');
  state = (await (await page.request.get('/api/library')).json()).state;
  expect(state.works).toHaveLength(2); expect(state.records.find(r => r.workId === target.id).rating).toBe(4.5); expect(state.lists[0].workIds).toEqual([target.id]);
  await commit(page, 'Undo cleanup'); state = (await (await page.request.get('/api/library')).json()).state; expect(state.works).toHaveLength(3);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/admin/library?view=collection');
  expect(await page.locator('.collection-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
  await page.getByRole('button', { name: movie.title, exact: true }).click();
  await expect(page.getByRole('slider', { name: 'My current rating', exact: true })).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Half star', exact: true }).click(); await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow', '5');
  await page.getByRole('button', { name: 'Clear rating', exact: true }).click(); await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Unrated');
});

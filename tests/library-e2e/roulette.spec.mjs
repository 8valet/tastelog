import { test, expect } from '@playwright/test';
import { applyCommand, emptyState } from '../../lib/library/model.ts';
import { suggestions } from '../fixtures/works.ts';

async function command(request, value) {
  const current = await (await request.get('/api/library')).json();
  const response = await request.post('/api/library', {
    headers: { Origin: 'http://localhost:3211' },
    data: { revision: current.revision, requestId: crypto.randomUUID(), command: value },
  });
  expect(response.status()).toBe(200);
}

test('owner roulette: full planned pool, fair reel landing, keyboard, mobile and reduced motion', async ({ page, browser }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const anonymous = await browser.newContext();
  const publicPage = await anonymous.newPage();
  await publicPage.goto('http://localhost:3211/library');
  await expect(publicPage.getByRole('button', { name: 'Pick for me', exact: true })).toHaveCount(0);
  await anonymous.close();

  // The recovery suite changes this shared fixture's password.
  for (const password of ['new-isolated-password', 'library-test-password']) {
    const response = await page.request.post('/api/library/auth', {
      headers: { Origin: 'http://localhost:3211' }, data: { email: 'owner@library.test', password },
    });
    if (response.ok()) break;
  }
  await page.goto('/admin/library');
  const trigger = page.getByRole('button', { name: 'Pick for me', exact: true });
  await expect(trigger).toBeVisible();
  const original = (await (await page.request.get('/api/library')).json()).state;
  try {
    await command(page.request, { op: 'restore', state: emptyState() });
    await page.reload();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Pick for me', exact: true });
    const category = name => dialog.getByRole('button', { name, exact: true });
    await expect(dialog.getByRole('button', { name: 'Spin', exact: true })).toBeDisabled();
    await expect(dialog.getByText('Add titles to Plan to watch or your games Backlog, then try again.')).toBeVisible();
    for (const name of ['Movies', 'TV shows', 'Anime', 'Games']) await category(name).click();
    await expect(dialog.getByText('Choose at least one category to spin.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();

    let fixture = emptyState();
    const add = (work, status = 'backlog') => { fixture = applyCommand(fixture, { op: 'save', work, patch: { status } }, crypto.randomUUID()); };
    for (let index = 0; index < 60; index++) add({ ...suggestions[index % 3], id: `manual:roulette:${index}`, ...(index === 59 ? { title: 'The last planned film in the test collection' } : {}) });
    add({ ...suggestions[3], id: 'manual:roulette:anime' });
    const missing = { ...suggestions[0], id: 'manual:roulette:tv', type: 'tv', title: 'A very long series title for a quiet evening with absolutely no artwork available', poster: '' };
    add(missing);
    add({ ...suggestions[6], id: 'manual:roulette:game' });
    add({ ...suggestions[7], id: 'manual:roulette:wishlist' }, 'wishlist');
    add({ ...suggestions[8], id: 'manual:roulette:completed' }, 'completed');
    await command(page.request, { op: 'restore', state: fixture });
    await page.goto('/admin/library?view=collection&type=movies&status=backlog&q=no-matching-title&page=2');
    const before = await (await page.request.get('/api/library')).json();
    let writes = 0;
    const countWrite = request => { if (new URL(request.url()).pathname === '/api/library' && request.method() === 'POST') writes++; };
    page.on('request', countWrite);
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(category('Movies')).toHaveAttribute('aria-pressed', 'true');
    await expect(category('Games')).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog.locator('.roulette-count')).toContainText('60 planned titles');
    await page.screenshot({ path: testInfo.outputPath('roulette-desktop-ready.png') });

    // Force a last-entry draw to prove the winner is independent of the visual sample.
    await page.evaluate(() => { window.rouletteTestRandom = Math.random; Math.random = () => 1 - Number.EPSILON; });
    await dialog.getByRole('button', { name: 'Spin', exact: true }).click();
    await page.evaluate(() => { Math.random = window.rouletteTestRandom; delete window.rouletteTestRandom; });
    await expect(dialog.getByRole('button', { name: 'Spinning…', exact: true })).toBeDisabled();
    await expect(category('Movies')).toBeDisabled();
    await expect(dialog.locator('.roulette-poster')).toHaveCount(25);
    await expect(dialog.locator('.roulette-result h3')).toHaveText(fixture.works[59].title);
    const alignment = await dialog.evaluate(node => {
      const stage = node.querySelector('.roulette-stage').getBoundingClientRect();
      const winner = node.querySelector('[data-winner=true]').getBoundingClientRect();
      return Math.abs(stage.x + stage.width / 2 - winner.x - winner.width / 2);
    });
    expect(alignment).toBeLessThan(1);
    await expect(dialog.getByRole('button', { name: 'Spin again', exact: true })).toBeEnabled();
    const actionFits = await dialog.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return [...node.querySelectorAll('.roulette-actions button')].every(button => button.getBoundingClientRect().bottom <= bounds.bottom - 16);
    });
    expect(actionFits).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('roulette-desktop-winner.png') });
    await dialog.getByRole('button', { name: 'View title', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveAccessibleName(fixture.works[59].title);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();

    // Closing mid-spin cancels the old animation; reopening starts a fresh picker.
    await trigger.click();
    await dialog.getByRole('button', { name: 'Spin', exact: true }).click();
    await page.keyboard.press('Escape');
    await trigger.click();
    await expect(dialog.getByRole('button', { name: 'Spin', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Spin', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(dialog.getByRole('button', { name: 'Spin again', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Spin again', exact: true }).click();
    await expect(dialog.locator('.roulette-stage')).toHaveAttribute('data-spinning', 'false');
    await page.keyboard.press('Escape');

    // Phone: all categories by default outside Collection, then a single missing-cover title.
    await page.goto('/admin/library?view=overview');
    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    for (const name of ['Movies', 'TV shows', 'Anime', 'Games']) await expect(category(name)).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('.roulette-count')).toContainText('63 planned titles');
    await page.screenshot({ path: testInfo.outputPath('roulette-phone-ready.png') });
    for (const name of ['Movies', 'Anime', 'Games']) await category(name).click();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await dialog.getByRole('button', { name: 'Spin', exact: true }).click();
    await expect(dialog.locator('.roulette-stage')).toHaveAttribute('data-spinning', 'false');
    await expect(dialog.locator('.roulette-result h3')).toHaveText(missing.title);
    await expect(dialog.locator('.missing-cover')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'View title', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('roulette-phone-missing-cover.png') });
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(dialog.getByRole('button', { name: 'View title', exact: true })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeInViewport();
    const header = await trigger.boundingBox();
    const addLog = await page.getByRole('button', { name: 'Add / Log', exact: true }).boundingBox();
    expect(header.x + header.width).toBeLessThanOrEqual(addLog.x);
    const after = await (await page.request.get('/api/library')).json();
    expect(after).toEqual(before);
    expect(writes).toBe(0);
    expect(errors).toEqual([]);
    page.off('request', countWrite);
  } finally {
    await command(page.request, { op: 'restore', state: original });
  }
});

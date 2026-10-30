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

async function command(request, cmd) {
  const current = await (await request.get(`${origin}/api/library`)).json();
  const response = await request.post(`${origin}/api/library`, {
    headers: { Origin: origin },
    data: { revision: current.revision, requestId: crypto.randomUUID(), command: cmd },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

test('year activity includes collection status, list rows stay transparent, and rating scale can switch to 10', async ({ page }) => {
  await login(page);
  const game = suggestions.find(work => work.type === 'games');
  expect(game).toBeTruthy();
  const previousState = (await (await page.request.get(`${origin}/api/library`)).json()).state;
  try {
  const stamp = '2024-06-15T12:00:00.000Z';
  await command(page.request, {
    op: 'restore',
    state: {
      works: [game],
      records: [{
        workId: game.id,
        status: 'active',
        rating: 4,
        visibility: 'private',
        favorite: null,
        notes: '',
        episodes: 0,
        season: 1,
        platform: 'PC',
        hours: null,
        addedAt: stamp,
        updatedAt: stamp,
        deletedAt: null,
      }],
      events: [],
      lists: [],
      applied: [],
    },
  });

  await page.goto('/admin/library?view=overview');
  await page.getByRole('button', { name: '2024', exact: true }).click();
  await expect(page.locator('.library-stats .stats-total')).toHaveText('1');
  const gamesRow = page.locator('.library-stats .stats-bar-row').filter({ hasText: 'Games' });
  await expect(gamesRow.locator('.stats-bar-value')).toHaveText('1');
  await expect(page.getByText('Titles with dated library activity · 2024', { exact: true })).toBeVisible();

  await page.goto('/admin/library?view=collection&type=games&status=all&viewMode=list');
  const row = page.locator('.collection-row').first();
  await expect(row).toBeVisible();
  expect(await row.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');

  await page.goto('/admin/library?view=settings');
  await page.getByRole('button', { name: '10-point', exact: true }).click();
  await page.goto('/admin/library?view=collection&type=games&status=all');
  await expect(page.getByText('8/10', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: game.title, exact: true }).click();
  const rating = page.getByRole('slider', { name: 'My current rating', exact: true });
  await expect(rating).toHaveAttribute('max', '10');
  await expect(rating).toHaveAttribute('aria-valuetext', '8 out of 10');
  await rating.focus();
  await page.keyboard.press('ArrowRight');
  await expect(rating).toHaveValue('9');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const saved = await (await page.request.get('/api/library')).json();
  expect(saved.state.records[0].rating).toBe(4.5);

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.getByText('9/10', { exact: true }).first()).toBeVisible();
  } finally {
    await command(page.request, { op: 'restore', state: previousState });
  }
});

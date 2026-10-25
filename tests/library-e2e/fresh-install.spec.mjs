import { test, expect } from '@playwright/test';

test('fresh installation adds its first manual title with no catalog credentials or starter picks', async ({ page, browser }) => {
  await page.goto('/admin/library');
  await page.getByLabel('Email', { exact: true }).fill('owner@library.test');
  await page.getByLabel('Password', { exact: true }).fill('library-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add / Log', exact: true })).toBeVisible();
  const initial = await (await page.request.get('/api/library')).json();
  expect(initial.state.works).toEqual([]);
  await page.getByRole('button', { name: 'Add / Log', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Search catalog', exact: true })).toBeDisabled();
  await expect(dialog.locator('.search-results')).toHaveCount(0);
  await dialog.getByRole('button', { name: /Add manually/ }).click();
  await dialog.getByLabel('Title', { exact: true }).fill('A First Evening');
  await dialog.getByLabel('Release year (optional)', { exact: true }).fill('2025');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const current = await (await page.request.get('/api/library')).json();
  expect(current.state.works[0].title).toBe('A First Evening');
  expect(current.state.records[0].status).toBe('backlog');
  expect(current.state.records[0].rating).toBeNull();
  expect(current.state.events).toEqual([]);
  const anonymous = await browser.newContext();
  const publicData = await (await anonymous.request.get('http://localhost:3211/api/library')).json();
  expect(publicData.state.works).toEqual([]);
  await anonymous.close();
  const response = await page.request.post('/api/library', {
    headers: { Origin: 'http://localhost:3211' },
    data: { revision: current.revision, requestId: crypto.randomUUID(), command: { op: 'restore', state: initial.state } },
  });
  expect(response.status()).toBe(200);
});

import { test, expect } from '@playwright/test';

test('Manga & Comics titles can be entered with a custom format and browsed by category', async ({ page }) => {
  await page.goto('/admin/library');
  await page.getByLabel('Email', { exact: true }).fill('owner@library.test');
  await page.getByLabel('Password', { exact: true }).fill('library-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Add / Log', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Category', exact: true }).click();
  await page.getByRole('option', { name: 'Manga & Comics', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Search catalog', exact: true })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Can’t find it? Add manually', exact: false }).click();
  await dialog.getByLabel('Title', { exact: true }).fill('Synthetic Moon Archive');
  await dialog.getByRole('combobox', { name: 'Format', exact: true }).click();
  await page.getByRole('option', { name: 'No format', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/library') && r.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'Save entry', exact: true }).click(),
  ]);
  expect(response.status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  const { state } = await (await page.request.get('/api/library')).json();
  expect(state.works.find(w => w.title === 'Synthetic Moon Archive')).toMatchObject({ type: 'comics' });
  expect(state.works.find(w => w.title === 'Synthetic Moon Archive').format).toBeUndefined();
  await page.goto('/admin/library?view=overview');
  await expect(page.getByRole('heading', { name: 'Manga & Comics', exact: true })).toBeVisible();
  await page.goto('/admin/library?view=collection&type=comics&status=all');
  await page.getByRole('button', { name: 'Synthetic Moon Archive', exact: true }).click();
  await expect(page.locator('.detail-hero p')).toContainText('Manga & Comics');
  await page.getByRole('dialog').getByRole('combobox', { name: 'Status', exact: true }).click();
  await page.getByRole('option', { name: 'Read', exact: true }).click();
  const [statusResponse] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/library') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Save changes', exact: true }).click(),
  ]);
  expect(statusResponse.status()).toBe(200);
  await page.getByRole('button', { name: 'Edit metadata / match catalog', exact: true }).click();
  await page.getByText('Edit title metadata', { exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Format', exact: true }).click();
  await page.getByRole('option', { name: 'Custom', exact: true }).click();
  await page.getByLabel('Custom format', { exact: true }).fill('Web comic');
  await page.getByLabel('Custom format', { exact: true }).fill('Comic strip');
  const [metadataResponse] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/library') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Save metadata', exact: true }).click(),
  ]);
  expect(metadataResponse.status()).toBe(200);
  const updated = await (await page.request.get('/api/library')).json();
  expect(updated.state.works.find(w => w.title === 'Synthetic Moon Archive').format).toBe('Comic strip');
  await page.getByRole('button', { name: 'Synthetic Moon Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Edit metadata / match catalog', exact: true }).click();
  await page.getByText('Edit title metadata', { exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Format', exact: true }).click();
  await page.getByRole('option', { name: 'No format', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Format', exact: true })).toContainText('No format');
  const [clearResponse] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/library') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Save metadata', exact: true }).click(),
  ]);
  expect(clearResponse.status()).toBe(200);
  const cleared = await (await page.request.get('/api/library')).json();
  expect(cleared.state.works.find(w => w.title === 'Synthetic Moon Archive').format).toBeUndefined();
});

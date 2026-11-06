import { test, expect } from '@playwright/test';
import { suggestions } from '../fixtures/works.ts';

test('visitors see all shared statuses and can still filter completed titles', async ({ page, browser }) => {
  await page.goto('/admin/library');
  await page.getByLabel('Email', { exact: true }).fill('owner@library.test');
  await page.getByLabel('Password', { exact: true }).fill('library-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add / Log', exact: true })).toBeVisible();

  const work = { ...suggestions[0], id: 'manual:visitor-status', title: 'The Visitor Test Film' };
  const snapshot = await (await page.request.get('/api/library')).json();
  const response = await page.request.post('/api/library', {
    headers: { Origin: 'http://localhost:3211' },
    data: {
      revision: snapshot.revision, requestId: crypto.randomUUID(),
      command: { op: 'save', work, patch: { status: 'backlog', visibility: 'public' } },
    },
  });
  expect(response.ok()).toBe(true);

  const visitor = await browser.newPage();
  await visitor.goto('/library?view=collection');
  const title = visitor.getByRole('button', { name: work.title, exact: true });
  const all = visitor.getByRole('button', { name: 'All statuses', exact: true });
  await expect(title).toBeVisible();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await visitor.getByRole('button', { name: 'Finished', exact: true }).click();
  await expect(title).toHaveCount(0);
  await all.click();
  await expect(title).toBeVisible();
  await visitor.goto('/library?view=collection&status=completed');
  await expect(title).toHaveCount(0);

  await page.goto('/admin/library?view=collection');
  await expect(page.getByRole('button', { name: 'Finished', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await visitor.close();
});

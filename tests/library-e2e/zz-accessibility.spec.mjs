import { test, expect } from '@playwright/test';
import axe from 'axe-core';

test('rating controls and missing-cover roulette state keep accessible names and semantics', async ({ page }) => {
  const originHeader = 'http://localhost:3211';
  let loggedIn = false;
  for (const password of ['new-isolated-password', 'library-test-password']) {
    const response = await page.request.post('/api/library/auth', { headers: { Origin: originHeader }, data: { email: 'owner@library.test', password } });
    if (response.ok()) { loggedIn = true; break; }
  }
  expect(loggedIn).toBe(true);
  await page.goto('/admin/library');
  await expect(page.getByRole('button', { name: 'Add title', exact: true })).toBeVisible();
  const current = await page.evaluate(async () => (await fetch('/api/library')).json());
  const work = { id: 'manual:a11y-sample', type: 'movies', title: 'Accessible sample', year: 2026, poster: '', genres: [], episodes: null, seasons: null, summary: '', provider: 'manual', providerId: '', sourceUrl: '' };
  const status = await page.evaluate(async ({ revision, work }) => {
    const response = await fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, requestId: crypto.randomUUID(), command: { op: 'save', work, patch: { status: 'backlog', visibility: 'private' } } }) });
    return response.status;
  }, { revision: current.revision, work });
  expect(status).toBe(200);

  await page.goto('/admin/library?view=collection&status=all');
  await expect(page.getByRole('button', { name: 'Rating Any rating', exact: true })).toBeVisible();
  await page.addScriptTag({ content: axe.source });
  const naming = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'rule', values: ['label-content-name-mismatch'] } }));
  expect(naming.violations).toEqual([]);

  await page.getByRole('button', { name: 'Accessible sample', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'My current rating', exact: true });
  await expect(slider.locator('button')).toHaveCount(0);
  const nesting = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'rule', values: ['nested-interactive'] } }));
  expect(nesting.violations).toEqual([]);
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Pick for me', exact: true }).click();
  const missingCover = page.locator('.roulette-poster .missing-cover').first();
  await expect(missingCover).toBeVisible();
  const contrast = await page.evaluate(async () => window.axe.run(document.querySelector('.roulette-poster .missing-cover')?.closest('.roulette-poster'), { runOnly: { type: 'rule', values: ['color-contrast'] } }));
  expect(contrast.violations).toEqual([]);
});

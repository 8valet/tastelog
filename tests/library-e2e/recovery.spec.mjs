import { test, expect } from '@playwright/test';

test('password recovery rejects unverified changes, validates the link, and restores login', async ({ page, browser }) => {
  const origin = 'http://localhost:3211';
  const blocked = await page.request.put('/api/library/auth/recovery', { headers: { Origin: origin }, data: { password: 'new-isolated-password' } });
  expect(blocked.status()).toBe(401);
  const crossOrigin = await page.request.post('/api/library/auth/recovery', { headers: { Origin: 'https://other.test' }, data: { tokenHash: 'isolated-recovery-token-hash' } });
  expect(crossOrigin.status()).toBe(403);
  const stranger = await page.request.post('/api/library/auth/recovery', {
    headers: { Origin: origin }, data: { tokenHash: 'isolated-stranger-recovery-hash' },
  });
  expect(stranger.status()).toBe(401);
  expect((await page.request.put('/api/library/auth/recovery', {
    headers: { Origin: origin }, data: { password: 'not-the-owner-password' },
  })).status()).toBe(401);
  await page.goto('/admin/library/reset-password?token_hash=invalid-recovery-token-hash');
  await page.getByRole('button', { name: 'Continue to reset password', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('invalid or has expired');
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await page.goto('/admin/library/reset-password?token_hash=isolated-recovery-token-hash');
  await page.getByRole('button', { name: 'Continue to reset password', exact: true }).click();
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(`${origin}/admin/library/reset-password`);
  await page.getByLabel('New password', { exact: true }).fill('new-isolated-password');
  await page.getByLabel('Confirm new password', { exact: true }).fill('different-isolated-password');
  await page.getByRole('button', { name: 'Save new password', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('do not match');
  await expect(page.getByLabel('Confirm new password', { exact: true })).toBeFocused();
  await page.getByLabel('Confirm new password', { exact: true }).fill('new-isolated-password');
  await page.getByRole('button', { name: 'Show passwords', exact: true }).click();
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide passwords', exact: true }).click();
  await page.getByRole('button', { name: 'Save new password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your password has been changed');
  await page.getByRole('link', { name: 'Back to sign in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('owner@library.test');
  await page.getByLabel('Password', { exact: true }).fill('library-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('could not be verified');
  await page.getByLabel('Password', { exact: true }).fill('new-isolated-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add title', exact: true })).toBeVisible();
  // The default hosted email redirects with session tokens in a URL fragment.
  const issued = await (await page.request.post('http://127.0.0.1:3212/auth/v1/token?grant_type=password', {
    data: { email: 'owner@library.test', password: 'new-isolated-password' },
  })).json();
  const implicitContext = await browser.newContext();
  const implicitPage = await implicitContext.newPage();
  const fragment = new URLSearchParams({ type: 'recovery', access_token: issued.access_token, refresh_token: issued.refresh_token });
  await implicitPage.goto(`${origin}/admin/library/reset-password#${fragment}`);
  await implicitPage.getByRole('button', { name: 'Continue to reset password', exact: true }).click();
  await expect(implicitPage.getByLabel('New password', { exact: true })).toBeVisible();
  await expect(implicitPage).toHaveURL(`${origin}/admin/library/reset-password`);
  const invalidSession = await page.request.post('/api/library/auth/recovery', {
    headers: { Origin: origin }, data: { accessToken: 'invalid-session-token-invalid', refreshToken: 'isolated-test-refresh' },
  });
  expect(invalidSession.status()).toBe(401);
  await implicitContext.close();
  const other = await browser.newContext();
  const reused = await other.request.post(`${origin}/api/library/auth/recovery`, { headers: { Origin: origin }, data: { tokenHash: 'isolated-recovery-token-hash' } });
  expect(reused.status()).toBe(401);
  await other.close();
});

import { expect, test } from '@playwright/test';

test('home page renders in Czech', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Autoporada');
});

test('pages render per request and are never cached (ADR 0001)', async ({ request }) => {
  const response = await request.get('/');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['x-nextjs-prerender']).toBeUndefined();
});

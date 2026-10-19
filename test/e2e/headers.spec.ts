import { expect, test } from '@playwright/test';

const nonceOf = (policy: string | undefined) => /'nonce-([^']+)'/.exec(policy ?? '')?.[1];

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'x-frame-options': 'DENY',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { cspViolations: seen });
    document.addEventListener('securitypolicyviolation', (e) => {
      seen.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
});

test('a page runs only its own nonced scripts, with no CSP violation', async ({ page }) => {
  const response = await page.goto('/prihlaseni?chyba=failed&kod=abcdef12-3456');
  const nonce = nonceOf(response?.headers()['content-security-policy']);
  expect(nonce).toBeTruthy();
  // Hydrated: Next's inline bootstrap and its chunks both ran.
  await expect.poll(() => page.evaluate(() => 'next' in window)).toBe(true);
  const scripts = await page
    .locator('script')
    .evaluateAll((all) => all.map((s) => (s as HTMLScriptElement).nonce));
  expect(scripts.length).toBeGreaterThan(0);
  expect(new Set(scripts)).toEqual(new Set([nonce]));
  expect(
    await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations),
  ).toEqual([]);
});

test('every response gets a fresh nonce', async ({ request }) => {
  const nonces = new Set<string | undefined>();
  for (let i = 0; i < 3; i++) {
    nonces.add(nonceOf((await request.get('/prihlaseni')).headers()['content-security-policy']));
  }
  expect(nonces.size).toBe(3);
});

test('pages, routes and static files carry the security headers', async ({ page, request }) => {
  await page.goto('/prihlaseni');
  const chunk = await page.locator('script[src^="/_next/static/"]').first().getAttribute('src');
  const responses = await Promise.all([
    request.get('/prihlaseni'),
    request.get('/auth/login', { maxRedirects: 0 }),
    request.get(chunk ?? ''),
  ]);
  for (const response of responses) {
    expect(response.headers()).toMatchObject(SECURITY_HEADERS);
    expect(response.headers()['permissions-policy']).toContain('camera=()');
  }
  // Static files need no policy of their own.
  expect(responses[2]?.headers()['content-security-policy']).toBeUndefined();
});

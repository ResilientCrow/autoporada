import { cs } from '@/ui/copy';

import { expect, test } from './fixtures';

const nonceOf = (policy: string | undefined) => /'nonce-([^']+)'/.exec(policy ?? '')?.[1];

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'x-frame-options': 'DENY',
};

const NONCED_PAGES = [
  ['the sign-in page', '/prihlaseni?chyba=failed&kod=abcdef12-3456', null],
  ['the privacy notice', '/ochrana-osobnich-udaju', null],
  ['the gallery', '/vzornik', null],
  ['the 404 page', '/tato-stranka-neexistuje', null],
  ['the signed-in home page', '/', /^Učitelka/],
] as const;

for (const [name, url, persona] of NONCED_PAGES) {
  test(`${name} runs only its own nonced scripts`, async ({
    page,
    hydrated,
    expectAccessible,
    signInAs,
  }) => {
    if (persona) await signInAs(persona);
    const response = await page.goto(url);
    const nonce = nonceOf(response?.headers()['content-security-policy']);
    expect(nonce).toBeTruthy();
    await hydrated();
    const scripts = await page
      .locator('script')
      .evaluateAll((all) => all.map((s) => (s as HTMLScriptElement).nonce));
    expect(scripts.length).toBeGreaterThan(0);
    expect(new Set(scripts)).toEqual(new Set([nonce]));
    await expectAccessible();
  });
}

test('the nonce is also in a csp-nonce meta in the head, hidden from the DOM attribute', async ({
  page,
}) => {
  const response = await page.goto('/prihlaseni');
  const nonce = nonceOf(response?.headers()['content-security-policy']);
  const metas = page.locator('meta[name="csp-nonce"]');
  await expect(metas).toHaveCount(1);
  await expect(page.locator('head > meta[name="csp-nonce"]')).toHaveCount(1);
  expect(await metas.evaluate((m) => (m as HTMLMetaElement).nonce)).toBe(nonce);
  expect(await metas.getAttribute('nonce')).toBe('');
});

test('an unknown page answers 404', async ({ page, hydrated, expectAccessible }) => {
  const response = await page.goto('/tato-stranka-neexistuje');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cs.notFound.title);
  await hydrated();
  await expectAccessible();
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

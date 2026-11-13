import { cs } from '@/ui/copy';

import { signInAsRe } from './akce-steps';
import { expect, test } from './fixtures';

const nonceOf = (policy: string | undefined) => /'nonce-([^']+)'/.exec(policy ?? '')?.[1];

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'x-frame-options': 'DENY',
};

/** The Arch client at `/`: one nonced script, which draws the sign-in or the home screen. */
const ARCH = true;

const NONCED_PAGES = [
  ['the Arch sign-in screen', '/?chyba=idp-refused&aadsts=AADSTS50011', null, ARCH],
  ['the privacy notice', '/ochrana-osobnich-udaju', null, !ARCH],
  ['the gallery', '/vzornik', null, !ARCH],
  ['the 404 page', '/tato-stranka-neexistuje', null, !ARCH],
  ['the signed-in Arch home', '/', 'archa', ARCH],
] as const;

for (const [name, url, persona, arch] of NONCED_PAGES) {
  test(`${name} runs only its own nonced scripts`, async ({
    page,
    hydrated,
    expectAccessible,
    signInAs,
  }, testInfo) => {
    if (persona) await signInAs(signInAsRe(persona, testInfo.project.name));
    const response = await page.goto(url);
    const nonce = nonceOf(response?.headers()['content-security-policy']);
    expect(nonce).toBeTruthy();
    if (arch) {
      // Drawn by its own script: the sign-in button or the greeting is there once it ran.
      await expect(
        persona
          ? page.getByRole('heading', { level: 1, name: 'Dobrý den.' })
          : page.getByRole('link', { name: cs.signIn.button }),
      ).toBeVisible();
    } else {
      await hydrated();
    }
    const all = await page.locator('script').evaluateAll((list) =>
      list.map((s) => ({
        nonce: (s as HTMLScriptElement).nonce,
        src: (s as HTMLScriptElement).src,
      })),
    );
    expect(all.length).toBeGreaterThan(0);
    // A chunk the page loads later (the rich-text editor's) is added by a nonced script, which
    // `strict-dynamic` trusts, and carries no nonce itself; it must still be one of the app's own.
    const own = `${new URL(page.url()).origin}/_next/static/`;
    const bare = all.filter((s) => s.nonce === '');
    expect(bare.filter((s) => !s.src.startsWith(own))).toEqual([]);
    if (arch) expect(all.map((s) => new URL(s.src).pathname)).toEqual(['/arch/app.js']);
    expect(new Set(all.filter((s) => s.nonce !== '').map((s) => s.nonce))).toEqual(
      new Set([nonce]),
    );
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
    nonces.add(nonceOf((await request.get('/')).headers()['content-security-policy']));
  }
  expect(nonces.size).toBe(3);
});

test('pages, routes and static files carry the security headers', async ({ page, request }) => {
  await page.goto('/');
  const asset = await page.locator('script[src^="/arch/"]').first().getAttribute('src');
  // The build stamps the script's address with a version.
  expect(asset).toMatch(/^\/arch\/app\.js(\?|$)/);
  const responses = await Promise.all([
    request.get('/'),
    request.get('/auth/login', { maxRedirects: 0 }),
    request.get(asset ?? ''),
  ]);
  for (const response of responses) {
    expect(response.headers()).toMatchObject(SECURITY_HEADERS);
    expect(response.headers()['permissions-policy']).toContain('camera=()');
  }
  // Unlike a Next chunk, the Arch bundle is served through the proxy and carries a policy too;
  // it is the page's policy that counts, so only the headers above are asserted for the bundle.
});

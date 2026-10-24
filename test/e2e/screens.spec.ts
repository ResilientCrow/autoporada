/** One test per screen; each screen joins in the commit that restyles it. */
import { access, cs } from '@/ui/copy';

import { expect, test, withDates } from './fixtures';

const TITLE_SUFFIX = / – Autoporada$/;

const HEADMASTER = /^Ředitel/;

/** What a waiting user's home page offers per standing: the link's text and the chip, if any. */
const HOME_STANDINGS = [
  ['open', /^Učitelka/, cs.home.request, null],
  ['pending', /^Test – ceka/, cs.home.showRequest, cs.status.access.pending],
  ['blocked', /^Test – blokovany/, cs.home.showRequest, cs.status.access.blocked],
] as const;

const SCREENS = [
  ['the 404 page', '/tato-stranka-neexistuje', 404, null],
  ['the gallery', '/vzornik', 200, null],
  ['the home page of a waiting teacher', '/', 200, /^Učitelka/],
  ['the home page of a teacher with a request waiting', '/', 200, /^Test – ceka/],
  ['the home page of a blocked applicant', '/', 200, /^Test – blokovany/],
  ['the access request page of a waiting teacher', '/pristup', 200, /^Učitelka/],
  ['the users list of an active headmaster', '/uzivatele', 200, HEADMASTER],
  ['the sign-in page', '/prihlaseni', 200, null],
  ['the sign-in page with an error', '/prihlaseni?chyba=failed&kod=abcdef12-3456', 200, null],
  ['the sign-in page after signing out', '/prihlaseni?odhlaseno=1', 200, null],
  ['the sign-in page after signing out everywhere', '/prihlaseni?odhlaseno=vsude', 200, null],
  ['the sign-in page for a non-member', '/prihlaseni?chyba=not-member', 200, null],
  ['the home page of an active headmaster', '/', 200, HEADMASTER],
  ['the privacy notice for a visitor', '/ochrana-osobnich-udaju', 200, null],
  ['the privacy notice for a signed-in teacher', '/ochrana-osobnich-udaju', 200, /^Učitelka/],
] as const;

for (const [name, url, status, persona] of SCREENS) {
  test(`${name} is a well-formed, accessible, keyboard-friendly page`, async ({
    page,
    hydrated,
    checkScreen,
    signInAs,
  }) => {
    if (persona) await signInAs(persona);
    const response = await page.goto(url);
    expect(response?.status()).toBe(status);
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(TITLE_SUFFIX);
    await hydrated();
    if (persona === HEADMASTER && url === '/') {
      await expect(page.getByText(cs.status.account.active, { exact: true })).toBeVisible();
      await expect(page.getByRole('main').getByRole('status')).toHaveCount(0);
      await expect(page.locator('a[aria-current="page"]')).toHaveCount(1);
    }
    const standing = HOME_STANDINGS.find(([, who]) => who === persona);
    if (standing && url === '/') {
      const [, , link, chip] = standing;
      await expect(page.getByRole('main').getByRole('link', { name: link })).toHaveAttribute(
        'href',
        '/pristup',
      );
      const chips = page.getByRole('main').getByText(cs.status.access.pending, { exact: true });
      await expect(chips).toHaveCount(chip === cs.status.access.pending ? 1 : 0);
      if (chip) await expect(page.getByRole('main').getByText(chip, { exact: true })).toBeVisible();
      await expect(page.getByRole('main').getByRole('status')).toHaveCount(0);
    }
    await checkScreen(name);
  });
}

/** The states of „Žádost o přístup“ a person can be in, each with its own seeded persona. */
const ACCESS_STATES = [
  ['pending', /^Test – ceka/, access.pending.title, access.pending.reason],
  ['cooldown', /^Test – lhuta/, access.cooldown.title, withDates(access.cooldown.text)],
  ['open after a rejection', /^Test – po-lhute/, access.open.title, access.open.previousRejected],
  [
    'open after a cancellation',
    /^Test – zrusena/,
    access.open.title,
    access.open.previousCancelled,
  ],
  ['blocked', /^Test – blokovany/, access.blocked.title, access.blocked.text],
] as const;

for (const [state, persona, title, text] of ACCESS_STATES) {
  test(`the access request page in the ${state} state is well-formed, accessible and keyboard-friendly`, async ({
    page,
    hydrated,
    checkScreen,
    signInAs,
  }) => {
    await signInAs(persona);
    const response = await page.goto('/pristup');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(title);
    await expect(page.getByRole('main').getByText(text).first()).toBeVisible();
    await expect(page).toHaveTitle(TITLE_SUFFIX);
    await hydrated();
    await checkScreen(`the access request page, ${state}`);
  });
}

test('the error page answers 500 and passes axe', async ({
  page,
  hydrated,
  expectAccessible,
  attachScreenshot,
  expectFocusRings,
  expectNoReflow,
}) => {
  const response = await page.goto('/vzornik?stav=vyjimka');
  expect(response?.status()).toBe(500);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cs.appError.title);
  await expect(page).toHaveTitle(TITLE_SUFFIX);
  await hydrated();
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expectAccessible();
  await attachScreenshot('the error page');
  await expectNoReflow();
  // No skip link here: the global error page has no shell, by design.
  expect(await (await page.request.get('/vzornik?stav=vyjimka')).text()).not.toContain('style="');
  await expectFocusRings();
});

test('the sign-in page works without JavaScript and loads no React Aria', async ({
  browser,
  page,
  hydrated,
}) => {
  const plain = await browser.newContext({ javaScriptEnabled: false });
  const bare = await plain.newPage();
  await bare.goto('/prihlaseni');
  await expect(bare.getByRole('heading', { level: 1 })).toHaveText(cs.signIn.title);
  await expect(bare.getByRole('link', { name: cs.signIn.button })).toBeVisible();
  await expect(bare.getByRole('link', { name: cs.signIn.switchAccount })).toBeVisible();
  await plain.close();

  await page.goto('/prihlaseni');
  await hydrated();
  await expect(page.locator('#react-aria-pressable-style')).toHaveCount(0);
});

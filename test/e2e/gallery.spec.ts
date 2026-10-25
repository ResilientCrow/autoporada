import type { Locator, Page } from '@playwright/test';

import { cs } from '@/ui/copy';

import { expect, test } from './fixtures';

/** The seven of the colour manual; Tailwind's preflight adds the transparent #0000. */
const ALLOWED_HEX = new Set([
  '#22232a',
  '#000e19',
  '#00233f',
  '#0062b3',
  '#cce8ff',
  '#f7fbff',
  '#f5b800',
  '#0000',
]);

test('the gallery loads, hydrates and passes axe', async ({ page, hydrated, expectAccessible }) => {
  await page.goto('/vzornik');
  await hydrated();
  await expectAccessible();
});

test('React Aria styles its pressables with the page nonce, and a press breaks no policy', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const style = page.locator('head > style#react-aria-pressable-style');
  await expect(style).toHaveCount(1);
  const metaNonce = await page
    .locator('meta[name="csp-nonce"]')
    .evaluate((m) => (m as HTMLMetaElement).nonce);
  expect(metaNonce).not.toBe('');
  expect(await style.evaluate((s) => (s as HTMLStyleElement).nonce)).toBe(metaNonce);
  const button = page.getByRole('button', { name: cs.gallery.buttons.primary });
  expect(await button.evaluate((b) => getComputedStyle(b).touchAction)).toBe('manipulation');
  await button.click();
});

test('the built stylesheet holds only the manual, and Czech letters come from the web font', async ({
  page,
  request,
}) => {
  await page.goto('/vzornik');
  const hrefs = await page
    .locator('link[rel=stylesheet]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  expect(hrefs.length).toBeGreaterThan(0);
  const origin = new URL(page.url()).origin;
  for (const href of hrefs) {
    const css = await (await request.get(href)).text();
    const hexes = (css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase());
    expect(hexes.filter((h) => !ALLOWED_HEX.has(h))).toEqual([]);
    expect(css).not.toContain('data:');
    const urls = [...css.matchAll(/url\(\s*["']?([^"')\s]+)/g)].map((m) => m[1]!);
    expect(urls.filter((u) => new URL(u, href).origin !== origin)).toEqual([]);
  }
  const faces = await page.evaluate(
    async () => (await document.fonts.load('16px "Mona Sans Variable"', 'ŘŠČ')).length,
  );
  expect(faces).toBeGreaterThan(0);
});

const { live } = cs.gallery.forms;
/** The live form's own status node; the search boxes add status regions of their own. */
const formStatus = (page: Page) =>
  page.getByRole('region', { name: cs.gallery.forms.title }).getByRole('status');
const summaryOf = (page: Page) =>
  page.locator('form#demo-live [tabindex="-1"]').filter({ has: page.getByRole('alert') });

test('a failed submit puts the summary in focus and prefixes the title, and its link leads to the field', async ({
  page,
  hydrated,
  settled,
  expectAccessible,
  attachScreenshot,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const title = await page.title();
  const form = page.locator('form#demo-live');
  const summary = summaryOf(page);
  const focused = () => page.evaluate(() => document.activeElement?.id ?? '');
  const submit = form.getByRole('button', { name: cs.gallery.forms.submit });

  // Nothing is focused or prefixed on load.
  await expect(summary).toHaveCount(0);
  expect(title.startsWith(cs.form.errorPrefix)).toBe(false);

  await submit.click();
  await settled();
  await expect(summary).toBeFocused();
  await expect(page).toHaveTitle(`${cs.form.errorPrefix} ${title}`);
  await expectAccessible();
  await attachScreenshot('the gallery live demo with errors');

  await form.getByRole('link', { name: new RegExp(`^${live.name}:`) }).click();
  const name = form.getByLabel(live.name);
  await expect(name).toBeFocused();
  await expect(form.getByText(live.name, { exact: true }).first()).toBeInViewport();
  expect(await focused()).toBe('demo-live-name');

  await name.fill('Eva');
  await form.getByLabel(live.reason).fill('x'.repeat(41));
  await submit.click();
  await settled();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText(live.reasonTooLong);

  await form.getByLabel(live.reason).fill('Stačí to.');
  await submit.click();
  await settled();
  await expect(formStatus(page)).toHaveText(live.sent);
  await expect(summary).toHaveCount(0);
  await expect(page).toHaveTitle(title);
  await expectAccessible();
});

test('success fills the same status node, and a second success is a fresh notice', async ({
  page,
  hydrated,
  settled,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const form = page.locator('form#demo-live');
  const status = formStatus(page);
  await expect(status).toBeEmpty();
  const node = await status.elementHandle();
  await form.getByLabel(live.name).fill('Eva');
  await form.getByLabel(live.reason).fill('Stačí to.');

  await form.getByRole('button', { name: cs.gallery.forms.submit }).click();
  await settled();
  await expect(status).toHaveText(live.sent);
  expect(await status.elementHandle().then((h) => h?.evaluate((el, n) => el === n, node))).toBe(
    true,
  );
  const first = await status.locator('> div').elementHandle();

  await form.getByRole('button', { name: cs.gallery.forms.submit }).click();
  await settled();
  const second = await status.locator('> div').elementHandle();
  expect(await first?.evaluate((el, n) => el === n, second)).toBe(false);
});

test('a network failure shows its problem, focused', async ({ page, hydrated, settled }) => {
  await page.goto('/vzornik');
  await hydrated();
  const form = page.locator('form#demo-live');
  await form.getByLabel(live.name).fill(live.networkTrigger);
  await form.getByLabel(live.reason).fill('Stačí to.');
  await form.getByRole('button', { name: cs.gallery.forms.submit }).click();
  await settled();
  const problem = summaryOf(page);
  await expect(problem).toBeFocused();
  await expect(problem).toContainText(cs.errors.network);
  await expect(page).toHaveTitle(/^(?!Chyba:)/);
});

test('an unavailable answer shows the problem with the request id', async ({
  page,
  hydrated,
  settled,
  expectAccessible,
}) => {
  await page.goto('/vzornik?stav=nedostupne');
  await hydrated();
  const form = page.locator('form#demo-live');
  await form.getByLabel(live.name).fill('Eva');
  await form.getByLabel(live.reason).fill('Stačí to.');
  await form.getByRole('button', { name: cs.gallery.forms.submit }).click();
  await settled();
  const problem = summaryOf(page);
  await expect(problem).toBeFocused();
  await expect(problem).toContainText(`${cs.app.errorCode} abcdef12-3456`);
  await expectAccessible();
});

const { people } = cs.gallery;
const { search } = cs.people;

/** The two search boxes of the gallery: against the invented directory, and with the directory off. */
const liveBox = (page: Page) =>
  page.getByRole('combobox', { name: people.live.label, exact: true });
const offBox = (page: Page) => page.getByRole('combobox', { name: people.off.label, exact: true });
/**
 * Scroll first, to the middle of the screen: React Aria closes the list when the page scrolls under
 * it, as when focus brings the box into view or an option at the screen edge is scrolled to.
 */
const openBox = async (box: Locator) => {
  await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await box.click();
};
const options = (page: Page) => page.getByRole('listbox').getByRole('option');
const addedMessage = (name: string, total: string) =>
  `Přidáno: ${name}. Celkem: ${total}.`.replace(/(\d) /, '$1\u00A0');

test('the search box lists recents, then the directory, then the manual option, and the keys walk all three', async ({
  page,
  hydrated,
  expectAccessible,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);

  // An empty box on focus lists the eight newest recents and nothing to add by hand.
  await openBox(box);
  const list = page.getByRole('listbox');
  await expect(list.getByRole('group', { name: search.recents })).toBeVisible();
  await expect(options(page)).toHaveCount(8);
  await expect(list.getByRole('option', { name: /Ivana Malá/ })).toHaveCount(0);

  // Three characters add the directory group; Jana is a recent and a hit, and is listed once.
  await box.pressSequentially('nov');
  await expect(list.getByRole('group', { name: search.directory })).toBeVisible();
  const texts = [
    'Jana Nováková',
    'Tomáš Nováček (3.B)',
    'Petr Novák',
    'Eva Novotná',
    'Tomáš Novotný',
    search.manual('nov'),
  ];
  await expect(options(page)).toHaveText(texts);

  // The arrow keys walk recents, directory and the manual option, one option at a time.
  for (const text of texts) {
    await page.keyboard.press('ArrowDown');
    await expect(options(page).filter({ hasText: text, visible: true }).first()).toHaveAttribute(
      'data-focused',
      'true',
    );
  }
  await page.keyboard.press('ArrowUp');
  await expect(options(page).nth(4)).toHaveAttribute('data-focused', 'true');

  // Enter adds the focused hit, empties the box, keeps focus in it and says so.
  await page.keyboard.press('Enter');
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');
  // The announcement is in the accessibility tree, also while the list is open: the open list
  // hides the rest of the page from assistive technology, but not its live regions.
  const added = page
    .getByRole('status')
    .filter({ hasText: addedMessage('Tomáš Novotný', '1 osoba') });
  await expect(added).toHaveCount(1);
  await box.pressSequentially('k');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(added).toHaveCount(1);
  await box.fill('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('list', { name: people.added }).first()).toContainText(
    'Tomáš Novotný',
  );
  // axe on the closed box: while a React Aria list is open it hides the rest of the page
  // (aria-hidden), which axe reports as aria-hidden-focus, page-has-heading-one and region.
  await expectAccessible();
});

test('the last option adds the typed name by hand, with Enter or from the list', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);

  // From the list: the arrow up from the box lands on the last option.
  await openBox(box);
  await box.pressSequentially('Karel Dvořák');
  await expect(options(page).last()).toHaveText(search.manual('Karel Dvořák'));
  await page.keyboard.press('ArrowUp');
  await expect(options(page).last()).toHaveAttribute('data-focused', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByText(addedMessage('Karel Dvořák', '1 osoba'))).toBeVisible();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');

  // With Enter alone: nothing in the list is focused, and the typed name still goes in.
  await box.pressSequentially('Zuzana Kubíčková');
  await page.keyboard.press('Enter');
  await expect(page.getByText(addedMessage('Zuzana Kubíčková', '2 osoby'))).toBeVisible();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');
});

test('an older answer never replaces a newer one, even one that was aborted and still arrives', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);
  await openBox(box);

  // „nov“ is the slow query: its answer takes 1.2 s and ignores the abort.
  await box.pressSequentially('nov');
  await page.waitForTimeout(450); // past the debounce: the slow request is in flight
  await box.pressSequentially('a');
  await expect(options(page).filter({ hasText: 'Petr Novák' })).toHaveCount(1);
  await expect(options(page).filter({ hasText: 'Eva Novotná' })).toHaveCount(0);

  // The slow answer is due about 1.2 s after it left; give it time to arrive and be dropped.
  await page.waitForTimeout(1500);
  await expect(options(page).filter({ hasText: 'Eva Novotná' })).toHaveCount(0);
  await expect(options(page).filter({ hasText: 'Petr Novák' })).toHaveCount(1);
});

test('notices stay beside the box as status text, and the box still adds by hand', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);
  // Through the accessibility tree, with the list open: a notice that arrives while the reader
  // types is announced, so the open list must not hide it.
  const notice = (text: string) => page.getByRole('status').filter({ hasText: text });
  await expect(notice(search.notice.off)).toHaveCount(1); // the off box, on load
  for (const [trigger, text] of [
    [people.triggers.down, search.notice.down],
    [people.triggers.rateLimited, search.notice.rateLimited],
    [people.triggers.signedOut, search.notice.signedOut],
  ] as const) {
    await box.fill('');
    await box.pressSequentially(trigger);
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(notice(text)).toHaveCount(1);
    // Never a listbox empty state: the manual option is still there to add the name.
    await expect(options(page).last()).toHaveText(search.manual(trigger));
  }

  // With the directory off the recents still work and the directory group never shows up.
  const off = offBox(page);
  await page.keyboard.press('Escape'); // the open list hides the other box from the page
  await openBox(off);
  await off.pressSequentially('nov');
  await expect(options(page).first()).toHaveText('Jana Nováková');
  await page.waitForTimeout(600);
  await expect(page.getByRole('group', { name: search.directory })).toHaveCount(0);
});

test('hits of an earlier text are never listed for another one', async ({ page, hydrated }) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);
  await openBox(box);

  await box.pressSequentially('nov');
  await options(page).filter({ hasText: 'Tomáš Novotný' }).click();
  await expect(box).toHaveValue('');

  // At once, inside the debounce: the answer for „nov“ is still the last one the box has.
  await box.pressSequentially('dvo');
  await expect(options(page).last()).toHaveText(search.manual('dvo'));
  // One look, no retries: a stale hit may not show even for the length of the debounce.
  expect(await options(page).filter({ hasText: /Nov/ }).count()).toBe(0);
  await expect(page.getByRole('group', { name: search.directory })).toBeVisible();
  await expect(options(page).filter({ hasText: 'Karel Dvořák' })).toHaveCount(1);
  await expect(options(page).filter({ hasText: /Nov/ })).toHaveCount(0);
});

test('after a rate limit the box waits out Retry-After before it asks again', async ({
  page,
  hydrated,
}) => {
  await page.goto('/vzornik');
  await hydrated();
  const box = liveBox(page);
  await openBox(box);

  // The stub answers „rychle“ with 429 and Retry-After: 3.
  await box.pressSequentially(people.triggers.rateLimited);
  await expect(page.getByRole('status').filter({ hasText: search.notice.rateLimited })).toHaveCount(
    1,
  );

  await box.fill('');
  await box.pressSequentially('dvo');
  const directory = page.getByRole('group', { name: search.directory });
  await page.waitForTimeout(1500); // far past the 300 ms debounce, well inside the 3 s
  await expect(directory).toHaveCount(0);
  await expect(directory).toBeVisible({ timeout: 5_000 });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('a form cannot send: its submit is disabled and Enter sends nothing', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') posts.push(request.url());
    });
    await page.goto('/vzornik');
    const form = page.locator('form#demo-plain');
    await expect(form.getByRole('button', { name: cs.gallery.forms.submit })).toBeDisabled();
    const url = page.url();
    await form.locator('input[name="name"]').press('Enter');
    await page.waitForTimeout(300);
    expect(posts).toEqual([]);
    expect(page.url()).toBe(url);
  });
});

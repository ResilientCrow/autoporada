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

test('a failed submit puts the summary in focus, and its link leads to the field', async ({
  page,
  hydrated,
  expectAccessible,
  attachScreenshot,
}) => {
  const { live } = cs.gallery.forms;
  await page.goto('/vzornik');
  await hydrated();
  const form = page.locator('form#demo-live');
  const summary = form.locator('[tabindex="-1"]').filter({ has: page.getByRole('alert') });
  const focused = () => page.evaluate(() => document.activeElement?.id ?? '');
  const isSummaryFocused = () => summary.evaluate((el) => el === document.activeElement);

  await form.getByRole('button', { name: cs.gallery.forms.submit }).click();
  await expect(summary).toBeFocused();
  await expectAccessible();
  await attachScreenshot('the gallery live demo with errors');

  await form.getByRole('link', { name: new RegExp(`^${live.name}:`) }).click();
  const name = form.getByLabel(live.name);
  await expect(name).toBeFocused();
  await expect(form.getByText(live.name, { exact: true }).first()).toBeInViewport();
  expect(await focused()).toBe('demo-live-name');

  await name.fill('Eva');
  await form.getByLabel(live.reason).fill('x'.repeat(41));
  await form.getByRole('button', { name: cs.gallery.forms.submit }).click();
  await expect(summary).toBeFocused();
  expect(await isSummaryFocused()).toBe(true);
  await expect(summary).toContainText(live.reasonTooLong);

  await form.getByLabel(live.reason).fill('Stačí to.');
  await form.getByRole('button', { name: cs.gallery.forms.submit }).click();
  await expect(form.getByRole('status')).toHaveText(live.sent);
  await expect(summary).toHaveCount(0);
  await expectAccessible();
});

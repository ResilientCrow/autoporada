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

test('the gallery loads, hydrates and passes axe', async ({ page, expectAccessible }) => {
  await page.goto('/vzornik');
  await expect.poll(() => page.evaluate(() => 'next' in window)).toBe(true);
  await expectAccessible();
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

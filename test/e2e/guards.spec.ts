/** The guards of fixtures.ts must fail when they should, or they only look safe. */
import type { BrowserContext, Page } from '@playwright/test';

import { expect, test } from './fixtures';

/** Serves /__guard with an inline style under the app's real policy, on the app's origin. */
async function serveViolatingPage(
  page: Page,
  target: BrowserContext = page.context(),
): Promise<void> {
  const real = await page.request.get('/');
  const policy = real.headers()['content-security-policy'] ?? '';
  expect(policy).not.toBe('');
  await target.route('**/__guard', (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: { 'content-security-policy': policy },
      body: '<!doctype html><html lang="cs"><body><p style="color:red">x</p></body></html>',
    }),
  );
}

async function openViolatingPage(page: Page): Promise<void> {
  await serveViolatingPage(page);
  await page.goto('/__guard');
}

test('the CSP guard sees an inline style served under the real policy', async ({
  page,
  cspViolations,
}) => {
  await openViolatingPage(page);
  await expect.poll(() => cspViolations.map((v) => v.directive)).toContain('style-src-attr');
  cspViolations.length = 0;
});

test('the CSP guard fails a test that leaves a violation behind', async ({
  page,
  cspViolations,
}) => {
  // The failure comes from the fixture's teardown, which is what this proves.
  test.fail();
  await openViolatingPage(page);
  await expect.poll(() => cspViolations.length).toBeGreaterThan(0);
});

/** The same page, opened as a popup of an app page: only a context-level guard sees it. */
async function openViolatingPopup(page: Page): Promise<void> {
  await serveViolatingPage(page);
  await page.goto('/');
  const popup = page.waitForEvent('popup');
  await page.evaluate(() => void window.open('/__guard'));
  await (await popup).waitForLoadState();
}

test('the CSP guard sees a violation in a popup', async ({ page, cspViolations }) => {
  await openViolatingPopup(page);
  await expect.poll(() => cspViolations.map((v) => v.directive)).toContain('style-src-attr');
  cspViolations.length = 0;
});

test('the CSP guard fails a test that leaves a violation behind in a popup', async ({
  page,
  cspViolations,
}) => {
  test.fail();
  await openViolatingPopup(page);
  await expect.poll(() => cspViolations.length).toBeGreaterThan(0);
});

test('the CSP guard fails a test that leaves a violation behind in a second context', async ({
  page,
  newContext,
  cspViolations,
}) => {
  test.fail();
  const other = await newContext();
  await serveViolatingPage(page, other);
  await (await other.newPage()).goto('/__guard');
  await expect.poll(() => cspViolations.length).toBeGreaterThan(0);
});

test.describe('expectAccessible', () => {
  test('rejects low-contrast text', async ({ page, expectAccessible }) => {
    await page.setContent(
      '<!doctype html><html lang="cs"><head><title>t</title></head><body><main><h1>h</h1>' +
        '<p style="color:#bbb;background:#fff">Slabý kontrast</p></main></body></html>',
    );
    await expect(expectAccessible()).rejects.toThrow(/color-contrast/);
  });

  test('rejects text on a gradient, which axe cannot measure', async ({
    page,
    expectAccessible,
  }) => {
    await page.setContent(
      '<!doctype html><html lang="cs"><head><title>t</title></head><body><main><h1>h</h1>' +
        '<p style="color:#000;background:linear-gradient(#fff,#888)">Přechod</p></main></body></html>',
    );
    await expect(expectAccessible()).rejects.toThrow(/color-contrast/);
  });
});

test.describe('expectFocusRings', () => {
  test('rejects a stop whose outline is removed, deep in main', async ({
    page,
    expectFocusRings,
  }) => {
    await page.setContent(
      '<!doctype html><html lang="cs"><head><title>t</title>' +
        '<style>:focus-visible{outline:2px solid blue}.x:focus-visible{outline:none}</style></head><body>' +
        '<header><a href="/">a</a></header>' +
        '<main><input aria-label="x"><input class="x" aria-label="y"></main></body></html>',
    );
    await expect(expectFocusRings()).rejects.toThrow(/input/);
  });
});

/**
 * Every spec imports `test` and `expect` from here. Two guards come with it:
 * a page that breaks its own Content-Security-Policy fails the test, and
 * expectAccessible() runs axe over the page as it is.
 */
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test as base,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';

import { cs } from '@/ui/copy';

interface CspViolation {
  readonly directive: string;
  readonly blocked: string;
  readonly source: string;
  readonly origin: string;
}

/** WCAG 2.2 AA plus axe's best practices; target-size only runs when its tag is asked for. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** Rules axe reports as "incomplete" (not failed) on gradients, pseudo-content and glyphs. */
const MUST_COMPLETE = new Set(['color-contrast', 'target-size', 'label-content-name-mismatch']);

interface Fixtures {
  /** The violations seen on the app's own origin; the test fails at teardown if any remain. */
  cspViolations: CspViolation[];
  /** Waits until Next has hydrated the page: its inline bootstrap and its chunks both ran. */
  hydrated: (other?: Page) => Promise<void>;
  /** Another context with this project's options and the same CSP guard; closed at teardown. */
  newContext: (options?: BrowserContextOptions) => Promise<BrowserContext>;
  /** Waits until no submit is in flight: React Aria marks the pending button with data-pending (in a form; the kit demos show a static one). */
  settled: () => Promise<void>;
  expectAccessible: () => Promise<void>;
  /** Attaches a full-page PNG to the report: the pack for the headmaster's sign-off on the look. */
  attachScreenshot: (name: string) => Promise<void>;
  /** Tab through the page: every stop shows an outline of 2 px or more. */
  expectFocusRings: () => Promise<void>;
  /** The first Tab lands on the skip link, and Enter moves focus to the content. */
  expectSkipLink: () => Promise<void>;
  /** Signs in through the mock IdP as the persona whose button name matches. */
  signInAs: (persona: RegExp) => Promise<void>;
  /** At 320 px wide nothing scrolls sideways (desktop project only). */
  expectNoReflow: () => Promise<void>;
  /** Everything a loaded screen must pass, in order: axe, screenshot, reflow, no style=, skip link, focus rings. */
  checkScreen: (name: string) => Promise<void>;
}

/** Reports the violations of every page of the context, popups and new tabs included, into `violations`. */
async function installCspGuard(
  context: BrowserContext,
  appOrigin: string,
  violations: CspViolation[],
): Promise<void> {
  await context.exposeBinding('reportCspViolation', (_source, violation: CspViolation) => {
    // The mock IdP is another origin with a policy of its own.
    if (violation.origin === appOrigin) violations.push(violation);
  });
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      // effectiveDirective is the directive that applied; the console quotes its fallback.
      void (
        window as unknown as { reportCspViolation: (v: CspViolation) => Promise<void> }
      ).reportCspViolation({
        directive: e.effectiveDirective,
        blocked: e.blockedURI,
        source: `${e.sourceFile}:${e.lineNumber}`,
        origin: location.origin,
      });
    });
  });
}

/** Lets events still in flight reach the binding; a closed page has none. */
async function flushCspGuard(context: BrowserContext): Promise<void> {
  for (const open of context.pages()) {
    // A page without JavaScript never answers, so give up after a moment.
    const flushed = open.evaluate(() => new Promise((done) => setTimeout(done)));
    const gaveUp = new Promise((done) => setTimeout(done, 1000));
    await Promise.race([flushed, gaveUp]).catch(() => undefined);
    flushed.catch(() => undefined);
  }
}

const MAX_TAB_STOPS = 80;

export const test = base.extend<Fixtures>({
  cspViolations: [
    async ({ context, baseURL }, provide) => {
      const violations: CspViolation[] = [];
      await installCspGuard(context, new URL(baseURL ?? '').origin, violations);
      await provide(violations);
      await flushCspGuard(context);
      expect(violations).toEqual([]);
    },
    { auto: true },
  ],

  newContext: async (
    {
      browser,
      baseURL,
      locale,
      timezoneId,
      viewport,
      userAgent,
      isMobile,
      hasTouch,
      deviceScaleFactor,
      cspViolations,
    },
    provide,
  ) => {
    const opened: BrowserContext[] = [];
    await provide(async (options = {}) => {
      const context = await browser.newContext({
        baseURL,
        locale,
        timezoneId,
        viewport,
        userAgent,
        isMobile,
        hasTouch,
        deviceScaleFactor,
        ...options,
      });
      opened.push(context);
      await installCspGuard(context, new URL(baseURL ?? '').origin, cspViolations);
      return context;
    });
    // Before the violations are asserted (this fixture is torn down first).
    for (const context of opened) {
      await flushCspGuard(context);
      await context.close();
    }
  },

  hydrated: async ({ page }, provide) => {
    await provide(async (other = page) => {
      await expect.poll(() => other.evaluate(() => 'next' in window)).toBe(true);
    });
  },

  settled: async ({ page }, provide) => {
    await provide(async () => {
      await expect(page.locator('form [data-pending]')).toHaveCount(0);
    });
  },

  expectAccessible: async ({ page }, provide, testInfo) => {
    await provide(async () => {
      const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      await testInfo.attach('axe', {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });
      const describe = (entries: typeof result.violations) =>
        entries.map((r) => `${r.id}: ${r.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      expect(describe(result.violations)).toEqual([]);
      expect(describe(result.incomplete.filter((r) => MUST_COMPLETE.has(r.id)))).toEqual([]);
    });
  },

  attachScreenshot: async ({ page }, provide, testInfo) => {
    await provide(async (name) => {
      await testInfo.attach(`${name} (${testInfo.project.name})`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    });
  },

  expectFocusRings: async ({ page }, provide) => {
    await provide(async () => {
      // Start at the top, so the first Tab is the skip link and the header is walked too.
      await page.evaluate(() => {
        for (const stale of document.querySelectorAll('[data-focus-walked]')) {
          stale.removeAttribute('data-focus-walked');
        }
        const body = document.body;
        const had = body.hasAttribute('tabindex');
        if (!had) body.tabIndex = -1;
        body.focus();
        if (!had) body.removeAttribute('tabindex');
      });
      const missing: string[] = [];
      const regions = new Set<string>();
      let stops = 0;
      for (;;) {
        expect(stops, 'the tab walk never returned to a tagged element').toBeLessThan(
          MAX_TAB_STOPS,
        );
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          if (el.hasAttribute('data-focus-walked')) return null;
          el.setAttribute('data-focus-walked', '');
          const style = getComputedStyle(el);
          const region = ['header', 'main', 'footer'].find((tag) => el.closest(tag)) ?? 'none';
          const name = `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
          return { name, region, style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
        });
        if (stop === null) break;
        stops++;
        regions.add(stop.region);
        if (stop.style === 'none' || stop.width < 2) missing.push(stop.name);
      }
      expect(stops).toBeGreaterThan(0);
      expect(missing).toEqual([]);
      for (const tag of ['header', 'main', 'footer']) {
        const present = await page
          .locator(
            `${tag} :is(a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])):visible`,
          )
          .count();
        if (present > 0) expect(regions, `no tab stop inside <${tag}>`).toContain(tag);
      }
    });
  },

  expectSkipLink: async ({ page }, provide) => {
    await provide(async () => {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: cs.shell.skipLink })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#obsah')).toBeFocused();
    });
  },

  expectNoReflow: async ({ page }, provide, testInfo) => {
    await provide(async () => {
      if (testInfo.project.name !== 'desktop') return;
      const original = page.viewportSize();
      await page.setViewportSize({ width: 320, height: 640 });
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      if (original) await page.setViewportSize(original);
      expect(width).toBeLessThanOrEqual(320);
    });
  },

  checkScreen: async (
    { page, expectAccessible, attachScreenshot, expectNoReflow, expectSkipLink, expectFocusRings },
    provide,
  ) => {
    await provide(async (name) => {
      await expectAccessible();
      await attachScreenshot(name);
      await expectNoReflow();
      // The live DOM may carry style attributes (Next's route announcer gets one through the CSSOM).
      const { pathname, search } = new URL(page.url());
      expect(await (await page.request.get(pathname + search)).text()).not.toContain('style="');
      await expectSkipLink();
      await expectFocusRings();
    });
  },

  signInAs: async ({ page }, provide) => {
    await provide(async (persona) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/prihlaseni\?returnTo=%2F$/);
      await page.getByRole('link', { name: cs.signIn.button }).click();
      await expect(page.getByRole('heading', { name: 'Vývojové přihlášení' })).toBeVisible();
      await page.getByRole('button', { name: persona }).click();
    });
  },
});

/** A copy template with `@1@` and `@2@` where its dates go, as a pattern. */
export const withDates = (text: (a: string, b: string) => string) =>
  new RegExp(
    text('@1@', '@2@')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/@\d@/g, '.+')
      .replace(/\u00A0/g, '\\s'),
  );

/** The value of this context's session cookie: what the sessions table stores a digest of. */
export async function sessionToken(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((c) => c.name === '__Host-ap_session');
  if (!cookie) throw new Error('no session cookie: sign in first');
  return cookie.value;
}

/** Opens one person's page from the list, found by name as a headmaster would. */
export async function openUserDetail(page: Page, name: string): Promise<void> {
  await page.goto(`/uzivatele?hledat=${encodeURIComponent(name)}`);
  await page.getByRole('main').getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(/\/uzivatele\/[0-9a-f-]{36}$/);
}

export { expect };

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
  type Locator,
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

/**
 * Runs `check` with what an open modal made inert hidden. axe lays a modal's text over the page
 * behind it and compares the layers under each wrapped line, that page included, so a two-line
 * paragraph in a dialog comes back as color-contrast "incomplete" (`elmPartiallyObscuring`,
 * axe-core 4.14). Nobody reaches that page while the modal is open; a run without it checks it.
 */
async function hidingInert<T>(page: Page, check: () => Promise<T>): Promise<T> {
  const hide = (hidden: boolean) =>
    page.evaluate((on) => {
      for (const el of document.querySelectorAll<HTMLElement>('[inert]'))
        el.style.visibility = on ? 'hidden' : '';
    }, hidden);
  await hide(true);
  try {
    return await check();
  } finally {
    await hide(false);
  }
}

export interface Fixtures {
  /** The violations seen on the app's own origin; the test fails at teardown if any remain. */
  cspViolations: CspViolation[];
  /** Waits until Next has hydrated the page: its inline bootstrap and its chunks both ran. */
  hydrated: (other?: Page) => Promise<void>;
  /** Another context with this project's options and the same CSP guard; closed at teardown. */
  newContext: (options?: BrowserContextOptions) => Promise<BrowserContext>;
  /** Waits until no submit is in flight: React Aria marks the pending button with data-pending (in a form; the kit demos show a static one). */
  settled: () => Promise<void>;
  /** Axe over the page as it is: this test's page, or another one (a second context). */
  expectAccessible: (other?: Page) => Promise<void>;
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

/** The users list has a link per seeded persona (about 50, one for each sign-in the journeys use), so the walk needs room. */
const MAX_TAB_STOPS = 120;

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
    await provide(async (other = page) => {
      const result = await hidingInert(other, () =>
        new AxeBuilder({ page: other })
          .withTags(AXE_TAGS)
          // React Aria's live announcer keeps a hidden copy of a pressed button for 7 s, as an image without a text.
          .exclude('[data-live-announcer] [role="log"]')
          .analyze(),
      );
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
      // Branch arch-ui: signed out, `/` is the Arch UI's own sign-in, with the same button.
      await page.goto('/');
      await page.getByRole('link', { name: cs.signIn.button }).click();
      await expect(page.getByRole('heading', { name: 'Vývojové přihlášení' })).toBeVisible();
      await showAllPersonas(page);
      await page.getByRole('button', { name: persona }).click();
    });
  },
});

/** Copy as pattern source: its characters taken literally, a no-break space matching any space. */
const literal = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\u00A0/g, '\\s');

/** A copy template with `@1@` and `@2@` where its dates go, as a pattern. */
export const withDates = (text: (a: string, b: string) => string) =>
  new RegExp(literal(text('@1@', '@2@')).replace(/@\d@/g, '.+'));

/** A labelled control by its copy; an optional one has „ (nepovinné)“ after its label. */
export const field = (within: Page | Locator, label: string) =>
  within.getByLabel(new RegExp(`^${literal(label)}(\\s\\(nepovinné\\))?$`));

/**
 * The autosave's numbers. They are the machine's (`DEBOUNCE_MS` and `RETRY_STEPS`, in seconds, in
 * src/ui/form/autosave/machine.ts, which no index exports): a test that moves Playwright's clock
 * needs them, and a change there must change them here.
 */
export const DEBOUNCE_MS = 1_500;
export const LADDER_MS = [5_000, 15_000, 60_000] as const;

/**
 * Stops the page's clock where it is (`page.clock.install()` came before the load), so no
 * debounce and no retry fires until a test moves it: only a flush can save what is typed.
 */
export const freezeClock = (page: Page) => page.clock.pauseAt(new Date(Date.now() + 1_000));

/** The status line after a save: „Uloženo v 14:05“. */
export const SAVED = /^Uloženo v/;

/** The banners (`role="alert"`) of a page, not Next's empty route announcer, which has the same role. */
export const banners = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** Counts the server actions (autosaves and other calls) a page sends from now on, by the header that marks one. */
export function countActions(page: Page): { readonly count: () => number } {
  let n = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action'] !== undefined) n += 1;
  });
  return { count: () => n };
}

/**
 * Opens the header menu when the layout hides the navigation in it (below `lg`, where the
 * „Menu“ summary shows); on a wide screen the navigation is on the page already. It never closes it.
 */
export async function openNav(page: Page): Promise<void> {
  const menu = page.locator('summary', { hasText: cs.shell.menu });
  if (!(await menu.isVisible())) return;
  const opened = await menu.evaluate(
    (summary) => (summary.parentElement as HTMLDetailsElement).open,
  );
  if (!opened) await menu.click();
}

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

/** Opens the mock IdP's „Další testovací osoby“: every persona but the two dev accounts is folded there. */
export async function showAllPersonas(page: Page): Promise<void> {
  await page.locator('details').evaluate((more: HTMLDetailsElement) => {
    more.open = true;
  });
}

/**
 * Signs `persona` in on a second context from the `newContext` fixture (so the
 * CSP guard covers it) and returns its page; the caller checks where it landed.
 */
export async function signInElsewhere(
  newContext: Fixtures['newContext'],
  persona: RegExp,
): Promise<Page> {
  const other = await (await newContext()).newPage();
  // Branch arch-ui: the classic home, so the callers' next page is a Next page.
  await other.goto('/klasicke');
  await other.getByRole('link', { name: cs.signIn.button }).click();
  await showAllPersonas(other);
  await other.getByRole('button', { name: persona }).click();
  return other;
}

export { expect };

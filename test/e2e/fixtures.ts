/**
 * Every spec imports `test` and `expect` from here. Two guards come with it:
 * a page that breaks its own Content-Security-Policy fails the test, and
 * expectAccessible() runs axe over the page as it is.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test as base } from '@playwright/test';

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
  expectAccessible: () => Promise<void>;
  /** Tab through the page: every stop shows an outline of 2 px or more. */
  expectFocusRings: () => Promise<void>;
  /** The first Tab lands on the skip link, and Enter moves focus to the content. */
  expectSkipLink: () => Promise<void>;
  /** At 320 px wide nothing scrolls sideways (desktop project only). */
  expectNoReflow: () => Promise<void>;
}

const MAX_TAB_STOPS = 40;

export const test = base.extend<Fixtures>({
  cspViolations: [
    async ({ page, baseURL }, provide) => {
      const violations: CspViolation[] = [];
      const appOrigin = new URL(baseURL ?? '').origin;
      await page.exposeFunction('reportCspViolation', (violation: CspViolation) => {
        // The mock IdP is another origin with a policy of its own.
        if (violation.origin === appOrigin) violations.push(violation);
      });
      await page.addInitScript(() => {
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
      await provide(violations);
      // Let events still in flight reach the binding; a closed page has none.
      await page.evaluate(() => new Promise((done) => setTimeout(done))).catch(() => undefined);
      expect(violations).toEqual([]);
    },
    { auto: true },
  ],

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

  expectFocusRings: async ({ page }, provide) => {
    await provide(async () => {
      const missing: string[] = [];
      const seen = new Set<string>();
      for (let stop = 0; stop < MAX_TAB_STOPS; stop++) {
        await page.keyboard.press('Tab');
        const ring = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const style = getComputedStyle(el);
          const name = `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
          return { name, style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
        });
        if (ring === null || seen.has(ring.name)) break;
        seen.add(ring.name);
        if (ring.style === 'none' || ring.width < 2) missing.push(ring.name);
      }
      expect(seen.size).toBeGreaterThan(0);
      expect(missing).toEqual([]);
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
});

export { expect };

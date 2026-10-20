/**
 * Every spec imports `test` and `expect` from here. Two guards come with it:
 * a page that breaks its own Content-Security-Policy fails the test, and
 * expectAccessible() runs axe over the page as it is.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test as base } from '@playwright/test';

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
}

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
});

export { expect };

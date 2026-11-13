import { describe, expect, it } from 'vitest';

import { scanSource } from './scan';

const findings = (file: string, text: string) => scanSource(file, text).findings;

describe('scanSource', () => {
  it.each([
    ['src/ui/copy/x.ts', "'use server';\nexport const a = 1;"],
    ['src/server/routes/x.ts', "'use server';\nexport {};"],
  ])('refuses a file-level "use server" in %s', (file, text) => {
    expect(findings(file, text)).toContain(`${file}: "use server" (server actions are not used)`);
  });

  it('refuses inline server actions and cache directives anywhere', () => {
    const text = `export async function save() {\n  'use server';\n}\nconst read = async () => {\n  "use cache";\n};`;
    expect(findings('src/ui/page.tsx', text)).toEqual([
      'src/ui/page.tsx: inline "use server" directive',
      'src/ui/page.tsx: inline "use cache" directive',
    ]);
    expect(findings('src/app/page.tsx', "'use cache';\nexport default 1;")).toEqual([
      'src/app/page.tsx: "use cache" (cacheComponents is off)',
    ]);
  });

  it('lets route files export HTTP methods only, as consts', () => {
    const file = 'src/app/auth/login/route.ts';
    expect(
      findings(file, "import { login } from '@/server/routes';\nexport const GET = login;"),
    ).toEqual([]);
    expect(findings(file, "export const dynamic = 'force-static';")).toEqual([
      `${file}: exports dynamic; a route file exports HTTP methods only`,
    ]);
    expect(findings(file, 'export async function GET() {}')).toEqual([
      `${file}: exports a declaration instead of a wrapped const`,
    ]);
    expect(findings(file, 'export default GET;')).toContain(`${file}: has a default export`);
    expect(findings(file, 'export let GET = 1;')).toContain(`${file}: exports a let or var`);
    expect(findings(file, "export * from './a';")).toContain(
      `${file}: re-exports values (export { … } or export *)`,
    );
  });

  it('refuses JavaScript files and the Pages Router', () => {
    expect(findings('src/app/x/route.js', 'export const GET = 1;')).toContain(
      'src/app/x/route.js: src/ holds TypeScript only (pageExtensions)',
    );
    expect(findings('src/pages/api/x.ts', 'export default function x() {}')).toEqual([
      'src/pages/api/x.ts: the Pages Router is not used; entry points live in src/app',
    ]);
  });

  it('refuses metadata routes', () => {
    for (const file of [
      'src/app/robots.ts',
      'src/app/icon2.tsx',
      'src/app/(x)/opengraph-image3.ts',
    ]) {
      expect(findings(file, 'export default function f() {}')).toEqual([
        `${file}: metadata routes are not wrapped; list it in the test first`,
      ]);
    }
  });

  it('notices a directive-like line the parser did not see as a directive', () => {
    const text = "const notADirective = [\n  'use server'\n];";
    expect(findings('src/ui/x.ts', text)).toEqual([
      'src/ui/x.ts: 1 directive-like lines, but the parser found 0',
    ]);
  });
});

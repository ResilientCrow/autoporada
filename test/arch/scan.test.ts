import { describe, expect, it } from 'vitest';

import { scanSource } from './scan';

const ACTIONS = 'src/server/actions/access.ts';
const IMPORT = "import { defineAction } from '@/server/bind';";
const findings = (file: string, text: string) => scanSource(file, text).findings;

describe('scanSource', () => {
  it('accepts an action module of the one allowed shape', () => {
    const text = `'use server';
${IMPORT}
import { requestAccess } from '@/application/use-cases';
export type Input = { reason: string };
export const requestAccessAction = defineAction(requestAccess, { rateLimit: 'accessRequest' });`;
    expect(findings(ACTIONS, text)).toEqual([]);
    expect(scanSource(ACTIONS, text).serverFile).toBe(true);
  });

  it.each([
    ['src/ui/form.ts', "'use server';\nexport const a = 1;"],
    ['src/server/actions/index.ts', "'use server';\nexport {};"],
  ])('refuses a file-level "use server" in %s', (file, text) => {
    expect(findings(file, text)).toEqual([
      `${file}: "use server" belongs in src/server/actions/<name>.ts only`,
    ]);
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

  it.each([
    ['export async function save() {}', 'exports a declaration instead of a wrapped const'],
    ['export default defineAction(x, o);', 'has a default export'],
    ['export let a = defineAction(x, o);', 'exports a let or var'],
    ["export { a } from './a';", 're-exports values (export { … } or export *)'],
    ["export * from './a';", 're-exports values (export { … } or export *)'],
    ['export const a = other(x);', 'exports a without defineAction from @/server/bind'],
  ])('refuses an action module that %s', (body, problem) => {
    expect(findings(ACTIONS, `'use server';\n${IMPORT}\n${body}`)).toContain(
      `${ACTIONS}: ${problem}`,
    );
  });

  it('refuses defineAction from anywhere else, or renamed', () => {
    const elsewhere = `'use server';\nimport { defineAction } from './fake';\nexport const a = defineAction(x, o);`;
    const renamed = `'use server';\nimport { defineAction as d } from '@/server/bind';\nexport const a = d(x, o);`;
    for (const text of [elsewhere, renamed]) {
      expect(findings(ACTIONS, text)).toEqual([
        `${ACTIONS}: exports a without defineAction from @/server/bind`,
      ]);
    }
    expect(findings(ACTIONS, `${IMPORT}\nexport const a = defineAction(x, o);`)).toEqual([
      `${ACTIONS}: an action module needs a file-level "use server"`,
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

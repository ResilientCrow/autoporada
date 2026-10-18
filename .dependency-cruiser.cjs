/**
 * Layer rules from docs/adr/0004-module-boundaries.md.
 * Changing a rule here is an architecture change: update the ADR as well.
 * @type {import('dependency-cruiser').IConfiguration}
 */

/** Matches an npm package; pnpm paths end in .../node_modules/<name>/ too. */
const npm = (...names) => `(^|/)node_modules/(${names.join('|')})/`;

const TESTS = ['\\.test\\.tsx?$', '^test/'];

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'A module nobody imports is dead code (entry points excepted).',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '^src/app/',
          '^src/(worker|cli)/main\\.ts$',
          '^src/proxy\\.ts$',
          ...TESTS,
        ],
      },
      to: {},
    },
    {
      name: 'domain-is-pure',
      comment: 'domain/ is pure TypeScript: it imports only domain/.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { pathNot: '^src/domain/' },
    },
    {
      name: 'snapshot-deps',
      severity: 'error',
      from: { path: '^src/snapshot/' },
      to: { pathNot: ['^src/(snapshot|domain)/', npm('zod')] },
    },
    {
      name: 'contracts-deps',
      severity: 'error',
      from: { path: '^src/contracts/' },
      to: { pathNot: ['^src/(contracts|domain)/', npm('zod')] },
    },
    {
      name: 'notify-deps',
      severity: 'error',
      from: { path: '^src/notify/' },
      to: { pathNot: '^src/(notify|domain)/' },
    },
    {
      name: 'document-deps',
      severity: 'error',
      from: { path: '^src/document/' },
      to: { pathNot: ['^src/(document|domain|snapshot)/', npm('docx', 'react', 'react-dom')] },
    },
    {
      name: 'docx-only-in-render-docx',
      severity: 'error',
      from: { pathNot: '^src/document/render-docx/' },
      to: { path: npm('docx') },
    },
    {
      name: 'react-in-document-only-in-render-html',
      severity: 'error',
      from: { path: '^src/document/', pathNot: '^src/document/render-html/' },
      to: { path: npm('react', 'react-dom') },
    },
    {
      name: 'application-is-framework-free',
      comment: 'Use cases talk to the outside world only through ports.',
      severity: 'error',
      from: { path: '^src/application/' },
      to: {
        path: [
          '^src/(infra|server|app|ui|worker|cli)/',
          npm('next', 'react', 'drizzle-orm', 'pg', 'pg-boss', 'docx'),
        ],
      },
    },
    {
      name: 'infra-is-a-leaf',
      severity: 'error',
      from: { path: '^src/infra/' },
      to: { path: ['^src/(app|ui|server|worker|cli)/', '^src/application/use-cases/'] },
    },
    {
      name: 'infra-only-from-composition-roots',
      severity: 'error',
      from: {
        pathNot: [
          '^src/infra/',
          '^src/server/container\\.ts$',
          '^src/worker/',
          '^src/cli/',
          ...TESTS,
        ],
      },
      to: { path: '^src/infra/' },
    },
    {
      name: 'app-deps',
      comment: 'Routes are thin: they reach logic only through server/.',
      severity: 'error',
      from: { path: '^src/app/' },
      to: { path: '^src/(domain|document|application|infra|snapshot|notify|worker|cli)/' },
    },
    {
      name: 'ui-deps',
      severity: 'error',
      from: { path: '^src/ui/' },
      to: {
        path: [
          '^src/(server|infra|application|app|worker|cli|notify)/',
          '^src/document/render-docx/',
        ],
      },
    },
    {
      name: 'server-not-into-delivery',
      severity: 'error',
      from: { path: '^src/server/' },
      to: { path: '^src/(app|ui)/' },
    },
    {
      name: 'cross-module-via-index',
      comment: 'Other modules are used through their index.ts only.',
      severity: 'error',
      from: { path: '^src/([^/]+)/([^/]+)/', pathNot: TESTS },
      to: {
        path: '^src/[^/]+/[^/]+/.+',
        pathNot: ['^src/$1/$2/', '^src/[^/]+/[^/]+/index\\.tsx?$', '^src/app/'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(\\.next|coverage)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};

/**
 * Layer rules from docs/adr/0004-module-boundaries.md.
 * Changing a rule here is an architecture change: update the ADR as well.
 * @type {import('dependency-cruiser').IConfiguration}
 */

/** Matches an npm package; pnpm paths end in .../node_modules/<name>/ too. */
const npm = (...names) => `(^|/)node_modules/(${names.join('|')})/`;

const TESTS = ['\\.test\\.tsx?$', '^test/'];
const INDEX = '^src/[^/]+/[^/]+/index\\.tsx?$';

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
          '^src/(proxy|instrumentation)\\.ts$',
          ...TESTS,
        ],
      },
      to: {},
    },
    {
      name: 'domain-is-pure',
      comment: 'domain/ is pure TypeScript: it imports only domain/ (tests may use test tools).',
      severity: 'error',
      from: { path: '^src/domain/', pathNot: TESTS },
      to: { pathNot: '^src/domain/' },
    },
    {
      name: 'snapshot-deps',
      severity: 'error',
      from: { path: '^src/snapshot/', pathNot: TESTS },
      to: { pathNot: ['^src/(snapshot|domain)/', npm('zod')] },
    },
    {
      name: 'contracts-deps',
      severity: 'error',
      from: { path: '^src/contracts/', pathNot: TESTS },
      to: { pathNot: ['^src/(contracts|domain)/', npm('zod')] },
    },
    {
      name: 'notify-deps',
      severity: 'error',
      from: { path: '^src/notify/', pathNot: TESTS },
      to: { pathNot: ['^src/(notify|domain)/', npm('zod')] },
    },
    {
      name: 'document-deps',
      severity: 'error',
      from: { path: '^src/document/', pathNot: TESTS },
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
      comment: 'Use cases talk to the outside world only through ports (no I/O, no Node core).',
      severity: 'error',
      from: { path: '^src/application/' },
      to: {
        pathNot: ['^src/(application|domain|snapshot|document|contracts|notify)/', npm('zod')],
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
          '^src/(worker|cli)/main\\.ts$',
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
          '^src/(server|infra|application|app|worker|cli|notify|snapshot)/',
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
      name: 'jsx-only-in-react-layers',
      comment: 'JSX compiles to an invisible react/jsx-runtime import, so ban .tsx files outright.',
      severity: 'error',
      from: {},
      to: {
        path: [
          '^src/(domain|snapshot|contracts|notify|application|infra|server|worker|cli)/.+\\.tsx$',
          '^src/document/.+\\.tsx$',
        ],
        pathNot: '^src/document/render-html/',
      },
    },
    {
      name: 'cross-module-via-index',
      comment: 'Other modules are used through their index.ts only.',
      severity: 'error',
      from: { path: '^src/([^/]+)/([^/]+)/', pathNot: TESTS },
      to: {
        path: '^src/[^/]+/[^/]+/.+',
        pathNot: ['^src/$1/$2/', INDEX, '^src/ui/features/[^/]+/index\\.tsx?$', '^src/app/'],
      },
    },
    {
      name: 'layer-root-files-via-index',
      comment: 'Files directly in a layer (e.g. server/container.ts) obey the index rule too.',
      severity: 'error',
      from: { path: '^src/([^/]+)/[^/]+$', pathNot: TESTS },
      to: {
        path: '^src/[^/]+/[^/]+/.+',
        pathNot: ['^src/$1/', INDEX, '^src/ui/features/[^/]+/index\\.tsx?$', '^src/app/'],
      },
    },
    {
      name: 'flat-layers-via-index',
      comment: 'snapshot/, contracts/ and notify/ are one module each.',
      severity: 'error',
      from: { path: '^src/([^/]+)/', pathNot: TESTS },
      to: {
        path: '^src/(snapshot|contracts|notify)/[^/]+$',
        pathNot: ['^src/$1/', '^src/[^/]+/index\\.tsx?$'],
      },
    },
    {
      name: 'features-via-index',
      comment: 'ui/features/<feature>/ are modules of their own.',
      severity: 'error',
      from: { path: '^src/ui/features/([^/]+)/', pathNot: TESTS },
      to: {
        path: '^src/ui/features/[^/]+/',
        pathNot: ['^src/ui/features/$1/', '^src/ui/features/[^/]+/index\\.tsx?$'],
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

/**
 * Layer rules from docs/adr/0004-module-boundaries.md (ui/ modules: 0012).
 * Changing a rule here is an architecture change: update the ADR as well.
 * @type {import('dependency-cruiser').IConfiguration}
 */

/** Matches an npm package; pnpm paths end in .../node_modules/<name>/ too. */
const npm = (...names) => `(^|/)node_modules/(${names.join('|')})/`;

const TESTS = ['\\.test\\.tsx?$', '^test/'];
const INDEX = '^src/[^/]+/[^/]+/index\\.tsx?$';
/** The modules of ui/ (ADR 0012); status/ is reserved for domain status maps. */
const UI_MODULES = 'theme|copy|kit|form|shell|status|features';

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
      from: { path: '^src/application/', pathNot: TESTS },
      to: {
        pathNot: ['^src/(application|domain|snapshot|document|contracts|notify)/', npm('zod')],
      },
    },
    {
      name: 'infra-is-a-leaf',
      severity: 'error',
      from: { path: '^src/infra/' },
      to: { path: '^src/(app|ui|server|worker|cli)/' },
    },
    {
      name: 'infra-implements-ports',
      comment: 'Infra knows the application only through its ports (ADR 0011).',
      severity: 'error',
      from: { path: '^src/infra/' },
      to: { path: '^src/application/', pathNot: '^src/application/ports/' },
    },
    {
      name: 'io-libraries-only-in-infra',
      comment: 'Database, queue and OpenID drivers stay behind the ports (ADR 0011).',
      severity: 'error',
      from: { pathNot: ['^src/infra/', ...TESTS] },
      to: { path: npm('drizzle-orm', 'pg', 'pg-boss', 'openid-client', 'oauth4webapi', 'jose') },
    },
    {
      name: 'no-test-helpers-in-src',
      severity: 'error',
      from: { path: '^src/', pathNot: TESTS },
      to: { path: '^test/' },
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
      name: 'app-uses-server-entries',
      comment: 'Routes reach the server only through its actions, routes and pages entry modules.',
      severity: 'error',
      from: { path: '^src/app/' },
      to: { path: '^src/server/', pathNot: '^src/server/(actions|routes|pages)/index\\.ts$' },
    },
    {
      name: 'container-bound-only-at-the-edges',
      comment:
        'The pipeline, auth and the rest of server/ take their dependencies as arguments. The container, and every module bound to it (bind, pages, routes, actions), is reached only by those modules, app/ and instrumentation.',
      severity: 'error',
      from: {
        path: '^src/',
        pathNot: [
          '^src/app/',
          '^src/server/(bind|pages|routes|actions)/',
          '^src/server/container(\\.test)?\\.ts$',
          '^src/instrumentation\\.ts$',
        ],
      },
      to: { path: '^src/server/(container\\.ts$|bind/|pages/|routes/|actions/)' },
    },
    {
      name: 'proxy-is-light',
      comment: 'proxy.ts runs on every request: next/server and the CSP module only.',
      severity: 'error',
      from: { path: '^src/proxy\\.ts$' },
      to: { pathNot: [npm('next'), '^src/server/http/index\\.ts$'] },
    },
    {
      name: 'server-http-is-leaf',
      severity: 'error',
      from: { path: '^src/server/http/' },
      to: { path: '^src/(?!server/http/)' },
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
      name: 'ui-known-modules',
      comment:
        'ui/ has a fixed set of modules (ADR 0012); a new one changes this rule and needs an ADR.',
      severity: 'error',
      from: {},
      to: { path: `^src/ui/(?!(${UI_MODULES})/)` },
    },
    {
      name: 'ui-leaves',
      comment: 'theme, copy and kit import nothing else in ui/ (kit gets its text as props).',
      severity: 'error',
      from: { path: '^src/ui/(theme|copy|kit)/', pathNot: TESTS },
      to: { path: '^src/ui/', pathNot: '^src/ui/$1/' },
    },
    {
      name: 'ui-form-shell-status',
      comment: 'form, shell and status build on kit and copy only.',
      severity: 'error',
      from: { path: '^src/ui/(form|shell|status)/', pathNot: TESTS },
      to: { path: '^src/ui/', pathNot: ['^src/ui/$1/', '^src/ui/(kit|copy)/'] },
    },
    {
      name: 'ui-features-no-shell-theme',
      comment: 'Pages put features inside the shell; only the root layouts load the theme.',
      severity: 'error',
      from: { path: '^src/ui/features/', pathNot: TESTS },
      to: { path: '^src/ui/(theme|shell)/' },
    },
    {
      name: 'ui-features-isolated',
      severity: 'error',
      from: { path: '^src/ui/features/([^/]+)/', pathNot: TESTS },
      to: { path: '^src/ui/features/', pathNot: '^src/ui/features/$1/' },
    },
    {
      name: 'theme-only-from-root-layouts',
      comment:
        'The stylesheet is loaded once, by the root layout and the error page that replaces it.',
      severity: 'error',
      from: { pathNot: ['^src/app/(layout|global-error)\\.tsx$', '^src/ui/theme/', ...TESTS] },
      to: { path: '^src/ui/theme/' },
    },
    {
      name: 'react-aria-only-in-kit-and-form',
      comment: 'React Aria is wrapped once, in the audited kit and form modules (ADR 0012).',
      severity: 'error',
      from: { pathNot: ['^src/ui/(kit|form)/', ...TESTS] },
      to: { path: npm('react-aria-components', 'react-aria', 'react-stately') },
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

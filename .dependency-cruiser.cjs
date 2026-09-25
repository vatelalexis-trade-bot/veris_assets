/**
 * Dependency rules checked in CI (`pnpm depcruise`): generic hygiene (no cycles, no undeclared
 * or unresolvable dependencies) and the module boundaries of docs/ARCHITECTURE.md §4.2.
 * @type {import('dependency-cruiser').IConfiguration}
 */

const MODULES = 'apps/api/src/modules';
const CORE = 'apps/api/src/core';

// Which business module may call which (docs/ARCHITECTURE.md §4.2). No cycles allowed.
const ALLOWED_MODULE_DEPENDENCIES = {
  iam: [],
  'investor-compliance': ['iam'],
  issuance: ['investor-compliance', 'iam'],
  registry: ['issuance', 'investor-compliance', 'iam'],
  servicing: ['registry', 'issuance', 'iam'],
  'reporting-audit': ['iam', 'investor-compliance', 'issuance', 'registry', 'servicing'],
};

const escape = (name) => name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

const moduleGraphRules = Object.entries(ALLOWED_MODULE_DEPENDENCIES).map(([module, allowed]) => ({
  name: `module-graph-${module}`,
  comment: `The ${module} module may only call: ${allowed.join(', ') || 'no other module'} (docs/ARCHITECTURE.md §4.2).`,
  severity: 'error',
  from: { path: `^${MODULES}/${escape(module)}/` },
  to: {
    path: `^${MODULES}/[^/]+/`,
    pathNot: [`^${MODULES}/${escape(module)}/`, ...allowed.map((m) => `^${MODULES}/${escape(m)}/`)],
  },
}));

module.exports = {
  extends: 'dependency-cruiser/configs/recommended-strict',
  forbidden: [
    {
      name: 'no-orphans',
      comment:
        'A module that nothing imports is probably dead code. Package entry points and test helpers are exempt.',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$',
          '[.]d[.]ts$',
          '(^|/)tsconfig[.]json$',
          '(^|/)(?:babel|webpack)[.]config[.](?:js|cjs|mjs|ts|cts|mts|json)$',
          '^packages/[^/]+/src/index[.]ts$',
          '^apps/api/src/test/',
        ],
      },
      to: {},
    },
    {
      name: 'module-public-api-only',
      comment:
        'A module may use another module only through its public index.ts, never its internal files.',
      severity: 'error',
      from: { path: `^${MODULES}/([^/]+)/` },
      to: {
        path: `^${MODULES}/[^/]+/`,
        pathNot: [`^${MODULES}/$1/`, `^${MODULES}/[^/]+/index[.]ts$`],
      },
    },
    ...moduleGraphRules,
    {
      name: 'core-does-not-import-modules',
      comment: 'The technical core holds no business rule and never depends on a business module.',
      severity: 'error',
      from: { path: `^${CORE}/` },
      to: { path: `^${MODULES}/` },
    },
    {
      name: 'domain-is-pure',
      comment:
        'Domain code (state machines, calculations, eligibility) is pure: it only uses its own domain folder and @virtus/shared.',
      severity: 'error',
      from: { path: `^${MODULES}/([^/]+)/domain/` },
      to: {
        pathNot: [`^${MODULES}/$1/domain/`, '^packages/shared/', '(^|/)node_modules/decimal[.]js/'],
      },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules'] },
    exclude: { path: ['[.]spec[.]ts$', '(^|/)dist/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};

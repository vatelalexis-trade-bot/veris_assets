/**
 * Dependency rules checked in CI (`pnpm depcruise`).
 * Phase 1: generic hygiene rules (no cycles, no undeclared or unresolvable dependencies).
 * Phase 2 adds the module boundary rules of docs/ARCHITECTURE.md §4.2.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  extends: 'dependency-cruiser/configs/recommended-strict',
  forbidden: [
    {
      name: 'no-orphans',
      comment:
        'A module that nothing imports is probably dead code. Package entry points are exempt.',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$',
          '[.]d[.]ts$',
          '(^|/)tsconfig[.]json$',
          '(^|/)(?:babel|webpack)[.]config[.](?:js|cjs|mjs|ts|cts|mts|json)$',
          '^packages/[^/]+/src/index[.]ts$',
        ],
      },
      to: {},
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

// d3-selection and d3-transition ship no bundled type declarations. We import
// them directly only in mapDeps.test.ts (a regression guard for the map's
// d3-zoom dependency chain) and don't want to pull in @types packages just for
// that, so declare them as ambient untyped modules here.
declare module 'd3-selection'
declare module 'd3-transition'

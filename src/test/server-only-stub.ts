// vitest runs outside React's server/client module graph, so the real
// "server-only" package (which throws on any non-RSC import) is aliased to
// this empty module in vitest.config.ts. Next.js still enforces the boundary
// in the app build.
export {};

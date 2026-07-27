import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    // Live-chain tests are opt-in: `bun test --project=live` style runs, or ARCADE_LIVE=1.
    exclude: ["**/node_modules/**", "**/*.live.test.ts"],
    testTimeout: 30_000
  },
  resolve: {
    // These are prefix matches, so subpath entries MUST come before their bare package —
    // otherwise `@arcade/buyer/hire` rewrites to `<…>/src/index.ts/hire`. Bun resolves
    // these through the workspace and package `exports` at runtime; vitest does not, which
    // is why they are listed twice.
    alias: {
      "@arcade/buyer/hire": new URL("./packages/buyer/src/hire.ts", import.meta.url).pathname,
      "@arcade/runner/engines/types": new URL(
        "./packages/runner/src/engines/types.ts",
        import.meta.url
      ).pathname,
      "@arcade/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@arcade/payments": new URL("./packages/payments/src/index.ts", import.meta.url).pathname,
      "@arcade/buyer": new URL("./packages/buyer/src/index.ts", import.meta.url).pathname
    }
  }
})

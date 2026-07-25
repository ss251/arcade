import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    // Live-chain tests are opt-in: `bun test --project=live` style runs, or ARCADE_LIVE=1.
    exclude: ["**/node_modules/**", "**/*.live.test.ts"],
    testTimeout: 30_000
  },
  resolve: {
    alias: {
      "@arcade/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@arcade/payments": new URL("./packages/payments/src/index.ts", import.meta.url).pathname,
      "@arcade/buyer": new URL("./packages/buyer/src/index.ts", import.meta.url).pathname
    }
  }
})

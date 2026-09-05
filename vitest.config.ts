import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // `.tsx` is included for `apps/web`'s component tests. Without it a component test
    // file is not "failing" — it is not collected at all, which looks identical to green.
    include: [
      "packages/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.tsx"
    ],
    // Live-chain tests are opt-in: `bun test --project=live` style runs, or ARCADE_LIVE=1.
    //
    // `*.bun.test.ts` covers code that can only run under Bun — currently the hub's sqlite
    // store, which needs `bun:sqlite` (Node has `node:sqlite`, Bun has no such module, and
    // there is no shared built-in). That is not a coverage gap being hidden: the hub is
    // already Bun-only because `Bun.serve` provides its websocket upgrade, so a store that
    // cannot load under Node belongs to a server that cannot either.
    //
    // Excluding them here means `bun run test` MUST run them separately, and it does —
    // the root `test` script is `vitest run && bun test .bun.test`. It was not always: for
    // a while the script was `vitest run` alone, so the seven durable-store tests that
    // make the deploy's persistence claim true were reachable only by a human who
    // remembered a second command, while the suite read green without them. If you ever
    // have to say "plus seven" when quoting a number, the seven are not gated.
    exclude: ["**/node_modules/**", "**/*.live.test.ts", "**/*.bun.test.ts"],
    testTimeout: 30_000
  },
  // The root project is not a React project — only `apps/web` is — so JSX has no automatic
  // runtime unless it is asked for here. Set at the esbuild layer rather than by adding
  // `jsx` to the root tsconfig, which would make `.tsx` compile in packages that must
  // never contain any.
  esbuild: { jsx: "automatic" },
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

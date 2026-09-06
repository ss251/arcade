import { spawnSync } from "node:child_process"
import { expect, it } from "vitest"

it("imports pure publishing boundaries without selecting a chain or making a request", () => {
  for (const path of [
    "apps/web/src/lib/publish-preview.ts", "apps/web/src/lib/publish-policy.ts", "packages/runner/src/publish-preview.ts"
  ]) {
    const result = spawnSync("bun", ["--no-env-file", "-e",
      'globalThis.fetch=()=>{throw Error("unexpected request")}; await import(' + JSON.stringify("./" + path) + '); console.log("IMPORT_OK")'],
    { cwd: new URL("../../..", import.meta.url).pathname, env: { PATH: process.env["PATH"] ?? "", ARCADE_NETWORK: "invalid-network-fixture" },
      encoding: "utf8", timeout: 6000, maxBuffer: 16384 })
    expect(result.status, path).toBe(0)
    expect(result.stdout.trim()).toBe("IMPORT_OK")
  }
}, 20000)

import { join } from "node:path"
import { runPublishChild } from "../../src/lib/publish-child.ts"
const home = process.argv[2]!, repo = new URL("../../../..", import.meta.url).pathname
try {
  await runPublishChild({ bun: process.execPath, cli: join(repo, "apps/web/test/fixtures/publish-process.ts"),
    preload: join(repo, "apps/web/src/lib/publish-discovery-guard.ts"), cwd: home, home,
    target: "hang", generated: false }, new AbortController().signal, 5000)
} catch { process.exitCode = 1 }

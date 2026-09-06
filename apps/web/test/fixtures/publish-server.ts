// Actual Start + actual local CLI, isolated from live model/hub/wallet settings.
import { createServer } from "vite"
import { realpathSync } from "node:fs"

const repo = realpathSync(new URL("../../../..", import.meta.url).pathname)
if (process.argv[2] === "local") {
  process.env["ARCADE_PUBLISH_LOCAL"] = "1"
  process.env["ARCADE_REPO_ROOT"] = repo
  process.env["ARCADE_PUBLISH_BUN"] = process.execPath
} else delete process.env["ARCADE_PUBLISH_LOCAL"]
const web = await createServer({ root: repo + "/apps/web", envDir: false,
  server: { host: "127.0.0.1", port: 0 }, clearScreen: false })
await web.listen()
const address = web.httpServer!.address()
if (!address || typeof address === "string") throw Error("Owned web fixture unavailable")
console.log(`[publish-origin] http://127.0.0.1:${address.port}`)
let closing = false
const parent = process.ppid
async function close() {
  if (closing) return
  closing = true; clearTimeout(fuse); clearInterval(watch); await web.close(); process.exit(0)
}
const fuse = setTimeout(() => { void close() }, 180000)
const watch = setInterval(() => { if (process.ppid !== parent) void close() }, 500)
process.once("SIGTERM", () => { void close() }); process.once("SIGINT", () => { void close() })

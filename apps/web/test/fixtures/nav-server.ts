// Real Start/Vite route fixture: no provider key, no external fetch and no production seam.
import { createServer } from "vite"
const nativeFetch = globalThis.fetch
globalThis.fetch = Object.assign(((input: string | URL | Request, init?: RequestInit) => {
  const u = new URL(input instanceof Request ? input.url : String(input))
  if (u.protocol !== "http:" || u.hostname !== "127.0.0.1") return Promise.reject(Error("Offline fixture refuses external request"))
  return nativeFetch(input, init)
}) as typeof fetch, { preconnect() { throw Error("Offline fixture refuses preconnect") } })
const server = await createServer({ root: new URL("../..", import.meta.url).pathname,
  envDir: false, server: { host: "127.0.0.1", port: 0 }, clearScreen: false })
await server.listen()
const bound = server.httpServer!.address()
if (bound === null || typeof bound === "string") throw Error("Owned server failed to bind")
console.log(`[h5-origin] http://127.0.0.1:${bound.port}`)
let closing = false
// Also usable for a bounded, keyless visual inspection; the HTTP test reaps it sooner.
const hard = setTimeout(() => process.exit(1), 300_000)
async function close() { if (closing) return; closing = true; await server.close(); clearTimeout(hard); process.exit(0) }
process.once("SIGTERM", () => { void close() }); process.once("SIGINT", () => { void close() })

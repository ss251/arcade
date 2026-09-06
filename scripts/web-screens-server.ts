/** Screenshot-only wrapper around the actual prebuilt Start handler.
 * Not a production entrypoint. No model/wallet/preview/private-job route.
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { parseScreenOptions, screenLocalPath, screenUpstream } from "./web-screens-policy.ts"

const options = parseScreenOptions(process.argv.slice(2))
process.env["ARCADE_HUB"] = options.hub
const root = new URL("..", import.meta.url).pathname
const nativeFetch = globalThis.fetch
let reads = 0, refused = 0
globalThis.fetch = Object.assign(((input: string | URL | Request, init?: RequestInit) => {
  try {
    const request = new Request(input, init)
    if (!screenUpstream(request, options)) { refused++; return Promise.reject(new Error("Screenshot upstream refused")) }
    reads++
    return nativeFetch(new Request(request, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" }))
  } catch { refused++; return Promise.reject(new Error("Screenshot upstream refused")) }
}) as typeof fetch, { preconnect() { throw new Error("Screenshot preconnect refused") } })
const built = join(root, "apps/web/dist/server/server.js")
if (!existsSync(built)) throw new Error("Build web before capturing screenshots")
const handler = (await import(built)).default as { fetch(request: Request): Response | Promise<Response> }
const headers = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
}
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, idleTimeout: 40, async fetch(request) {
  const u = new URL(request.url), path = u.pathname + u.search
  if (request.method !== "GET" || !screenLocalPath(path, options)) return new Response("Read-only screenshot route", { status: 405, headers })
  let response: Response
  if (u.pathname.startsWith("/assets/")) {
    const file = Bun.file(join(root, "apps/web/dist/client", u.pathname))
    response = await file.exists() ? new Response(file) : new Response("Missing asset", { status: 404 })
  } else response = await handler.fetch(request)
  const copy = new Headers(response.headers)
  for (const [name, value] of Object.entries(headers)) copy.set(name, value)
  return new Response(response.body, { status: response.status, headers: copy })
}})
const parent = process.ppid
let closing = false
async function close() {
  if (closing) return
  closing = true; clearTimeout(fuse); clearInterval(watch)
  await server.stop(true)
  console.log(JSON.stringify({ event: "screen-server-stopped", reads, refused }))
  process.exit(0)
}
const fuse = setTimeout(() => { void close() }, 330000)
const watch = setInterval(() => { if (process.ppid !== parent) void close() }, 500)
process.once("SIGINT", () => { void close() }); process.once("SIGTERM", () => { void close() })
console.log(JSON.stringify({ event: "screen-server-ready", origin: server.url.origin, pid: process.pid }))

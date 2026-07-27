/**
 * Production entry for `apps/web`.
 *
 * TanStack Start's Vite build emits `dist/server/server.js` with a default export shaped
 * `{ fetch(request): Response }` — the Web-standard handler shape, which is also exactly
 * what `Bun.serve` wants. So this service needs no Nitro preset and no Node adapter, and it
 * runs on the same `oven/bun` base image as the hub. One runtime for both services, which
 * is what `CLAUDE.md` asks for and one less way for a deploy to diverge from local.
 *
 * Vite does not emit anything that serves the client bundle, because that is normally the
 * deploy platform's job. Here it is these twenty lines: try the static asset first, fall
 * through to the SSR handler.
 */
import { existsSync, statSync } from "node:fs"
import { join, normalize } from "node:path"
import handler from "./dist/server/server.js"

const PORT = Number(process.env["PORT"] ?? 3000)
const CLIENT = join(import.meta.dir, "dist", "client")

/**
 * Resolve a URL path inside the client bundle, or `null`.
 *
 * The `startsWith` check is the path-traversal guard: `normalize` collapses `..` segments,
 * so a request for `/assets/../../../etc/passwd` resolves outside CLIENT and is rejected
 * here rather than read off disk.
 */
const staticFile = (pathname: string): string | null => {
  const resolved = normalize(join(CLIENT, decodeURIComponent(pathname)))
  if (!resolved.startsWith(CLIENT)) return null
  if (!existsSync(resolved) || !statSync(resolved).isFile()) return null
  return resolved
}

Bun.serve({
  port: PORT,
  idleTimeout: 60,
  fetch: async (request) => {
    const { pathname } = new URL(request.url)
    const file = pathname === "/" ? null : staticFile(pathname)
    if (file !== null) {
      return new Response(Bun.file(file), {
        headers: {
          // Vite content-hashes every asset filename, so a hashed path can be cached
          // permanently and anything else must not be.
          "cache-control": pathname.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : "public, max-age=0, must-revalidate"
        }
      })
    }
    return await handler.fetch(request)
  }
})

console.log(`[web] ARCADE web listening on :${PORT}`)

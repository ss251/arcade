// Explicit owned local fixture only. No production server, keys, payment or external IO.
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
const entry = fileURLToPath(new URL("./confirm-browser.tsx", import.meta.url))
const built = await Bun.build({ entrypoints: [entry], target: "browser", minify: false,
  plugins: [{ name: "fixture-raw-svg", setup(build) {
    build.onResolve({ filter: /\.svg\?raw$/ }, args => ({ path: resolve(dirname(args.importer), args.path.slice(0, -4)), namespace: "raw-svg" }))
    build.onLoad({ filter: /.*/, namespace: "raw-svg" }, async args => ({
      contents: "export default " + JSON.stringify(await Bun.file(args.path).text()), loader: "js"
    }))
  } }],
  define: { "process.env.NODE_ENV": JSON.stringify("development") } })
if (!built.success || built.outputs.length !== 1) throw Error("Fixture build unavailable")
const code = await built.outputs[0]!.text()
const css = await Bun.file(fileURLToPath(new URL("../../src/styles.css", import.meta.url))).text()
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
  const path = new URL(req.url).pathname
  const selected = req.method === "GET" ? path === "/" ? [html, "text/html"] : path === "/fixture.js"
    ? [code, "text/javascript"] : path === "/styles.css" ? [css, "text/css"] : undefined : undefined
  return new Response(selected?.[0] ?? "Not found", { status: selected ? 200 : 404, headers: {
    "content-type": selected?.[1] ?? "text/plain", "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  } })
} })
const parent = process.ppid
const stop = () => { clearTimeout(fuse); clearInterval(watch); server.stop(true); process.exit(0) }
const fuse = setTimeout(stop, 180000), watch = setInterval(() => { if (process.ppid !== parent) stop() }, 500)
process.once("SIGTERM", stop); process.once("SIGINT", stop)
console.log("[confirm-origin] " + JSON.stringify({ web: server.url.origin, hub: server.url.origin }))

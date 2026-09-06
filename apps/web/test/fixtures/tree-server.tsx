import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import type { Socket } from "node:net"
import { renderToStaticMarkup } from "react-dom/server"
import { TreeGraph } from "../../src/components/tree-graph.tsx"
import type { TreeNode, TreeView } from "../../src/lib/hub-decode.ts"

/** Dedicated synthetic visual surface, not a hub route or an evidence generator. */
export const TREE_FIXTURE_CASES = Object.freeze([
  "normal", "wide", "deep", "long", "incomplete", "single", "empty"
] as const)
export type TreeFixtureCase = typeof TREE_FIXTURE_CASES[number]

const ROOT_ID = "job_synthetic000000000000"
const DIGEST = `0x${"12".repeat(32)}`
const rootTx = `0x${"ab".repeat(32)}`, childTx = `0x${"cd".repeat(32)}`
const explorer = (tx: string) => `https://testnet.arcscan.app/tx/${tx}`
const unavailable = "Tree fixture unavailable.\n"
const caseLabels: Readonly<Record<TreeFixtureCase, string>> = Object.freeze({
  normal: "Complete · 3 nodes", wide: "Wide · 12 siblings", deep: "Deep · 16 edges",
  long: "Maximum-length labels", incomplete: "Incomplete · reservation unresolved",
  single: "Single recorded root", empty: "Empty view fallback"
})

const node = (nodeId: string, patch: Partial<TreeNode> = {}): TreeNode => Object.freeze({
  nodeId, parentNodeId: nodeId === "0" ? null : nodeId.slice(0, nodeId.lastIndexOf(".")),
  hop: nodeId.split(".").length - 1, skillId: "synthetic-probe", priceAtomic: "10000",
  price: "$0.01", settled: true, reason: "ok", latencyMs: 1, explorer: null, ...patch
})

/** Pure typed fixtures. All identity, money, references and outcomes are synthetic. */
export const treeFixtureView = (name: TreeFixtureCase): TreeView => {
  const root = node("0", { skillId: "synthetic-root", priceAtomic: "150000", price: "$0.15",
    settleTx: rootTx, explorer: explorer(rootTx) })
  const child = node("0.0", { skillId: "synthetic-settled-child", priceAtomic: "50000", price: "$0.05",
    settleTx: childTx, explorer: explorer(childTx) })
  const refused = node("0.1", { skillId: "synthetic-unsettled-child", settled: false,
    reason: "output did not validate" })
  let nodes: ReadonlyArray<TreeNode>
  switch (name) {
    case "normal": nodes = [root, child, refused]; break
    case "wide": nodes = [root, ...Array.from({ length: 12 }, (_, i) => node(`0.${i}`, {
      skillId: `synthetic-sibling-${i}`, settled: i % 4 !== 3,
      reason: i % 4 === 3 ? "output did not validate" : "ok"
    }))]; break
    case "deep": nodes = Array.from({ length: 17 }, (_, i) => node(`0${".0".repeat(i)}`, {
      skillId: `synthetic-depth-${i}`
    })); break
    case "long": {
      const amount = (1n << 256n) - 1n
      const price = `$${amount / 1_000_000n}.${(amount % 1_000_000n).toString().padStart(6, "0")}`
      nodes = [root, child, node("0.1", { skillId: `synthetic-${"long-label-".repeat(6)}`.slice(0, 64),
        priceAtomic: amount.toString(), price, settled: false,
        reason: (`Synthetic refusal — ${"unbroken-reason".repeat(90)}`).slice(0, 1024) })]
      break
    }
    case "incomplete": nodes = [root, node("0.0", { skillId: "synthetic-unresolved-reservation",
      settled: false, reason: "job status is queued" })]; break
    case "single": nodes = [root]; break
    case "empty": nodes = []; break
    default: throw new Error(unavailable.trim())
  }
  const partial = name === "incomplete" || name === "empty"
  const committed = name === "single" ? "$0.00" : name === "wide" ? "$0.09" : name === "deep" ? "$0.16" : "$0.05"
  // Deliberately omit unknown digest/budget fields on incomplete and empty views.
  return Object.freeze({ rootJobId: ROOT_ID, nodes: Object.freeze(nodes), complete: !partial,
    evidenceFlags: Object.freeze(partial ? ["receipt-missing", "reservation-unresolved"] as const : []),
    ...(partial ? {} : { treeHash: DIGEST, committed, ceiling: name === "single" ? "$0.00" : "$0.20" }) })
}

/** No CSS/file read, timer, listener, environment lookup or output occurs on import. */
export const renderTreeFixture = (name: TreeFixtureCase): string => {
  const view = treeFixtureView(name)
  return "<!doctype html>" + renderToStaticMarkup(
    <html lang="en"><head><meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>H7 synthetic receipt-tree fixture</title><link rel="stylesheet" href="/styles.css" />
    </head><body><main className="wrap market">
      <h1 className="market-title">Synthetic receipt-tree fixture</h1>
      <p className="market-provenance">Offline visual data only — no hub, wallet, payment or mined evidence.
        Dummy transaction links exist for keyboard focus checks only; do not follow them.</p>
      <nav aria-label="Synthetic tree fixture cases">
        <ul style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", listStyle: "none", padding: 0 }}>
          {TREE_FIXTURE_CASES.map(item => <li key={item}><a href={`/?case=${item}`}
            aria-current={name === item ? "page" : undefined}>{caseLabels[item]}</a></li>)}
        </ul>
      </nav>
      <h2>{caseLabels[name]}</h2>
      <TreeGraph view={view} />
    </main></body></html>
  )
}

/** Entry-only owner. The process stays alive at most ten minutes plus two seconds of cleanup. */
const run = async (): Promise<number> => {
  if (process.argv.length !== 2) return 1
  // Read actual current CSS at process start; no Vite, generated page or copied tree CSS.
  const css = readFileSync(new URL("../../src/styles.css", import.meta.url))
  if (css.byteLength === 0 || css.byteLength > 262_144) return 1
  const pages = new Map(TREE_FIXTURE_CASES.map(name => [name, renderTreeFixture(name)]))
  if ([...pages.values()].some(page => Buffer.byteLength(page) > 131_072)) return 1
  const sockets = new Set<Socket>(), parentPid = process.ppid
  let closing = false, finished = false, exitCode = 0
  let finish!: (code: number) => void
  const stopped = new Promise<number>(resolve => { finish = resolve })
  const server = createServer({ maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 5000 }, (req, res) => {
    res.setHeader("cache-control", "no-store")
    res.setHeader("referrer-policy", "no-referrer")
    res.setHeader("x-content-type-options", "nosniff")
    res.setHeader("content-security-policy", "default-src 'none'; style-src 'self' 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
    const route = req.url ?? ""
    if (!closing && req.method === "GET" && route === "/styles.css") {
      res.writeHead(200, { "content-type": "text/css; charset=utf-8", "content-length": css.byteLength })
      res.end(css); return
    }
    const selected = route === "/" ? "normal" : /^\/\?case=(normal|wide|deep|long|incomplete|single|empty)$/.exec(route)?.[1]
    if (!closing && req.method === "GET" && selected !== undefined) {
      const html = pages.get(selected as TreeFixtureCase)
      if (html !== undefined) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(html) })
        res.end(html); return
      }
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "content-length": Buffer.byteLength(unavailable) })
    res.end(unavailable)
  })
  server.maxConnections = 16
  server.maxRequestsPerSocket = 16
  server.keepAliveTimeout = 1000
  server.on("connection", socket => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
    if (closing) socket.destroy()
  })
  const done = (code: number) => {
    if (finished) return
    finished = true; finish(code)
  }
  let closeFuse: ReturnType<typeof setTimeout> | undefined
  const closeListener = () => {
    server.close(error => done(error ? 1 : exitCode))
    server.closeAllConnections()
    for (const socket of sockets) socket.destroy()
  }
  const stop = (code: number) => {
    if (closing) return
    closing = true; exitCode = code
    closeFuse = setTimeout(() => done(1), 2000)
    if (server.listening) closeListener()
  }
  const term = () => stop(0), error = () => stop(1)
  process.once("SIGTERM", term); process.once("SIGINT", term)
  process.stdout.on("error", error)
  server.on("error", error)
  const deadline = setTimeout(() => stop(1), 600_000)
  const parentGuard = setInterval(() => { if (process.ppid !== parentPid) stop(1) }, 250)
  try {
    server.listen(0, "127.0.0.1", () => {
      if (closing) { closeListener(); return }
      const bound = server.address()
      if (bound === null || typeof bound === "string") { stop(1); return }
      process.stdout.write(`[h7-tree-fixture] ${JSON.stringify({ event: "ready", origin: `http://127.0.0.1:${bound.port}`,
        pid: process.pid, cases: TREE_FIXTURE_CASES })}\n`)
    })
    return await stopped
  } finally {
    clearTimeout(deadline); clearInterval(parentGuard)
    if (closeFuse !== undefined) clearTimeout(closeFuse)
    process.removeListener("SIGTERM", term); process.removeListener("SIGINT", term)
    process.stdout.removeListener("error", error)
    for (const socket of sockets) socket.destroy()
  }
}

if ((import.meta as ImportMeta & { readonly main?: boolean }).main === true) {
  void run().then(code => {
    if (code !== 0) process.stderr.write(unavailable)
    process.exit(code)
  }, () => { process.stderr.write(unavailable); process.exit(1) })
}

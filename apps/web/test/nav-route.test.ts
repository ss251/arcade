import { spawn } from "node:child_process"
import { expect, it } from "vitest"

it("serves chat at /chat while / is only the H6 shell, with keyless facts and original API endpoints", async () => {
  const child = spawn("bun", ["--no-env-file", "apps/web/test/fixtures/nav-server.ts"], {
    cwd: new URL("../../..", import.meta.url).pathname,
    env: { PATH: process.env["PATH"] ?? "", ARCADE_NETWORK: "arc-testnet", ARCADE_HUB: "http://127.0.0.1:9" },
    stdio: ["ignore", "pipe", "pipe"]
  })
  let output = "", origin = "", closed = false
  const exited = new Promise<void>((resolve, reject) => { child.once("close", () => { closed = true; resolve() }); child.once("error", reject) })
  const capture = (part: Buffer) => { output = (output + part.toString()).slice(-32768); origin = /\[h5-origin\] (http:\/\/127\.0\.0\.1:\d+)/.exec(output)?.[1] ?? origin }
  child.stdout.on("data", capture); child.stderr.on("data", capture)
  async function wait(p: Promise<unknown>, ms: number) { let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([p, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Owned fixture deadline")), ms) })]) }
    finally { if (timer) clearTimeout(timer) }
  }
  try {
    await wait((async () => { while (!origin && !closed) await new Promise(r => setTimeout(r, 20)); if (!origin) throw Error("Owned fixture did not start") })(), 10000)
    const get = (path: string) => fetch(origin + path, { signal: AbortSignal.timeout(15000), redirect: "error", credentials: "omit" })
    const chat = await get("/chat"), chatHtml = await chat.text()
    expect(chat.status).toBe(200)
    expect(chatHtml).toContain('aria-current="page"')
    expect(chatHtml).toContain("settlement receipts")
    expect(chatHtml).toContain("not live")
    expect(chatHtml).toContain('aria-label="Show conversations"')
    const market = await get("/"), marketHtml = await market.text()
    expect(market.status).toBe(200); expect(marketHtml).toContain('aria-label="Sections"')
    expect(marketHtml).not.toContain('class="composer"'); expect(marketHtml).not.toContain("settlement receipts")
    const invalid = await get("/seller"); expect(invalid.status).toBe(404)
    const api = await fetch(origin + "/api/chat", { method: "POST", body: "{}", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(3000) })
    expect(api.status).toBe(503)
  } finally {
    if (!closed) child.kill("SIGTERM")
    try { await wait(exited, 1500) } catch { if (!closed) child.kill("SIGKILL"); await wait(exited, 1500) }
    expect(closed).toBe(true)
    if (origin) await expect(fetch(origin, { signal: AbortSignal.timeout(500) })).rejects.toThrow()
  }
}, 40000)

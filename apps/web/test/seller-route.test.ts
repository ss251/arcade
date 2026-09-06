import { spawn } from "node:child_process"
import { expect, it } from "vitest"
import { SELLER } from "./fixtures/seller-data.ts"

it("serves actual seller Start selection, partial costs and fixed unavailable states", async () => {
  const child = spawn("bun", ["--no-env-file", "apps/web/test/fixtures/seller-server.ts"], {
    cwd: new URL("../../..", import.meta.url).pathname, env: { PATH: process.env["PATH"] ?? "", ARCADE_NETWORK: "arc-testnet" }, stdio: ["ignore", "pipe", "pipe"]
  })
  let output = "", origins: { web: string; hub: string } | undefined, closed = false
  const exited = new Promise<void>((resolve, reject) => { child.once("close", () => { closed = true; resolve() }); child.once("error", reject) })
  const capture = (part: Buffer) => { output = (output + part.toString()).slice(-32768)
    const found = /\[seller-origins\] (\{[^\n]+\})/.exec(output)?.[1]; if (found) origins = JSON.parse(found) }
  child.stdout.on("data", capture); child.stderr.on("data", capture)
  async function wait(p: Promise<unknown>, ms: number) { let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([p, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Owned fixture deadline")), ms) })]) }
    finally { clearTimeout(timer) } }
  const get = async (url: string) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "manual" })
    if (response.status < 300 || response.status >= 400) return response
    // Start canonicalizes the missing search field to address="". Follow only one
    // exact owned-origin/path redirect; this is not permission for external I/O.
    const destination = new URL(response.headers.get("location") ?? "", url), initial = new URL(url)
    expect(destination.origin).toBe(initial.origin); expect(destination.pathname).toBe(initial.pathname)
    expect(destination.searchParams.get("address")).toBe("")
    expect(initial.search).toBe("")
    return fetch(destination, { signal: AbortSignal.timeout(15000), redirect: "error" })
  }
  try {
    await wait((async () => { while (!origins && !closed) await new Promise(r => setTimeout(r, 20)); if (!origins) throw Error("Fixture unavailable") })(), 10000)
    for (const [query, text] of [["", "Enter a public seller address"], ["?address=invalid", "Invalid seller address"]]) {
      const response = await get(origins!.web + "/seller" + query); expect(response.status).toBe(200)
      expect(await response.text()).toContain(text)
      expect((await (await get(origins!.hub + "/__seller-fixture")).json()).reads).toBe(0)
    }
    for (const [mode, text] of [["normal", "$0.084"], ["unknown-cost", "partial"], ["unknown-spend", "partial"], ["negative", "-$0.386"],
      ["historical", "No current listings"], ["empty", "No recorded settlements"], ["fail", "Seller summary unavailable"], ["wrong-seller", "Seller summary unavailable"]]) {
      await get(origins!.hub + "/__seller-fixture?mode=" + mode)
      const response = await get(origins!.web + "/seller?address=" + SELLER); expect(response.status).toBe(200)
      const html = await response.text(); expect(html).toContain(text); expect(html).not.toContain("PRIVATE_")
      const stats = await (await get(origins!.hub + "/__seller-fixture")).json(); expect(stats.reads).toBe(1); expect(stats.other).toBe(0)
    }
  } finally {
    if (!closed) child.kill("SIGTERM")
    try { await wait(exited, 1500) } catch { if (!closed) child.kill("SIGKILL"); await wait(exited, 1500) }
    expect(closed).toBe(true)
    if (origins) for (const origin of Object.values(origins)) await expect(fetch(origin, { signal: AbortSignal.timeout(500) })).rejects.toThrow()
  }
}, 40000)

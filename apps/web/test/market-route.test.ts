import { spawn } from "node:child_process"
import { expect, it } from "vitest"

it("renders actual H4-decoded catalogue data and independent failure states through the production Start route", async () => {
  const child = spawn("bun", ["--no-env-file", "apps/web/test/fixtures/market-server.ts"], {
    cwd: new URL("../../..", import.meta.url).pathname,
    env: { PATH: process.env["PATH"] ?? "", ARCADE_NETWORK: "arc-testnet" }, stdio: ["ignore", "pipe", "pipe"]
  })
  let output = "", origins: { web: string; hub: string } | undefined, closed = false
  const exited = new Promise<void>((resolve, reject) => { child.once("close", () => { closed = true; resolve() }); child.once("error", reject) })
  const capture = (part: Buffer) => { output = (output + part.toString()).slice(-32768)
    const found = /\[h6-origins\] (\{[^\n]+\})/.exec(output)?.[1]; if (found) origins = JSON.parse(found) }
  child.stdout.on("data", capture); child.stderr.on("data", capture)
  async function wait(p: Promise<unknown>, ms: number) { let t: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([p, new Promise((_, reject) => { t = setTimeout(() => reject(Error("Owned fixture deadline")), ms) })]) }
    finally { clearTimeout(t) } }
  const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(15000), redirect: "error", credentials: "omit" })
  try {
    await wait((async () => { while (!origins && !closed) await new Promise(r => setTimeout(r, 20)); if (!origins) throw Error("Fixture did not start") })(), 10000)
    const read = async (mode: string) => {
      await get(`${origins!.hub}/__fixture?mode=${mode}`)
      const response = await get(origins!.web + "/"); expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).not.toContain("PRIVATE_")
      const control = await (await get(origins!.hub + "/__fixture")).json()
      expect(control.reads).toEqual({ listings: 1, stats: 1, other: 0 })
      return html
    }
    const ok = await read("ok")
    expect(ok).toContain("Diff Triage"); expect(ok).toContain("$1.24"); expect(ok).toContain("hub receipts")
    expect(ok).toContain("pay-tested"); expect(ok).toContain("recorded settled volume")
    expect(ok).toContain("Accepted rails unavailable")
    const rails = await read("rails")
    expect(rails).toContain("Accepts (declared): gateway · exact · escrow")
    expect(rails).toContain("Accepts (declared): exact")
    expect(rails).toContain("Accepted rails unavailable")
    expect(rails.replaceAll("<!-- -->", "")).toContain("3 of 3 catalogue listings shown")
    expect(rails).toContain("not current payment availability")
    for (const mode of ["stats-down", "malformed-stats"]) {
      const html = await read(mode); expect(html).toContain("Diff Triage"); expect(html).toContain("Totals are unavailable")
      expect(html).not.toContain("$0.00")
    }
    for (const mode of ["listings-down", "malformed-listings"]) {
      const html = await read(mode); expect(html).toContain("Listings are unavailable"); expect(html).toContain("$1.24")
      expect(html).not.toContain("No eligible listings")
    }
    const both = await read("both-down"); expect(both).toContain("Listings are unavailable"); expect(both).toContain("Totals are unavailable")
    const empty = await read("empty"); expect(empty).toContain("No eligible listings"); expect(empty).toContain("$0.00")
    expect(empty).not.toContain("nobody is currently serving")
  } finally {
    if (!closed) child.kill("SIGTERM")
    try { await wait(exited, 1500) } catch { if (!closed) child.kill("SIGKILL"); await wait(exited, 1500) }
    expect(closed).toBe(true)
    if (origins) for (const origin of Object.values(origins)) await expect(fetch(origin, { signal: AbortSignal.timeout(500) })).rejects.toThrow()
  }
}, 40000)

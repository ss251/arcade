import { spawn } from "node:child_process"
import { expect, it } from "vitest"

it("serves the actual buyer Start route without a hub read or browser capability", async () => {
  // Reuse the owned keyless Start fixture; it fails any non-loopback server fetch.
  const child = spawn("bun", ["--no-env-file", "apps/web/test/fixtures/market-server.ts"], {
    cwd: new URL("../../..", import.meta.url).pathname,
    env: { PATH: process.env["PATH"] ?? "", ARCADE_NETWORK: "arc-testnet" }, stdio: ["ignore", "pipe", "pipe"]
  })
  let output = "", origins: { web: string; hub: string } | undefined, closed = false
  const exited = new Promise<void>((resolve, reject) => { child.once("close", () => { closed = true; resolve() }); child.once("error", reject) })
  const capture = (part: Buffer) => { output = (output + part.toString()).slice(-32768)
    const found = /\[h6-origins\] (\{[^\n]+\})/.exec(output)?.[1]; if (found) origins = JSON.parse(found) }
  child.stdout.on("data", capture); child.stderr.on("data", capture)
  async function wait(p: Promise<unknown>, ms: number) { let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([p, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Owned fixture deadline")), ms) })]) }
    finally { clearTimeout(timer) } }
  try {
    await wait((async () => { while (!origins && !closed) await new Promise(r => setTimeout(r, 20)); if (!origins) throw Error("Fixture unavailable") })(), 10000)
    const response = await fetch(origins!.web + "/buyer", { signal: AbortSignal.timeout(15000), redirect: "error" })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain("What this browser can recover."); expect(html).toContain("Loading saved access on this browser")
    expect(html).not.toMatch(/job_token|x-job-token|PRIVATE_|No saved jobs/)
    const stats = await (await fetch(origins!.hub + "/__fixture", { signal: AbortSignal.timeout(1000) })).json()
    expect(stats.reads).toEqual({ listings: 0, stats: 0, other: 0 })
  } finally {
    if (!closed) child.kill("SIGTERM")
    try { await wait(exited, 1500) } catch { if (!closed) child.kill("SIGKILL"); await wait(exited, 1500) }
    expect(closed).toBe(true)
    if (origins) for (const origin of Object.values(origins)) await expect(fetch(origin, { signal: AbortSignal.timeout(500) })).rejects.toThrow()
  }
}, 30000)

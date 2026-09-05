import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
const root = fileURLToPath(new URL("../../..", import.meta.url))
it("only reads the requested detail identity, rechecking ownership and withholding unavailable counts", async () => {
  const child = spawn("bun", ["run", "--preload", "./apps/hub/test/fixtures/listing-evidence-http-preload.ts", "apps/hub/src/server.ts"], {
    cwd: root, env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "gateway",
      ARCADE_CHAIN_CHECK: "0", ARCADE_HUB_SECRET: "offline-identity-only" }
  })
  let output = "", base = ""
  const capture = (part: Buffer) => { output = (output + String(part)).slice(-100_000)
    const port = /\[identity-http-port\] (\d+)/.exec(output)?.[1]; if (port) base = `http://127.0.0.1:${port}` }
  child.stdout.on("data", capture); child.stderr.on("data", capture)
  try {
    const until = Date.now() + 5000
    while (!base && Date.now() < until && child.exitCode === null) await new Promise(resolve => setTimeout(resolve, 10))
    if (!base) throw new Error(`offline identity hub failed: ${output}`)
    const get = (path: string) => fetch(base + path, { signal: AbortSignal.timeout(5000) })
    for (const path of ["/", "/_feed", "/listings"]) expect((await get(path)).status).toBe(200)
    expect((await get("/skill/no-such-skill")).status).toBe(404)
    expect(output).not.toMatch(/\[owner-read\]|\[evidence-read\]/)
    for (const [id, hasCounts] of [["fresh", true], ["transferred", false], ["stale", false], ["unreadable", false], ["unverified", true]] as const) {
      const response = await get(`/skill/evidence-${id}`), html = await response.text()
      expect(response.status).toBe(200); expect(html).toContain("On-chain identity")
      expect(html.includes("7 of 8")).toBe(hasCounts)
      expect(html).toContain("registration (announced)")
      if (!hasCounts) expect(html).toMatch(/withheld|unverified/)
      expect(html).not.toMatch(/PRIVATE_RPC|PRIVATE_SERVICE/)
    }
    expect(await (await get("/skill/evidence-missing")).text()).not.toContain("On-chain identity")
    // Give stdout its own event turn before checking independent process markers.
    await new Promise(resolve => setTimeout(resolve, 20))
    const owners = output.match(/\[owner-read\] \d+/g) ?? [], reads = output.match(/\[evidence-read\] \d+/g) ?? []
    expect(owners).toEqual(["[owner-read] 1", "[owner-read] 2", "[owner-read] 3", "[owner-read] 4", "[owner-read] 5"])
    expect(reads).toEqual(["[evidence-read] 1", "[evidence-read] 3", "[evidence-read] 5"])
    expect(output).not.toMatch(/PRIVATE_RPC|PRIVATE_SERVICE/)
  } finally {
    if (child.exitCode === null && child.signalCode === null) await new Promise<void>(resolve => {
      const timer = setTimeout(() => child.kill("SIGKILL"), 1500)
      child.once("close", () => { clearTimeout(timer); resolve() }); child.kill("SIGTERM")
    })
  }
}, 15_000)

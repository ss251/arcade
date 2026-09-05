import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { keccak256, toHex } from "viem"
const root = fileURLToPath(new URL("../../..", import.meta.url))
const withHub = async (db: string, seed: boolean, check: (base: string, output: string) => Promise<void>) => {
  const child = spawn("bun", ["run", "--preload", "./apps/hub/test/fixtures/erc8004-docs-http-preload.ts", "apps/hub/src/server.ts"], {
    cwd: root, env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_RAIL: "test", ARCADE_NETWORK: "arc-testnet",
      ARCADE_DB: db, TEST_SEED_DOCS: seed ? "1" : "0", ARCADE_HUB_SECRET: "offline-docs-only" }
  })
  let output = "", base = ""
  const capture = (part: Buffer) => { output = (output + String(part)).slice(-100_000)
    const port = /\[docs-http-port\] (\d+)/.exec(output)?.[1]; if (port) base = `http://127.0.0.1:${port}` }
  child.stdout.on("data", capture); child.stderr.on("data", capture)
  try {
    const until = Date.now() + 5000
    while (!base && Date.now() < until && child.exitCode === null) await new Promise(resolve => setTimeout(resolve, 10))
    if (!base) throw new Error(`offline document hub failed: ${output}`)
    await check(base, output)
    expect(output).not.toMatch(/INPUT_PRIVATE|OUTPUT_PRIVATE|PRIVATE_REASON/)
  } finally {
    if (child.exitCode === null && child.signalCode === null) await new Promise<void>(resolve => {
      const timer = setTimeout(() => child.kill("SIGKILL"), 1500)
      child.once("close", () => { clearTimeout(timer); resolve() }); child.kill("SIGTERM")
    })
  }
}
it("serves exact public committed bytes after restart without a listing, runner, or signing service", async () => {
  const directory = mkdtempSync(join(tmpdir(), "arcade-docs-http-")), db = join(directory, "hub.sqlite")
  const saved = new Map<string, string>(), commitments = new Map<string, { hash: string; length: number }>()
  try {
    for (const seed of [true, false]) await withHub(db, seed, async (base, output) => {
      const get = (path: string) => fetch(base + path, { signal: AbortSignal.timeout(3000) })
      expect(await (await get("/runners")).json()).toEqual([])
      expect(await (await get("/listings")).json()).toEqual([])
      expect((await (await get("/erc8004")).json()).armed).toBe(false)
      if (seed) for (const line of output.split("\n").filter(line => line.startsWith("[stored-document] "))) {
        const entry = JSON.parse(line.slice(18)); commitments.set(entry.kind, entry)
      }
      for (const kind of ["validation-request", "validation-response", "feedback"]) {
        const response = await get(`/receipts/job_http_documents/${kind}.json`)
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("application/json")
        expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
        const bytes = await response.text()
        expect(bytes).not.toMatch(/INPUT_PRIVATE|OUTPUT_PRIVATE|PRIVATE_REASON/)
        expect(keccak256(toHex(bytes))).toBe(commitments.get(kind)?.hash)
        expect(Buffer.byteLength(bytes)).toBe(commitments.get(kind)?.length)
        if (seed) saved.set(kind, bytes); else expect(bytes).toBe(saved.get(kind))
      }
      expect(await (await get("/receipts/job_whitespace/feedback.json")).text()).toBe('{ "unicode": "é", "value": 1 }\n')
      for (const path of ["/receipts/job_missing/feedback.json", "/receipts/job_http_documents/unknown.json", "/receipts/job_http_documents/input.json"]) {
        expect((await get(path)).status).toBe(404)
      }
    })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 20_000)

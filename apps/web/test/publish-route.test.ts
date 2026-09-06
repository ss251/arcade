import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { parsePreview } from "../src/lib/publish-preview.ts"

it("actual Start routes keep default mode passive and run only explicit local preview POSTs", async () => {
  const root = new URL("../../..", import.meta.url).pathname
  const before = readFileSync(root + "/skills/diff-triage/arcade.json")
  for (const mode of ["default", "local"]) {
    const child = spawn("bun", ["--no-env-file", "--no-install", "apps/web/test/fixtures/publish-server.ts", mode], {
      cwd: root, env: { PATH: process.env["PATH"] ?? "", ARCADE_NETWORK: "arc-testnet" }, stdio: ["ignore", "pipe", "pipe"]
    })
    let output = "", origin = "", closed = false
    const exited = new Promise<void>((resolve, reject) => { child.once("close", () => { closed = true; resolve() }); child.once("error", reject) })
    const capture = (data: Buffer) => {
      output = (output + data.toString()).slice(-32768)
      origin = /\[publish-origin\] (http:\/\/127\.0\.0\.1:\d+)/.exec(output)?.[1] ?? origin
    }
    child.stdout.on("data", capture); child.stderr.on("data", capture)
    const wait = async (promise: Promise<unknown>, ms: number) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try { await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Owned publish fixture deadline")), ms) })]) }
      finally { clearTimeout(timer) }
    }
    try {
      await wait((async () => { while (!origin && !closed) await new Promise(r => setTimeout(r, 20)); if (!origin) throw Error("Owned fixture unavailable") })(), 12000)
      const response = await fetch(origin + "/publish", { signal: AbortSignal.timeout(15000), redirect: "error" })
      expect(response.status, output).toBe(200)
      const html = await response.text()
      if (mode === "default") { expect(html).toContain("Publishing runs locally"); expect(html).not.toContain('id="publish-target"') }
      else expect(html).toContain('id="publish-target"')
      const post = (target: string, selectedOrigin = origin) => fetch(origin + "/api/publish-preview", {
        method: "POST", headers: { "content-type": "application/json", origin: selectedOrigin }, body: JSON.stringify({ target }),
        signal: AbortSignal.timeout(15000), redirect: "error"
      })
      const blocked = await post("skills/diff-triage", "https://other.example")
      expect(blocked.status).toBe(403); expect(await blocked.text()).toBe('{"error":"preview_disabled"}')
      const preview = await post("skills/diff-triage")
      expect(preview.headers.get("cache-control")).toContain("no-store")
      if (mode === "default") expect(preview.status).toBe(403)
      else {
        expect(preview.status).toBe(200)
        expect(parsePreview(await preview.text())).toMatchObject({ kind: "directory", target: "skills/diff-triage" })
        const api = await post("packages/runner/test/fixtures/frankfurter.json")
        expect(api.status).toBe(200)
        expect(parsePreview(await api.text())).toMatchObject({ kind: "generated", written: false, source: "openapi" })
        expect((await post("../private")).status).toBe(400)
      }
      expect(readFileSync(root + "/skills/diff-triage/arcade.json")).toEqual(before)
    } finally {
      if (!closed) child.kill("SIGTERM")
      try { await wait(exited, 1500) } catch { if (!closed) child.kill("SIGKILL"); await wait(exited, 1500) }
      expect(closed).toBe(true)
      if (origin) await expect(fetch(origin, { signal: AbortSignal.timeout(500) })).rejects.toThrow()
    }
  }
}, 45000)

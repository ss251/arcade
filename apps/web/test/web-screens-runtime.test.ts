import { afterEach, describe, expect, it } from "vitest"
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createServer } from "node:http"
import { connect } from "node:net"

const ROOT = new URL("../../..", import.meta.url).pathname, SELLER = "0x" + "3".repeat(40)
const owned: string[] = []
const fixture = () => {
  const dir = mkdtempSync(join(tmpdir(), "arcade-screens-test-")); owned.push(dir)
  for (const p of ["scripts", "apps/web/dist/server", "apps/web/dist/client/assets"]) mkdirSync(join(dir, p), { recursive: true })
  for (const file of ["web-screens.ts", "web-screens-server.ts", "web-screens-policy.ts"])
    writeFileSync(join(dir, "scripts", file), readFileSync(join(ROOT, "scripts", file)))
  // Exact runtime sources; substitute only the separately built SSR artifact.
  writeFileSync(join(dir, "apps/web/dist/server/server.js"),
    'if(process.env.OPENAI_API_KEY||process.env.ANTHROPIC_API_KEY||process.env.ARCADE_PUBLISH_LOCAL)throw Error("Inherited sensitive environment");\n' +
    'export default {async fetch(request){const r=await fetch(process.env.ARCADE_HUB+"/stats",{headers:{accept:"application/json"}});' +
    'return new Response("fixture SSR "+await r.text(),{headers:{"content-type":"text/html"}});}};')
  writeFileSync(join(dir, "apps/web/dist/client/assets/fixture.js"), "console.log('fixture')")
  return dir
}
const args = (hub: string, chrome = "/usr/bin/false") => ["--hub", hub, "--seller", SELLER, "--skill", "diff-triage", "--chrome", chrome]
const refused = (origin: string) => new Promise<boolean>(resolve => {
  const url = new URL(origin), socket = connect({ host: url.hostname, port: Number(url.port) })
  socket.setTimeout(700)
  socket.once("connect", () => { socket.destroy(); resolve(false) })
  socket.once("timeout", () => { socket.destroy(); resolve(false) })
  socket.once("error", e => { socket.destroy(); resolve("code" in e && e.code === "ECONNREFUSED") })
})
const stopChild = async (child: ChildProcessWithoutNullStreams) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill("SIGTERM")
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Child cleanup deadline")) }, 3000)
    child.once("exit", () => { clearTimeout(timer); resolve() })
  })
}
afterEach(() => { for (const dir of owned.splice(0)) rmSync(dir, { recursive: true, force: true }) })
describe("actual read-only screenshot runtime", () => {
  it("serves a real loopback socket, permits only selected GETs and stops owned listeners", async () => {
    const dir = fixture(), seen: { url: string | undefined; method: string | undefined; authorization: string | undefined; cookie: string | undefined }[] = []
    const hub = createServer((req, res) => {
      seen.push({ url: req.url, method: req.method, authorization: req.headers.authorization, cookie: req.headers.cookie })
      res.setHeader("content-type", "application/json"); res.end('{"fixture":true}')
    })
    await new Promise<void>(resolve => hub.listen(0, "127.0.0.1", resolve))
    const address = hub.address(); if (!address || typeof address === "string") throw Error("Fixture bind")
    const child = spawn("bun", ["--no-env-file", join(dir, "scripts/web-screens-server.ts"), ...args("http://127.0.0.1:" + address.port)],
      { cwd: dir, env: { PATH: process.env.PATH }, stdio: "pipe" })
    let origin = ""
    try {
      const ready = await new Promise<{ origin: string }>((resolve, reject) => {
        let carry = ""
        const timer = setTimeout(() => reject(Error("Ready deadline")), 7000)
        child.once("exit", () => { clearTimeout(timer); reject(Error("Early exit")) })
        child.stdout.on("data", data => {
          carry += data.toString()
          for (const line of carry.split("\n")) try {
            const value = JSON.parse(line)
            if (value.event === "screen-server-ready") { clearTimeout(timer); resolve(value) }
          } catch {}
        })
      })
      origin = ready.origin
      expect(new URL(origin).hostname).toBe("127.0.0.1")
      const first = await fetch(origin)
      expect(first.status).toBe(200); expect(await first.text()).toBe('fixture SSR {"fixture":true}')
      expect(first.headers.get("content-security-policy")).toContain("form-action 'none'")
      expect(first.headers.get("cache-control")).toBe("no-store")
      expect((await fetch(origin + "/assets/fixture.js")).status).toBe(200)
      for (const path of ["/api/chat", "/api/quote", "/api/publish-preview", "/_serverFn/private", "/jobs/private/result", "/buyer?token=fixture"])
        expect((await fetch(origin + path)).status).toBe(405)
      expect((await fetch(origin, { method: "POST", body: "{}" })).status).toBe(405)
      expect(seen).toEqual([{ url: "/stats", method: "GET", authorization: undefined, cookie: undefined }])
    } finally {
      await stopChild(child)
      hub.closeAllConnections(); await new Promise<void>(resolve => hub.close(() => resolve()))
    }
    expect(() => process.kill(child.pid!, 0)).toThrow()
    expect(await refused(origin)).toBe(true)
  })
  it("a failed Chrome start records failure and reaps the web, stripping inherited credentials", async () => {
    const dir = fixture(), chrome = join(dir, "fake-chrome")
    writeFileSync(chrome, '#!/bin/sh\n[ -z "$OPENAI_API_KEY$ANTHROPIC_API_KEY$ARCADE_PUBLISH_LOCAL" ] || exit 44\nexit 0\n', { mode: 0o700 })
    const result = spawnSync("bun", ["--no-env-file", join(dir, "scripts/web-screens.ts"), ...args("https://hub.example", chrome)], {
      cwd: dir, env: { PATH: process.env.PATH, TMPDIR: dir, OPENAI_API_KEY: "PUBLIC_ENV_CANARY", ANTHROPIC_API_KEY: "PUBLIC_ENV_CANARY", ARCADE_PUBLISH_LOCAL: "1" },
      encoding: "utf8", timeout: 15000, maxBuffer: 32768
    })
    expect(result.status).toBe(1)
    expect(result.stdout + result.stderr).not.toContain("PUBLIC_ENV_CANARY")
    const runs = readdirSync(dir).filter(p => p.startsWith("arcade-web-screens-"))
    expect(runs).toHaveLength(1)
    const manifest = JSON.parse(readFileSync(join(dir, runs[0]!, "capture.json"), "utf8"))
    expect(manifest).toMatchObject({ status: "failed", stage: "chrome", frames: [], humanReview: "pending" })
    expect(manifest.cleanup).toHaveLength(2)
    for (const child of manifest.cleanup) {
      expect(child.reaped).toBe(true); expect(child.exitCode).toBe(0)
      expect(() => process.kill(child.pid, 0)).toThrow()
    }
    expect(await refused(manifest.origin)).toBe(true)
    expect(readdirSync(join(dir, runs[0]!, "shots"))).toEqual([])
  })
})

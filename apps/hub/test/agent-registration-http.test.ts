import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { docBytes, docHash, loadChainConfig } from "@arcade/core"
import { keccak256, toHex } from "viem"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))
const stop = async (child: ChildProcessWithoutNullStreams) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 1500)
    child.once("close", () => { clearTimeout(timer); resolve() })
    child.kill("SIGTERM")
  })
}
const withHub = async (mode: string, check: (base: string) => Promise<void>) => {
  const child = spawn("bun", ["run", "--preload", "./apps/hub/test/fixtures/agent-registration-http-preload.ts", "apps/hub/src/server.ts"], {
    cwd: ROOT, env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_RAIL: "test", ARCADE_CHAIN_CHECK: "0",
      ARCADE_NETWORK: "arc-testnet", ARCADE_HUB_SECRET: "registration-http-only", TEST_ERC_MODE: mode,
      ARCADE_OPERATOR_KEY: "PRIVATE_INVALID_OPERATOR", ARCADE_VALIDATOR_KEY: "PRIVATE_INVALID_VALIDATOR",
      ARCADE_ATTESTER_KEY: "PRIVATE_INVALID_ATTESTER" }
  })
  let output = "", base = ""
  const record = (part: Buffer) => { output = (output + String(part)).slice(-65_536)
    const port = /\[registration-test-port\] (\d+)/.exec(output)?.[1]
    if (port !== undefined) base = `http://127.0.0.1:${port}` }
  child.stdout.on("data", record); child.stderr.on("data", record)
  try {
    const deadline = Date.now() + 10_000
    while (!base && child.exitCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
    if (!base) throw new Error(`registration fixture failed to boot: ${output}`)
    await check(base)
    expect(output).not.toMatch(/PRIVATE_/)
  } finally { await stop(child) }
}

describe("actual registration HTTP routes", () => {
  it("serves compact committed bytes and current liveness even with the ERC feature unarmed", async () => {
    await withHub("unarmed", async base => {
      const response = await fetch(`${base}/listings/metadata-live/agent-registration.json`)
      expect(response.status).toBe(200)
      const discovery = await fetch(`${base}/erc8004`)
      expect(discovery.status).toBe(200)
      expect(await discovery.json()).toEqual({ armed: false, chainId: 5042002, caip2: "eip155:5042002" })
      expect(response.headers.get("content-type")).toBe("application/json")
      expect(response.headers.get("cache-control")).toBe("public, max-age=30")
      const text = await response.text(), doc = JSON.parse(text)
      expect(text).toBe(docBytes(doc)); expect(keccak256(toHex(text))).toBe(docHash(doc))
      expect(doc.active).toBe(true); expect(doc.registrations[0].agentId).toBe("42")
      expect(doc.services[0].endpoint).toBe(`${base}/x/0x1111111111111111111111111111111111111111/metadata-live`)
      expect(doc.services.map((service: { name: string }) => service.name)).toEqual(["x402", "openapi", "web"])
      expect(text).not.toMatch(/PRIVATE|registrationTx|agentVerified|runnerId|payTest/)
      for (const id of ["metadata-delisted", "metadata-offline"]) {
        const inactive = await fetch(`${base}/listings/${id}/agent-registration.json`)
        expect(inactive.status).toBe(200); expect((await inactive.json()).active).toBe(false)
      }
      expect((await fetch(`${base}/listings`)).status).toBe(200)
      expect((await fetch(`${base}/listings/metadata-live`)).status).toBe(200)
      const missing = await fetch(`${base}/listings/missing/agent-registration.json`)
      expect(missing.status).toBe(404); expect(await missing.json()).toEqual({ error: "not_found" })
      expect((await fetch(`${base}/erc8004`, { method: "POST" })).status).toBe(404)
    })
  }, 15_000)
  it("exposes only the selected chain, registries, and public role addresses when armed", async () => {
    await withHub("armed", async base => {
      const response = await fetch(`${base}/erc8004`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ armed: true, chainId: 5042002, caip2: "eip155:5042002",
        registries: loadChainConfig("arc-testnet").erc8004,
        operator: "0x1111111111111111111111111111111111111111",
        validator: "0x2222222222222222222222222222222222222222",
        attester: "0x3333333333333333333333333333333333333333" })
    })
  }, 15_000)
  it("returns 404 for a known listing when the chain has no identity registry", async () => {
    await withHub("no-registry", async base => {
      const response = await fetch(`${base}/listings/metadata-live/agent-registration.json`)
      expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "not_found" })
      expect((await fetch(`${base}/healthz`)).status).toBe(200)
    })
  }, 15_000)
})

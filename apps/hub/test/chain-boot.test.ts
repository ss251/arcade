import { spawn } from "node:child_process"
import { createServer, type Server } from "node:http"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { encodeAbiParameters } from "viem"
import { afterEach, describe, expect, it } from "vitest"

const ROOT = new URL("../../..", import.meta.url).pathname
const KEY = `0x${"11".repeat(32)}` // Public fixture key, never funded or sent to an external RPC.
const servers: Server[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

const fakeRpc = async (chainId = 1) => {
  const calls: string[] = []
  const server = createServer(async (req, res) => {
    let body = ""
    for await (const chunk of req) body += String(chunk)
    const request = JSON.parse(body) as { id: number; method: string; params?: [{ data?: string }] }
    const selector = request.params?.[0]?.data?.slice(0, 10)
    calls.push(request.method === "eth_call" ? `${request.method}:${selector}` : request.method)
    let result: string = `0x${chainId.toString(16)}`
    if (request.method === "eth_call") {
      result = selector === "0x06fdde03" ? encodeAbiParameters([{ type: "string" }], ["USDC"])
        : selector === "0x54fd4d50" ? encodeAbiParameters([{ type: "string" }], ["2"])
          : encodeAbiParameters([{ type: "uint256" }], [selector === "0x313ce567" ? 6n : 1n])
    }
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, calls }
}

const boot = (env: Record<string, string | undefined>) => new Promise<{ output: string; exit: number | null; listening: boolean }>((resolve, reject) => {
  const child = spawn("bun", ["run", "apps/hub/src/server.ts"], {
    cwd: ROOT,
    env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "eip3009", ARCADE_FACILITATOR_KEY: KEY, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  })
  let output = ""
  let listening = false
  const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`hub startup timed out: ${output}`)) }, 12_000)
  const record = (chunk: Buffer) => {
    output += chunk.toString()
    if (output.includes("[hub] ARCADE listening")) { listening = true; child.kill("SIGTERM") }
  }
  child.stdout.on("data", record)
  child.stderr.on("data", record)
  child.on("error", (error) => { clearTimeout(timer); reject(error) })
  child.on("close", (exit) => { clearTimeout(timer); resolve({ output, exit, listening }) })
})

describe("chain checks at actual hub boot", () => {
  it("refuses pending mainnet before any RPC, even if checks are disabled", async () => {
    const rpc = await fakeRpc()
    const result = await boot({ ARCADE_NETWORK: "arc-mainnet", ARCADE_RPC_URL: rpc.url, ARCADE_CHAIN_CHECK: "0", ARCADE_RAIL: "test" })
    expect(result.exit).toBe(2)
    expect(result.output).toContain("pending")
    expect(result.listening).toBe(false)
    expect(rpc.calls).toEqual([])
  })

  it("warns on a laptop when the RPC chain differs, then starts", async () => {
    const rpc = await fakeRpc()
    const result = await boot({ ARCADE_RPC_URL: rpc.url, ARCADE_CHAIN_CHECK: "1" })
    expect(result.output).toContain("chainId")
    expect(result.listening).toBe(true)
    expect(rpc.calls).toContain("eth_chainId")
  })

  it("refuses a public hub on a chain mismatch before it starts serving", async () => {
    const rpc = await fakeRpc()
    const directory = mkdtempSync(join(tmpdir(), "arcade-chain-boot-"))
    directories.push(directory)
    const result = await boot({
      ARCADE_RPC_URL: rpc.url, ARCADE_CHAIN_CHECK: "1", ARCADE_PUBLIC_URL: "https://hub.test",
      ARCADE_HUB_SECRET: "test-secret", ARCADE_DB: join(directory, "hub.db"),
      RAILWAY_SERVICE_ID: "test", RAILWAY_VOLUME_MOUNT_PATH: directory
    })
    expect(result.exit).toBe(2)
    expect(result.output).toContain("chainId")
    expect(result.listening).toBe(false)
  })

  it("keeps the test rail offline", async () => {
    const rpc = await fakeRpc()
    const result = await boot({ ARCADE_RPC_URL: rpc.url, ARCADE_RAIL: "test" })
    expect(result.listening).toBe(true)
    expect(rpc.calls).toEqual([])
  })

  it("checks public Gateway metadata without requiring or generating a local facilitator", async () => {
    const rpc = await fakeRpc(5042002)
    const directory = mkdtempSync(join(tmpdir(), "arcade-gateway-boot-"))
    directories.push(directory)
    const result = await boot({
      ARCADE_RAIL: "gateway", ARCADE_FACILITATOR_KEY: undefined,
      ARCADE_RPC_URL: rpc.url, ARCADE_CHAIN_CHECK: "1", ARCADE_PUBLIC_URL: "https://hub.test",
      ARCADE_HUB_SECRET: "test-secret", ARCADE_DB: join(directory, "hub.db"),
      RAILWAY_SERVICE_ID: "test", RAILWAY_VOLUME_MOUNT_PATH: directory
    })
    expect(result.listening).toBe(true)
    expect(result.output).not.toContain("ephemeral facilitator")
    expect(rpc.calls).toContain("eth_chainId")
    expect(rpc.calls).not.toContain("eth_call:0x70a08231")
  })
})

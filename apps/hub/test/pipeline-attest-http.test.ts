import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { privateKeyToAccount } from "viem/accounts"
import { loadChainConfig } from "@arcade/core"
import { HEADER_PAYMENT_SIGNATURE, signAuthorization } from "@arcade/payments"

const root = fileURLToPath(new URL("../../..", import.meta.url))
const buyer = privateKeyToAccount(`0x${"1".repeat(64)}`) // Fixed unfunded simulation fixture.
const seller = `0x${"2".repeat(40)}`, payTo = `0x${"3".repeat(40)}`
const withHub = async (mode: string, check: (base: string, output: () => string) => Promise<void>) => {
  const child = spawn("bun", ["run", "--preload", "./apps/hub/test/fixtures/pipeline-attest-http-preload.ts", "apps/hub/src/server.ts"], {
    cwd: root, env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_NETWORK: "arc-testnet",
      ARCADE_RAIL: mode === "test" ? "test" : "gateway", ARCADE_CHAIN_CHECK: "0", TEST_ATTEST_MODE: mode,
      ARCADE_HUB_SECRET: "offline-attestation-only" }
  })
  let output = "", base = ""
  const capture = (part: Buffer) => { output = (output + String(part)).slice(-100_000)
    const port = /\[attest-http-port\] (\d+)/.exec(output)?.[1]; if (port) base = `http://127.0.0.1:${port}` }
  child.stdout.on("data", capture); child.stderr.on("data", capture)
  try {
    const until = Date.now() + 5000
    while (!base && Date.now() < until && child.exitCode === null) await new Promise(resolve => setTimeout(resolve, 10))
    if (!base) throw new Error(`offline hub failed to start: ${output}`)
    await check(base, () => output)
    expect(output).not.toMatch(/INPUT_PRIVATE|OUTPUT_PRIVATE|QUEUE_PRIVATE/)
  } finally {
    if (child.exitCode === null && child.signalCode === null) await new Promise<void>(resolve => {
      const timer = setTimeout(() => child.kill("SIGKILL"), 1500)
      child.once("close", () => { clearTimeout(timer); resolve() }); child.kill("SIGTERM")
    })
  }
}
const request = (url: string, init?: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(5000) })
describe("actual paid HTTP path attestation wiring (offline simulation)", () => {
  it.each(["settled", "failed", "broken", "unverified", "missing", "unarmed", "test"])("keeps receipt-first boundaries: %s", async mode => {
    await withHub(mode, async (base, output) => {
      const url = `${base}/x/${seller}/http-attest`
      const probe = await request(url, { method: "POST", body: "{}" })
      expect(probe.status).toBe(402)
      const accepted = (await probe.json()).accepts[0]
      const signed = await Effect.runPromise(signAuthorization({ account: buyer, to: accepted.payTo, valueAtomic: 10_000n }))
      const { signature, ...authorization } = signed
      const response = await request(url, { method: "POST", body: JSON.stringify({ private: "INPUT_PRIVATE" }),
        headers: { [HEADER_PAYMENT_SIGNATURE]: Buffer.from(JSON.stringify({ x402Version: 2, accepted, payload: { authorization, signature } })).toString("base64") } })
      expect(response.status).toBe(202)
      const queued = await response.json()
      const result = await (await request(queued.poll_url)).json()
      expect(result.receipt.settled).toBe(mode !== "failed")
      expect(result.receipt.reason).toBe(mode === "failed" ? "output failed the listing's outputSchema" : "ok")
      const lines = output().split("\n").filter(line => line.startsWith("[attest-enqueued] "))
      if (["unverified", "missing", "unarmed", "test"].includes(mode)) expect(lines).toHaveLength(0)
      else {
        expect(lines).toHaveLength(1)
        expect(JSON.parse(lines[0]!.slice(18))).toMatchObject({ jobId: queued.job_id, agentId: "42", buyer: buyer.address,
          seller, payTo, origin: base, chainId: 5042002, identityRegistry: loadChainConfig("arc-testnet").erc8004!.identity,
          settled: mode !== "failed", receiptExists: true, timestampMatches: true, inputMatches: true, outputMatches: true })
      }
    })
  }, 15_000)
})

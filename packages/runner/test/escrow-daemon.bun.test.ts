import { expect, test } from "bun:test"
import { Effect, Fiber } from "effect"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { hashJson } from "@arcade/core"
import { assertEscrowProviderSignature, captureEscrowProviderIntent, escrowContextToWire } from "@arcade/payments"
import { openEscrowProviderJournal } from "../../payments/src/erc8183-provider-journal.ts"
import { rpcFixture } from "../../payments/test/fixtures/erc8183-rpc.ts"
import { hash } from "../../payments/test/fixtures/erc8183-action.ts"
import { defaultConfig } from "../src/config.ts"
import { startDaemon } from "../src/daemon.ts"
async function until<T>(read: () => T | undefined): Promise<T> {
  const end = performance.now() + 7000
  while (performance.now() < end) { const value = read(); if (value !== undefined) return value; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw Error("owned daemon fixture timed out")
}
async function run(mode: "budget" | "submit" | "disabled" | "metadata" | "before-ack" | "reconnect") {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-escrow-daemon-test-"))); chmodSync(dir, 0o700)
  const cleanups: Array<() => void | Promise<unknown>> = [() => rmSync(dir, { recursive: true, force: true })]
  try {
  const key = generatePrivateKey(), seller = privateKeyToAccount(key).address.toLowerCase() as `0x${string}`
  const oldKey = process.env.ARCADE_SELLER_KEY, records: { connection: number; message: Record<string, unknown> }[] = []
  const peers: Bun.ServerWebSocket<{ connection: number }>[] = []
  const h = await rpcFixture(mode === "budget" || mode === "before-ack" ? "budget" : "submit")
  const disk = openEscrowProviderJournal(join(dir, "provider.sqlite")), input = { question: "local fixture" }
  cleanups.push(disk.close)
  const server = Bun.serve<{ connection: number }>({ hostname: "127.0.0.1", port: 0,
    fetch(req, server) { return server.upgrade(req, { data: { connection: peers.length } }) ? undefined : new Response("fixture", { status: 404 }) },
    websocket: { open(ws) { peers.push(ws) }, message(ws, data) { records.push({ connection: ws.data.connection, message: JSON.parse(String(data)) }) } } })
  cleanups.push(() => { server.stop(true) })
  const context = { ...h.f.context, call: { ...h.f.context.call, provider: seller,
    resource: `${server.url.origin}/x/${seller}/skill`, inputHash: hashJson(input) } }
  h.f.snapshot.job.provider = seller
  const skills = join(dir, "skills"), skill = join(skills, "skill")
  mkdirSync(skill, { recursive: true })
  writeFileSync(join(skill, "arcade.json"), JSON.stringify({ id: "skill", version: "1.0.0", serviceName: "Fixture", description: "Owned offline fixture",
    tags: [], price: "$0.30", rails: ["erc8183"], bounds: { timeoutSec: 60 },
    inputSchema: { type: "object", required: ["question"], properties: { question: { type: "string" } } },
    outputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
    engine: { adapter: "script", entry: "run.ts" }, secrets: [], egress: [] }))
  writeFileSync(join(skill, "run.ts"), `const {input} = await Bun.stdin.json(); await Bun.write(new URL("./ran", import.meta.url), "yes");
${mode === "reconnect" ? "await Bun.sleep(250);" : ""}
console.log(JSON.stringify({output:{text:"actual",echo:input,keyPresent:process.env.ARCADE_SELLER_KEY!==undefined},stopReason:"end_turn"}));`)
  process.env.ARCADE_SELLER_KEY = key
  cleanups.push(() => { if (oldKey === undefined) delete process.env.ARCADE_SELLER_KEY; else process.env.ARCADE_SELLER_KEY = oldKey })
  const config = { ...defaultConfig({ sellerAddress: seller, hubUrl: server.url.origin }), agents: { skill: {
    agentId: "8", agentURI: "https://example.test/agent", registrationTx: hash(9), registeredAtMs: 1000 } } }
  const fiber = Effect.runFork(startDaemon({ config, skillsDir: skills, ensTickerFactory: async () => undefined,
    ...(mode === "disabled" ? {} : { escrow: { identity: h.identity, journal: disk.journal, operationTimeoutMs: 30000,
      nowSeconds: () => 1000, fetch: h.options.fetch } }) }))
  cleanups.push(() => Effect.runPromise(Fiber.interrupt(fiber)))
    await until(() => records.find(r => r.message._tag === "Hello"))
    const ws = peers[0]!, hubJobId = "job_" + "a".repeat(32), requestId = hash(101)
    if (mode !== "before-ack") ws.send(JSON.stringify({ _tag: "Ack", ok: true }))
    if (mode === "budget" || mode === "before-ack") {
      ws.send(JSON.stringify({ _tag: "EscrowBudgetRequest", requestId, context: escrowContextToWire(context) }))
      const result = await until(() => records.find(r => r.message._tag === "EscrowBudgetSigned" || r.message._tag === "EscrowAuthorizationRefused"))
      if (mode === "before-ack") expect(result.message._tag).toBe("EscrowAuthorizationRefused")
      else {
        expect(result.message._tag).toBe("EscrowBudgetSigned")
        const intent = captureEscrowProviderIntent({ requestId, context, kind: "budget", issuedAt: 1000,
          nonce: BigInt(String(result.message.nonce)), deadline: BigInt(String(result.message.deadline)), hubJobId: null, outputHash: null })
        expect(String(await assertEscrowProviderSignature(intent, result.message.signature))).toBe(result.message.signature as string)
      }
      expect(existsSync(join(skill, "ran"))).toBe(false)
    } else {
      ws.send(JSON.stringify({ _tag: "JobAssignment", jobId: hubJobId, skillId: "skill", skillVersion: "1.0.0", timeoutSec: 60, input,
        escrow: escrowContextToWire(mode === "metadata" ? { ...context, call: { ...context.call, skillVersion: "2.0.0" } } : context) }))
      if (mode === "reconnect") {
        await until(() => existsSync(join(skill, "ran")) ? true : undefined); ws.close()
        await until(() => records.find(r => r.connection === 1 && r.message._tag === "Hello"))
        peers[1]!.send(JSON.stringify({ _tag: "Ack", ok: true }))
        peers[1]!.send(JSON.stringify({ _tag: "EscrowSubmitRequest", requestId, context: escrowContextToWire(context),
          hubJobId, outputHash: hashJson({ text: "actual", echo: input, keyPresent: false }) }))
        expect((await until(() => records.find(r => r.connection === 1 && r.message._tag === "EscrowAuthorizationRefused"))).message.reason)
          .toBe("authorization_refused")
        expect(records.some(r => r.message._tag === "EscrowSubmitSigned")).toBe(false)
      } else {
        const result = (await until(() => records.find(r => r.message._tag === "JobResult"))).message.outcome as { status: string; output?: unknown }
        if (mode === "disabled" || mode === "metadata") {
          expect(result.status).toBe("failed"); expect(existsSync(join(skill, "ran"))).toBe(false)
        } else {
          expect(result.status).toBe("succeeded"); expect(result.output).toEqual({ text: "actual", echo: input, keyPresent: false })
          ws.send(JSON.stringify({ _tag: "EscrowSubmitRequest", requestId, context: escrowContextToWire(context), hubJobId, outputHash: hashJson(result.output) }))
          const reply = (await until(() => records.find(r => r.message._tag === "EscrowSubmitSigned"))).message
          const intent = captureEscrowProviderIntent({ requestId, context, kind: "submit", issuedAt: 1000,
            nonce: BigInt(String(reply.nonce)), deadline: BigInt(String(reply.deadline)), hubJobId, outputHash: hashJson(result.output) })
          expect(String(await assertEscrowProviderSignature(intent, reply.signature))).toBe(reply.signature as string)
        }
      }
    }
    expect(h.calls.some(c => c.method === "eth_sendRawTransaction")).toBe(false)
    expect(JSON.stringify(records)).not.toContain(key)
  } finally {
    let failed = false
    for (const cleanup of cleanups.reverse()) { try { await cleanup() } catch { failed = true } }
    if (failed) throw Error("owned daemon fixture cleanup failed")
  }
}
test.each(["budget", "submit", "disabled", "metadata", "before-ack", "reconnect"] as const)
  ("actual owned-loopback daemon escrow %s", mode => run(mode), 15000)

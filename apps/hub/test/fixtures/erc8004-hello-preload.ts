import { mock } from "bun:test"
import { Effect, Layer } from "effect"
import { loadChainConfig } from "@arcade/core"
import { StoreLive, StoreTag } from "../../src/store.ts"
import { BrokerLive, BrokerTag } from "../../src/broker.ts"
const erc = { ...await import("../../src/erc8004.ts") }
const state = await Effect.runPromise(Effect.provide(StoreTag, StoreLive))
const broker = await Effect.runPromise(Effect.provide(BrokerTag, BrokerLive))
const results = new Map<string, unknown>()
mock.module("../../src/broker.ts", () => ({ BrokerTag, BrokerLive: Layer.succeed(BrokerTag, broker) }))
mock.module("../../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, { ...state,
  putListing: (rec: Parameters<typeof state.putListing>[0]) => state.putListing(rec).pipe(Effect.tap(() => Effect.sync(() =>
    console.log("[claim-stored] " + JSON.stringify({ id: rec.listing.id, runnerId: rec.runnerId,
      agentId: rec.agentId ?? null, agentVerified: rec.agentVerified ?? null }))))) }) }))
let release: () => void = () => {}
const released = new Promise<void>(resolve => { release = resolve })
process.stdin.setEncoding("utf8")
let controlBuffer = ""
process.stdin.on("data", data => {
  controlBuffer += String(data)
  for (;;) {
    const end = controlBuffer.indexOf("\n")
    if (end < 0) return
    const line = controlBuffer.slice(0, end); controlBuffer = controlBuffer.slice(end + 1)
    if (line === "release") { release(); continue }
    const command = JSON.parse(line) as { id: string; op: string; runnerId: string; jobId: string; skillId: string }
    void Effect.runPromise(Effect.gen(function* () {
      if (command.op === "dispatch") {
        void Effect.runPromise(Effect.either(broker.dispatch({ jobId: command.jobId, skillId: command.skillId,
          skillVersion: "1", input: {}, timeoutSec: 5 }))).then(result => results.set(command.jobId,
          result._tag === "Left" ? { status: "failed", tag: result.left._tag } : { status: "completed", outcome: result.right }))
      }
      const snapshot = { runner: yield* state.getRunner(command.runnerId), route: yield* broker.runnerFor(command.skillId),
        assigned: yield* broker.runnerForJob(command.jobId), result: results.get(command.jobId) ?? null }
      console.log("[hello-control] " + JSON.stringify({ id: command.id, ...snapshot }))
    }))
  }
})
const seller = process.env["TEST_SELLER"]!
mock.module("../../src/erc8004.ts", () => ({ ...erc,
  Erc8004FromEnv: () => Layer.succeed(erc.Erc8004Tag, { ...erc.noopErc8004("fixture"), armed: true,
    registries: loadChainConfig("arc-testnet").erc8004!,
    addresses: { operator: seller, validator: "0x2222222222222222222222222222222222222222", attester: "0x3333333333333333333333333333333333333333" },
    ownerOf: (id: string) => Effect.gen(function* () {
      console.log(`[claim-read] ${id}`)
      if (id === "3") return yield* new erc.Erc8004Failed({ op: "ownerOf", reason: "PRIVATE_PROVIDER_KEY" })
      if (id === "4") yield* Effect.promise(() => released)
      return id === "2" ? "0x9999999999999999999999999999999999999999" : seller
    }) }),
  verifyAgentClaims: (...args: Parameters<typeof erc.verifyAgentClaims>) => erc.verifyAgentClaims(...args).pipe(
    Effect.tap(() => Effect.sync(() => console.log(`[claims-done] ${args[2][0]?.agentId ?? "none"}`))))
}))
globalThis.fetch = async () => { throw new Error("external network disabled in Hello fixture") }
const serve = Bun.serve
Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
  const websocket = "websocket" in options ? options.websocket : undefined
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0, ...(websocket === undefined ? {} : {
    websocket: { ...websocket, message: async (ws: Parameters<typeof websocket.message>[0], raw: Parameters<typeof websocket.message>[1]) => {
      await websocket.message(ws, raw)
      const msg = JSON.parse(String(raw)) as { _tag: string; jobId?: string; atMs?: number }
      console.log(`[message-done] ${msg._tag} ${msg.jobId ?? msg.atMs ?? "none"}`)
    } }
  }) } as Parameters<typeof Bun.serve>[0])
  console.log(`[hello-test-port] ${server.port}`)
  return server
}) as typeof Bun.serve

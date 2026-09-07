/** Test-only actual hub broker. Owned loopback, no keys, payments or RPC. */
import { mock } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { escrowContextFromWire } from "@arcade/payments"
import { StoreLive, StoreTag } from "../../src/store.ts"
const actual = { ...await import("../../src/broker.ts") }
const broker = actual.makeBroker(Effect.runSync(Ref.make({ conns: new Map(), routes: new Map(), waiters: new Map(), assigned: new Map() })),
  { nowSeconds: () => 1000 })
const state = await Effect.runPromise(Effect.provide(StoreTag, StoreLive))
mock.module("../../src/broker.ts", () => ({ ...actual, BrokerLive: Layer.succeed(actual.BrokerTag, broker) }))
mock.module("../../src/store-sqlite.ts", () => ({ StoreFromEnv: () => Layer.succeed(StoreTag, state) }))
globalThis.fetch = Object.assign(async () => { throw Error("external network disabled in escrow fixture") },
  { preconnect: () => { throw Error("external network disabled in escrow fixture") } })
process.stdin.setEncoding("utf8")
let buffer = ""
process.stdin.on("data", part => {
  buffer += String(part)
  for (;;) {
    const end = buffer.indexOf("\n"); if (end < 0) return
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
    void (async () => {
      const command = JSON.parse(line)
      try {
        const context = escrowContextFromWire(command.context)
        if (command.op === "dispatch") {
          const result = await Effect.runPromise(broker.dispatch({ jobId: command.hubJobId, skillId: context.call.skillId,
            skillVersion: context.call.skillVersion, input: {}, timeoutSec: context.call.timeoutSeconds, escrow: command.context }))
          console.log("[escrow-control] " + JSON.stringify({ id: command.id, ok: true, status: result.status }))
        } else {
          await broker.escrow!.authorize(context, command.operation, AbortSignal.timeout(1500))
          console.log("[escrow-control] " + JSON.stringify({ id: command.id, ok: true }))
        }
      } catch { console.log("[escrow-control] " + JSON.stringify({ id: command.id, ok: false })) }
    })()
  }
})
const serve = Bun.serve
Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
  const websocket = "websocket" in options ? options.websocket : undefined
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0, ...(websocket === undefined ? {} : {
    websocket: { ...websocket, message: async (ws: Parameters<typeof websocket.message>[0], raw: Parameters<typeof websocket.message>[1]) => {
      await websocket.message(ws, raw)
      console.log("[escrow-message-done]")
    } }
  }) } as Parameters<typeof Bun.serve>[0])
  console.log(`[escrow-test-port] ${server.port}`); return server
}) as typeof Bun.serve

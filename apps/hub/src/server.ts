import { Effect, Layer, Runtime, Schema } from "effect"
import {
  ARC_CAIP2,
  JobOutcome,
  PublicListing,
  Rating,
  decodeRunnerMessage,
  explorerTxUrl,
  formatPrice,
  parsePrice,
  type HubMessage
} from "@arcade/core"
import {
  HEADER_PAYMENT_LEGACY,
  HEADER_PAYMENT_SIGNATURE,
  PaymentPayload,
  RailTag,
  decodeHeaderJson,
  Eip3009Live,
  GatewayLive,
  RailTest
} from "@arcade/payments"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { BrokerLive, BrokerTag, type RunnerConn } from "./broker.ts"
import { StoreLive, StoreTag } from "./store.ts"
import { runJob } from "./pipeline.ts"
import { renderIndex } from "./ui.ts"

/**
 * ARCADE hub.
 *
 * Transport is Bun.serve (native WebSocket upgrade, no adapter layer); ALL logic is Effect.
 * See docs/architecture.md — a deviation from the plan's `@effect/platform` HttpApi, taken
 * because runners need a real WSS server and Bun gives that natively with fewer moving parts.
 * OpenAPI is still derived from the Effect Schemas (see /openapi.json).
 */

const PORT = Number(process.env["PORT"] ?? 8787)
const FEE_BPS = Number(process.env["ARCADE_FEE_BPS"] ?? 500)
const RAIL = process.env["ARCADE_RAIL"] ?? "eip3009"
const PUBLISH_TOKEN = process.env["ARCADE_PUBLISH_TOKEN"] ?? "dev-token"

const railLayer = () => {
  switch (RAIL) {
    case "gateway":
      return GatewayLive({})
    case "test":
      return RailTest({})
    default: {
      const pk = process.env["ARCADE_FACILITATOR_KEY"]
      if (pk === undefined) {
        console.warn(
          "[hub] ARCADE_FACILITATOR_KEY not set — generating an ephemeral facilitator key.\n" +
            "      Settlement will fail without gas. Set it to a funded Arc testnet key."
        )
      }
      return Eip3009Live({
        facilitator: privateKeyToAccount((pk ?? generatePrivateKey()) as `0x${string}`)
      })
    }
  }
}

const AppLive = Layer.mergeAll(StoreLive, BrokerLive, railLayer())

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2), {
    status,
    headers: { "content-type": "application/json" }
  })

const newJobId = () => `job_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`

const main = Effect.gen(function* () {
  const runtime = yield* Effect.runtime<StoreTag | BrokerTag | RailTag>()
  const run = Runtime.runPromise(runtime)
  const store = yield* StoreTag
  const broker = yield* BrokerTag
  const rail = yield* RailTag

  const sockets = new Map<object, { runnerId?: string }>()

  const server = Bun.serve<{ runnerId?: string }, never>({
    port: PORT,
    idleTimeout: 120,

    websocket: {
      open() {},
      async message(ws, raw) {
        const parsed = await run(
          decodeRunnerMessage(JSON.parse(String(raw))).pipe(Effect.either)
        )
        if (parsed._tag === "Left") {
          ws.send(JSON.stringify({ _tag: "Ack", ok: false, detail: "bad message" }))
          return
        }
        const msg = parsed.right

        switch (msg._tag) {
          case "Hello": {
            ws.data.runnerId = msg.runnerId
            const conn: RunnerConn = {
              runnerId: msg.runnerId,
              seller: msg.seller,
              send: (m: HubMessage) => ws.send(JSON.stringify(m)),
              close: () => ws.close()
            }
            await run(
              Effect.gen(function* () {
                yield* broker.register(conn, msg.listings.map((l) => l.id))
                yield* store.putRunner({
                  runnerId: msg.runnerId,
                  seller: msg.seller,
                  skillIds: msg.listings.map((l) => l.id),
                  maxConcurrency: msg.maxConcurrency,
                  connectedAtMs: Date.now(),
                  lastSeenMs: Date.now(),
                  activeJobs: 0
                })
                for (const listing of msg.listings) {
                  yield* store.putListing({
                    listing,
                    seller: msg.seller,
                    runnerId: msg.runnerId,
                    publishedAtMs: Date.now()
                  })
                }
              })
            )
            console.log(
              `[hub] runner ${msg.runnerId} online (${msg.seller}) skills=[${msg.listings
                .map((l) => l.id)
                .join(", ")}]`
            )
            ws.send(JSON.stringify({ _tag: "Ack", ok: true }))
            break
          }
          case "JobResult": {
            await run(broker.complete(msg.jobId, msg.outcome))
            break
          }
          case "Heartbeat": {
            await run(store.touchRunner(msg.runnerId, msg.activeJobs))
            break
          }
          case "JobLog": {
            console.log(`[job ${msg.jobId}] ${msg.line}`)
            break
          }
        }
      },
      async close(ws) {
        const rid = ws.data.runnerId
        if (rid !== undefined) {
          await run(
            Effect.zipRight(broker.unregister(rid), Effect.zipRight(store.dropRunner(rid), store.removeListingsForRunner(rid)))
          )
          console.log(`[hub] runner ${rid} offline`)
        }
        sockets.delete(ws.data)
      }
    },

    async fetch(req) {
      const url = new URL(req.url)
      const path = url.pathname

      if (path === "/ws") {
        const data = {}
        sockets.set(data, data)
        if (server.upgrade(req, { data })) return undefined as unknown as Response
        return new Response("expected websocket", { status: 400 })
      }

      if (path === "/healthz") return json({ ok: true, rail: rail.name, network: ARC_CAIP2 })

      if (path === "/" ) {
        const listings = await run(store.allListings)
        const receipts = await run(store.allReceipts)
        return new Response(renderIndex(listings, receipts, rail.name), {
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      }

      if (path === "/openapi.json") {
        const { JSONSchema } = await import("effect")
        return json({
          openapi: "3.1.0",
          info: { title: "ARCADE", version: "0.1.0", description: "Paid agent skills on Arc" },
          "x-payment": { network: ARC_CAIP2, scheme: "exact", rail: rail.name },
          components: {
            schemas: {
              // Derived from the same Effect Schemas the runtime enforces — cannot drift.
              PublicListing: JSONSchema.make(PublicListing),
              PaymentPayload: JSONSchema.make(PaymentPayload)
            }
          }
        })
      }

      if (path === "/listings" && req.method === "GET") {
        const all = await run(store.allListings)
        return json(all.map((r) => ({ ...r.listing, seller: r.seller })))
      }

      const listingMatch = /^\/listings\/([a-z0-9-]+)$/.exec(path)
      if (listingMatch !== null && req.method === "GET") {
        const res = await run(store.getListing(listingMatch[1]!).pipe(Effect.either))
        if (res._tag === "Left") return json({ error: "not_found" }, 404)
        const stats = await run(store.statsFor(listingMatch[1]!))
        const ratings = await run(store.ratingsFor(listingMatch[1]!))
        const avg =
          ratings.length === 0 ? null : ratings.reduce((a, r) => a + r.stars, 0) / ratings.length
        return json({ ...res.right.listing, seller: res.right.seller, stats, ratings: { count: ratings.length, average: avg } })
      }

      if (path === "/runners" && req.method === "GET") {
        const runners = await run(store.allRunners)
        return json(
          runners.map((r) => ({
            ...r,
            heartbeatAgeMs: Date.now() - r.lastSeenMs
          }))
        )
      }

      if (path === "/receipts" && req.method === "GET") {
        const receipts = await run(store.allReceipts)
        return json(
          receipts.map((r) => ({
            ...r,
            priceAtomic: r.priceAtomic.toString(),
            sellerAtomic: r.sellerAtomic.toString(),
            feeAtomic: r.feeAtomic.toString(),
            price: formatPrice(r.priceAtomic),
            sellerShare: formatPrice(r.sellerAtomic),
            fee: formatPrice(r.feeAtomic),
            explorer: r.settleTx === undefined ? null : explorerTxUrl(r.settleTx)
          }))
        )
      }

      const jobMatch = /^\/jobs\/([A-Za-z0-9_]+)$/.exec(path)
      if (jobMatch !== null && req.method === "GET") {
        const job = await run(store.getJob(jobMatch[1]!))
        if (job === undefined) return json({ error: "not_found" }, 404)
        return json({ ...job, priceAtomic: job.priceAtomic.toString() })
      }

      // ---- ratings: receipt-gated -------------------------------------------
      if (path === "/ratings" && req.method === "POST") {
        const body = (await req.json()) as { jobId?: string; stars?: number; comment?: string }
        const receipts = await run(store.allReceipts)
        const receipt = receipts.find((r) => r.jobId === body.jobId)
        // A rating requires a SETTLED receipt: a fake review costs real USDC.
        if (receipt === undefined || !receipt.settled) {
          return json({ error: "rating requires a settled receipt for this job" }, 403)
        }
        const already = (await run(store.ratingsFor(receipt.skillId))).some(
          (r) => r.receiptJobId === receipt.jobId
        )
        if (already) return json({ error: "already rated" }, 409)

        const rating = Rating.make({
          receiptJobId: receipt.jobId,
          skillId: receipt.skillId,
          skillVersion: receipt.skillVersion,
          buyer: receipt.buyer,
          stars: Math.max(1, Math.min(5, Math.trunc(body.stars ?? 0))),
          ...(body.comment === undefined ? {} : { comment: body.comment }),
          createdAtMs: Date.now()
        })
        await run(store.putRating(rating))
        return json({ ok: true, rating })
      }

      // ---- the paid endpoint -------------------------------------------------
      const callMatch = /^\/x\/([^/]+)\/([a-z0-9-]+)$/.exec(path)
      if (callMatch !== null && req.method === "POST") {
        const skillId = callMatch[2]!
        const found = await run(store.getListing(skillId).pipe(Effect.either))
        if (found._tag === "Left") return json({ error: "not_found" }, 404)
        const { listing, seller } = found.right

        const priceAtomic = parsePrice(listing.price)
        const resource = `${url.origin}${path}`

        const header =
          req.headers.get(HEADER_PAYMENT_SIGNATURE) ?? req.headers.get(HEADER_PAYMENT_LEGACY)

        if (header === null) {
          const requirements = await run(rail.challenge({ priceAtomic, resource, payTo: seller, description: listing.description }))
          return json(
            { x402Version: 2, error: "payment required", accepts: [requirements] },
            402
          )
        }

        const decoded = await run(
          Effect.flatMap(
            Effect.try(() => decodeHeaderJson(header)),
            (j) => Schema.decodeUnknown(PaymentPayload)(j)
          ).pipe(Effect.either)
        )
        if (decoded._tag === "Left") return json({ error: "malformed payment header" }, 400)

        const requirements = await run(
          rail.challenge({ priceAtomic, resource, payTo: seller, description: listing.description })
        )
        const verifiedE = await run(rail.verify(decoded.right, requirements).pipe(Effect.either))
        if (verifiedE._tag === "Left") {
          return json({ error: "payment_invalid", detail: verifiedE.left._tag }, 402)
        }
        const verified = verifiedE.right

        const input = await req.json().catch(() => ({}))
        const jobId = newJobId()

        // 202 immediately: real skills take seconds to minutes, so the request cannot block.
        const accrualId = `acc_${new Date().toISOString().slice(0, 10)}`
        void run(
          runJob({ jobId, listing, seller, input, verified, feeBps: FEE_BPS, accrualId }).pipe(
            Effect.tap(({ outcome, receipt }) =>
              Effect.sync(() =>
                console.log(
                  `[hub] job ${jobId} ${outcome.status} settled=${receipt.settled} ${receipt.reason}` +
                    (receipt.settleTx === undefined ? "" : ` tx=${receipt.settleTx}`)
                )
              )
            ),
            Effect.catchAllCause((c) => Effect.sync(() => console.error(`[hub] job ${jobId} crashed`, c)))
          )
        )

        return json(
          {
            job_id: jobId,
            status: "queued",
            poll_url: `${url.origin}/jobs/${jobId}/result`,
            price: formatPrice(priceAtomic)
          },
          202
        )
      }

      // Long-poll for a job result.
      const resultMatch = /^\/jobs\/([A-Za-z0-9_]+)\/result$/.exec(path)
      if (resultMatch !== null && req.method === "GET") {
        const jobId = resultMatch[1]!
        const deadline = Date.now() + 120_000
        while (Date.now() < deadline) {
          const receipts = await run(store.allReceipts)
          const receipt = receipts.find((r) => r.jobId === jobId)
          if (receipt !== undefined) {
            const job = await run(store.getJob(jobId))
            return json({
              job_id: jobId,
              status: job?.outcome?.status ?? (receipt.settled ? "succeeded" : "failed"),
              result: job?.outcome?.output ?? null,
              receipt: {
                ...receipt,
                priceAtomic: receipt.priceAtomic.toString(),
                sellerAtomic: receipt.sellerAtomic.toString(),
                feeAtomic: receipt.feeAtomic.toString(),
                price: formatPrice(receipt.priceAtomic),
                sellerShare: formatPrice(receipt.sellerAtomic),
                fee: formatPrice(receipt.feeAtomic),
                explorer: receipt.settleTx === undefined ? null : explorerTxUrl(receipt.settleTx)
              }
            })
          }
          await Bun.sleep(300)
        }
        return json({ job_id: jobId, status: "pending" }, 202)
      }

      // publish (runner-token auth)
      if (path === "/publish" && req.method === "POST") {
        if (req.headers.get("authorization") !== `Bearer ${PUBLISH_TOKEN}`) {
          return json({ error: "unauthorized" }, 401)
        }
        const body = await req.json()
        const decoded = await run(Schema.decodeUnknown(PublicListing)(body).pipe(Effect.either))
        if (decoded._tag === "Left") return json({ error: "invalid listing" }, 400)
        return json({ ok: true, id: decoded.right.id })
      }

      return json({ error: "not_found" }, 404)
    }
  })

  console.log(`[hub] ARCADE listening on :${PORT}  rail=${rail.name}  network=${ARC_CAIP2}  fee=${FEE_BPS}bps`)
  yield* Effect.never
})

Effect.runPromise(Effect.scoped(main.pipe(Effect.provide(AppLive)))).catch((e) => {
  console.error(e)
  process.exit(1)
})

export { JobOutcome }

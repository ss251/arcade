import { Effect, Layer, Runtime, Schema } from "effect"
import {
  ARC_CAIP2,
  USDC_ADDRESS,
  Job,
  JobOutcome,
  PublicListing,
  Rating,
  ratingDigest,
  helloDigest,
  HELLO_MAX_AGE_MS,
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
import { createHmac, timingSafeEqual } from "node:crypto"
import { recoverMessageAddress } from "viem"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { BrokerLive, BrokerTag, type RunnerConn } from "./broker.ts"
import { StoreTag } from "./store.ts"
import { StoreFromEnv } from "./store-sqlite.ts"
import { runJob } from "./pipeline.ts"
import {
  renderIndex,
  renderListingPage,
  renderListingRows,
  renderMeta,
  renderReceiptRows
} from "./ui.ts"
import { buildAgentSkill, buildOpenApi, buildWellKnownX402 } from "./openapi.ts"

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

/**
 * Preflight for a public deployment.
 *
 * Every default in this file is chosen so `bun run hub` works on a laptop with no setup.
 * Those same defaults are wrong on a host anyone can reach, and each of them fails
 * QUIETLY: an ephemeral facilitator key produces settlements that never land, and a
 * per-boot job secret produces buyers who paid and cannot fetch what they bought.
 *
 * `ARCADE_PUBLIC_URL` is the signal, because it is the one variable a correct public
 * deployment must set anyway — behind a proxy the advertised origin has to be the one
 * buyers can reach, not the socket Bun bound. If it is set, this refuses to start rather
 * than run misconfigured somewhere a judge is looking.
 */
const preflight = (): void => {
  if (process.env["ARCADE_PUBLIC_URL"] === undefined) return

  const missing: Array<string> = []
  if (process.env["ARCADE_HUB_SECRET"] === undefined) {
    missing.push(
      "ARCADE_HUB_SECRET — job tokens are HMAC'd with it, so leaving it unset mints a new " +
        "secret every boot and every buyer holding a 202 loses access to work they paid for"
    )
  }
  if (RAIL === "eip3009" && process.env["ARCADE_FACILITATOR_KEY"] === undefined) {
    missing.push(
      "ARCADE_FACILITATOR_KEY — without it the hub runs on an ephemeral key with no gas, so " +
        "every settlement fails after the work is already done"
    )
  }
  if (RAIL === "test") {
    console.warn(
      "[hub] WARNING: ARCADE_RAIL=test on a public origin. Settlements are simulated and no " +
        "USDC moves. Set ARCADE_RAIL=eip3009 (or gateway) for anything anyone will judge."
    )
  }
  if (process.env["ARCADE_FEE_SPLITTER"] !== undefined) {
    // Set on the HUB it does nothing, and used to do something dangerous. Saying so beats
    // ignoring it, because a deployer who sets it here believes fees are being collected.
    console.warn(
      "[hub] WARNING: ARCADE_FEE_SPLITTER is set on the hub and is ignored. A splitter is " +
        "per SELLER — its `seller` is immutable, so one hub-wide address would route every " +
        "other seller's revenue into the first seller's contract. Set it on the RUNNER; it " +
        "travels in the signed handshake."
    )
  }
  if (missing.length > 0) {
    console.error(
      `[hub] refusing to start: ARCADE_PUBLIC_URL is set, so this is a public deployment.\n\n` +
        missing.map((m) => `  - ${m}`).join("\n\n") +
        `\n\nSet them, or unset ARCADE_PUBLIC_URL to run locally.`
    )
    process.exit(2)
  }
}

const railLayer = () => {
  switch (RAIL) {
    case "gateway":
      return GatewayLive({})
    case "test":
      // Seed unlisted payers so a real `arcade-buy` can reach settlement on this rail —
      // it is what makes the marketplace page demonstrable without a funded chain.
      return RailTest({}, parsePrice(process.env["ARCADE_TEST_BALANCE"] ?? "$1000"))
    default: {
      const pk = process.env["ARCADE_FACILITATOR_KEY"]
      if (pk === undefined) {
        console.warn(
          "[hub] ARCADE_FACILITATOR_KEY not set — generating an ephemeral facilitator key.\n" +
            "      Settlement will fail without gas. Set it to a funded Arc testnet key."
        )
      }
      // No `feeSplitter` here, deliberately. It used to be a hub-wide setting substituted
      // for every listing's payout, which is correct with one seller and loses money with
      // two — `FeeSplitter.seller` is immutable, so a second seller's buyers would sign
      // authorizations paying the first seller's contract. It now travels per seller in
      // the signed handshake; see `Hello.feeSplitter`.
      return Eip3009Live({
        facilitator: privateKeyToAccount((pk ?? generatePrivateKey()) as `0x${string}`)
      })
    }
  }
}

// Before the layers: building them emits its own diagnostics, and a refusal to start
// should be the first thing in the log rather than buried under warnings about the
// configuration it is refusing.
preflight()

const AppLive = Layer.mergeAll(StoreFromEnv(), BrokerLive, railLayer())

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

  /**
   * Job access tokens, derived rather than stored.
   *
   * `/jobs/:id` and `/jobs/:id/result` were unauthenticated, and `/receipts` published
   * every job id — so anyone could enumerate receipts and read every buyer's input and
   * every paid result for free. That is both a privacy breach the docs never disclosed and
   * a way to obtain the product without paying for it.
   *
   * HMAC over a per-hub secret keeps this stateless: the token is a function of the job id,
   * so nothing has to be persisted or expired, and a buyer who has the 202 can always
   * re-derive access to their own job and nobody else's.
   */
  const hubSecret =
    process.env["ARCADE_HUB_SECRET"] ?? crypto.randomUUID() + crypto.randomUUID()
  const jobToken = (jobId: string): string =>
    createHmac("sha256", hubSecret).update(`arcade-job:${jobId}`).digest("hex").slice(0, 32)
  const jobTokenOk = (jobId: string, presented: string | null): boolean => {
    if (presented === null) return false
    const expected = jobToken(jobId)
    // Constant-time: token comparison is a guessing oracle otherwise.
    return (
      presented.length === expected.length &&
      timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
    )
  }
  const tokenFrom = (req: Request, url: URL): string | null =>
    req.headers.get("x-job-token") ?? url.searchParams.get("token")

  const sockets = new Map<object, { runnerId?: string }>()

  const server = Bun.serve<{ runnerId?: string; seller?: string }, never>({
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
            // The connection is anonymous until proven otherwise. `seller` decides where
            // every buyer's money goes, so it cannot be self-asserted: without this, anyone
            // could re-announce an existing skill id with their own address and collect.
            const age = Date.now() - Number(msg.nonce.split("-")[0] ?? 0)
            if (!Number.isFinite(age) || age < -HELLO_MAX_AGE_MS || age > HELLO_MAX_AGE_MS) {
              ws.send(JSON.stringify({ _tag: "Ack", ok: false, detail: "stale handshake" }))
              ws.close()
              return
            }

            const digest = helloDigest({
              runnerId: msg.runnerId,
              seller: msg.seller,
              nonce: msg.nonce,
              skillIds: msg.listings.map((l) => l.id),
              // Signed, so the address money routes to cannot be altered in transit.
              ...(msg.feeSplitter === undefined ? {} : { feeSplitter: msg.feeSplitter })
            })
            let recovered: string
            try {
              recovered = await recoverMessageAddress({
                message: digest,
                signature: msg.signature as `0x${string}`
              })
            } catch {
              ws.send(JSON.stringify({ _tag: "Ack", ok: false, detail: "bad signature" }))
              ws.close()
              return
            }
            if (recovered.toLowerCase() !== msg.seller.toLowerCase()) {
              console.error(`[hub] rejected ${msg.runnerId}: signer ${recovered} != seller ${msg.seller}`)
              ws.send(JSON.stringify({ _tag: "Ack", ok: false, detail: "signature does not match seller" }))
              ws.close()
              return
            }

            // Listing ids are first-claimed. A different seller re-announcing an existing
            // id is the payout-redirection attack, so it is refused rather than merged.
            const existing = await run(store.allListings)
            const owners = new Map(existing.map((r) => [r.listing.id, r.seller.toLowerCase()]))
            const stolen = msg.listings
              .map((l) => l.id)
              .filter((id) => {
                const owner = owners.get(id)
                return owner !== undefined && owner !== msg.seller.toLowerCase()
              })
            if (stolen.length > 0) {
              console.error(`[hub] rejected ${msg.runnerId}: ${stolen.join(", ")} owned by another seller`)
              ws.send(
                JSON.stringify({
                  _tag: "Ack",
                  ok: false,
                  detail: `skill id already claimed: ${stolen.join(", ")}`
                })
              )
              ws.close()
              return
            }

            ws.data.runnerId = msg.runnerId
            ws.data.seller = msg.seller
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
                    // Carried per listing from the signed handshake, never from a global.
                    ...(msg.feeSplitter === undefined ? {} : { feeSplitter: msg.feeSplitter }),
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
            // Only the runner the job was assigned to may complete it. Without this any
            // connected socket could forge an outcome for someone else's job — settling a
            // fabricated success, or failing a competitor's work.
            const owner = await run(broker.runnerForJob(msg.jobId))
            if (owner === undefined || owner !== ws.data.runnerId) {
              console.error(
                `[hub] dropped JobResult for ${msg.jobId} from ${ws.data.runnerId ?? "anonymous"} (assigned to ${owner ?? "nobody"})`
              )
              break
            }
            await run(broker.complete(msg.jobId, msg.outcome))
            break
          }
          case "Heartbeat": {
            // Same principle: a socket may only speak for the runner it authenticated as.
            if (ws.data.runnerId !== msg.runnerId) break
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

      // ---- the marketplace page ----------------------------------------------
      // Statistics are computed per listing rather than stored, so the page cannot show a
      // number the receipts do not support.
      const pageData = async () => {
        const records = await run(store.allListings)
        const receipts = await run(store.allReceipts)
        const listings = await Promise.all(
          records.map(async ({ listing, seller }) => {
            const stats = await run(store.statsFor(listing.id))
            const ratings = await run(store.ratingsFor(listing.id))
            return {
              listing,
              seller,
              stats,
              ratingCount: ratings.length,
              ratingAverage:
                ratings.length === 0
                  ? null
                  : ratings.reduce((a, r) => a + r.stars, 0) / ratings.length
            }
          })
        )
        return { listings, receipts, rail: rail.name, network: ARC_CAIP2, feeBps: FEE_BPS }
      }

      if (path === "/") {
        return new Response(renderIndex(await pageData()), {
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      }

      // Feeds the 4s poll. Returning rendered fragments rather than raw rows keeps the
      // markup in one place — the client swaps innerHTML and never re-implements a row.
      if (path === "/_feed") {
        const d = await pageData()
        return json({
          listings: renderListingRows(d.listings),
          receipts: renderReceiptRows(d.receipts),
          meta: renderMeta(d),
          total: d.receipts.length
        })
      }

      const skillPage = /^\/skill\/([a-z0-9-]+)$/.exec(path)
      if (skillPage !== null) {
        const d = await pageData()
        const view = d.listings.find((l) => l.listing.id === skillPage[1])
        if (view === undefined) return new Response("no such listing", { status: 404 })
        return new Response(
          renderListingPage(
            view,
            d.receipts.filter((r) => r.skillId === view.listing.id),
            { rail: d.rail, network: d.network, feeBps: d.feeBps }
          ),
          { headers: { "content-type": "text/html; charset=utf-8" } }
        )
      }

      // ---- discovery ---------------------------------------------------------
      // Both documents are generated from the live listing set, so they cannot describe a
      // skill that is not currently served, and cannot drift from the schemas the runtime
      // actually enforces. `ARCADE_PUBLIC_URL` matters behind a proxy: the advertised
      // origin has to be the one buyers can reach, not the socket the hub is bound to.
      if (path === "/openapi.json" || path === "/.well-known/x402" || path === "/skill.md") {
        const listings = await run(store.allListings)
        const discovery = {
          listings,
          origin: process.env["ARCADE_PUBLIC_URL"] ?? url.origin,
          rail: rail.name,
          network: ARC_CAIP2,
          asset: USDC_ADDRESS
        }
        if (path === "/skill.md") {
          return new Response(buildAgentSkill(discovery), {
            headers: { "content-type": "text/markdown; charset=utf-8" }
          })
        }
        return json(
          path === "/openapi.json" ? buildOpenApi(discovery) : buildWellKnownX402(discovery)
        )
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
        // The public feed is evidence that settlement happens, not a directory of who
        // bought what. `jobId` is omitted because it was the capability to read a
        // stranger's input and output; `buyer` because a wallet address plus a skill id is
        // a purchase history.
        return json(
          receipts.map(({ jobId: _jobId, buyer: _buyer, ...r }) => ({
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
        const jobId = jobMatch[1]!
        if (!jobTokenOk(jobId, tokenFrom(req, url))) return json({ error: "not_found" }, 404)
        const job = await run(store.getJob(jobId))
        if (job === undefined) return json({ error: "not_found" }, 404)
        // `input` is deliberately absent: the buyer already has it, and nobody else should.
        const { input: _input, ...rest } = job
        return json({ ...rest, priceAtomic: rest.priceAtomic.toString() })
      }

      if (path === "/ratings" && req.method === "POST") {
        const body = (await req.json()) as {
          jobId?: string
          stars?: number
          comment?: string
          signature?: string
        }
        const receipts = await run(store.allReceipts)
        const receipt = receipts.find((r) => r.jobId === body.jobId)
        // A rating requires a SETTLED receipt: a fake review costs real USDC.
        if (receipt === undefined || !receipt.settled) {
          return json({ error: "rating requires a settled receipt for this job" }, 403)
        }

        // …and proof you are the buyer on it. The receipt gate alone was not a gate: job
        // ids were published on /receipts, so anyone could enumerate them and post a rating
        // attributed to someone else's wallet. "Reputation is bought, not asserted" needs
        // the buyer's signature, or it is asserted after all.
        const stars = Math.max(1, Math.min(5, Math.trunc(body.stars ?? 0)))
        const digest = ratingDigest({ jobId: receipt.jobId, stars })
        let rater: string
        try {
          rater = await recoverMessageAddress({
            message: digest,
            signature: (body.signature ?? "0x") as `0x${string}`
          })
        } catch {
          return json({ error: "rating must be signed by the buyer", digest }, 401)
        }
        if (rater.toLowerCase() !== receipt.buyer.toLowerCase()) {
          return json({ error: "signature does not match the buyer on this receipt" }, 403)
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
          stars,
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
          const requirements = await run(rail.challenge({ priceAtomic, resource, payTo: seller, description: listing.description, ...(found.right.feeSplitter === undefined ? {} : { feeSplitter: found.right.feeSplitter }) }))
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
          rail.challenge({ priceAtomic, resource, payTo: seller, description: listing.description, ...(found.right.feeSplitter === undefined ? {} : { feeSplitter: found.right.feeSplitter }) })
        )
        const verifiedE = await run(rail.verify(decoded.right, requirements).pipe(Effect.either))
        if (verifiedE._tag === "Left") {
          return json({ error: "payment_invalid", detail: verifiedE.left._tag }, 402)
        }
        const verified = verifiedE.right

        const input = await req.json().catch(() => ({}))
        const jobId = newJobId()

        // Record the job BEFORE answering, so the 202 is backed by state that survives this
        // process. `pipeline.ts` writes the row once, already terminal, which meant an
        // interrupted job left no row at all — and the poll endpoint answers "pending" when
        // it cannot find one, so a buyer whose job was in flight during a restart polled
        // forever with no terminal answer. This row is what the boot reaper can then find
        // and fail honestly (see `store-sqlite.ts`).
        await run(
          store.putJob(
            Job.make({
              id: jobId,
              skillId: listing.id,
              seller,
              buyer: verified.payer,
              priceAtomic,
              input,
              status: "queued",
              createdAtMs: Date.now()
            })
          )
        )

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
            poll_url: `${url.origin}/jobs/${jobId}/result?token=${jobToken(jobId)}`,
            // The capability to read this job's result. Held only by whoever paid for it.
            job_token: jobToken(jobId),
            price: formatPrice(priceAtomic)
          },
          202
        )
      }

      // Long-poll for a job result.
      const resultMatch = /^\/jobs\/([A-Za-z0-9_]+)\/result$/.exec(path)
      if (resultMatch !== null && req.method === "GET") {
        const jobId = resultMatch[1]!
        if (!jobTokenOk(jobId, tokenFrom(req, url))) return json({ error: "not_found" }, 404)
        const deadline = Date.now() + 120_000
        while (Date.now() < deadline) {
          const receipts = await run(store.allReceipts)
          const receipt = receipts.find((r) => r.jobId === jobId)
          if (receipt !== undefined) {
            const job = await run(store.getJob(jobId))
            // The payload is released only against a SETTLED receipt. Previously a receipt
            // merely EXISTING was enough — and the pipeline writes one on every terminal
            // outcome, settled or not. So a job whose settlement failed still handed over
            // the work: the seller produced it, the buyer received it, nobody paid. D2 says
            // a failed job leaves the buyer's balance untouched; it has to also leave the
            // buyer without the goods, or "non-settlement is the refund" is a transfer.
            const delivered = receipt.settled === true
            return json({
              job_id: jobId,
              status: job?.outcome?.status ?? (receipt.settled ? "succeeded" : "failed"),
              result: delivered ? (job?.outcome?.output ?? null) : null,
              ...(delivered
                ? {}
                : {
                    detail:
                      job?.outcome?.error ??
                      "not settled — you were not charged, and no result is released"
                  }),
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

      // `POST /publish` used to live here, behind `ARCADE_PUBLISH_TOKEN` defaulting to
      // "dev-token". It was vestigial: it validated a listing, returned `{ok:true}`, and
      // stored NOTHING. Listings only ever enter through the signed `Hello` handshake,
      // where the hub recovers the seller address from a signature over the digest — which
      // is the mechanism that actually stops someone re-announcing a skill id with payment
      // redirected.
      //
      // Deleted rather than secured. A dead authenticated route makes its default
      // credential look load-bearing, so a reviewer reads "publish token defaults to
      // dev-token" as a hole and a deployer sets it believing it protects something.
      // Neither was true, and both are worse than no route.
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

import { Cause, Effect, Exit, Layer, Runtime, Schema, Scope } from "effect"
import {
  ARC_CAIP2,
  ARC_RPC_URL,
  USDC_ADDRESS,
  HIRE_CAPABILITY_HEADER,
  Job,
  JobOutcome,
  PublicListing,
  Rating,
  ROOT_LINEAGE,
  ratingDigest,
  helloDigest,
  HELLO_MAX_AGE_MS,
  decodeRunnerMessage,
  docBytes,
  formatPrice,
  loadChainConfig,
  mintHireCapability,
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
import { createHmac } from "node:crypto"
import { createPublicClient, http, recoverMessageAddress } from "viem"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { BrokerLive, BrokerTag, type RunnerConn } from "./broker.ts"
import { StoreTag, type ListingRecord } from "./store.ts"
import { StoreFromEnv } from "./store-sqlite.ts"
import { GraphFromEnv, GraphTag } from "./graph.ts"
import { graphEvidenceOf, graphStatsPayload } from "./graph-routes.ts"
export { graphEvidenceOf, graphStatsPayload } from "./graph-routes.ts"
import { Erc8004FromEnv, Erc8004Tag, verifyAgentClaims } from "./erc8004.ts"
import { agentRegistrationFor } from "./agent-registration.ts"
import { listingEvidence } from "./listing-evidence.ts"
import { AttestLive, AttestTag } from "./attest.ts"
import { runJob } from "./pipeline.ts"
import { RailsTag, railsLayerFrom } from "./rails.ts"
import { challengeChoices, matchesRequirements, paymentRailName } from "./challenge.ts"
import { prepareDiscoveryListings } from "./discovery.ts"
import { makeSessions } from "./sessions.ts"
import { makeSessionRoutes, timingSafeTokenOk } from "./server-sessions.ts"
import { makeSessionCallRoutes } from "./server-session-calls.ts"
import { sessionRefusal } from "./server-sessions.ts"
import { makeBrowserCors } from "./browser-cors.ts"
import { ordinaryReadScope, readOrdinaryBody } from "./ordinary-http.ts"
import { inputGate } from "./input-gate.ts"
import { payTestSkipReason } from "./canary-input.ts"
import { canaryFromEnv, canaryLoop } from "./canary.ts"
import { claimedPayerOf, delistRefusal } from "./delisted.ts"
export { claimedPayerOf, delistRefusal } from "./delisted.ts"
import { ceilingAtomicFor, maxHopFromEnv, resolveLineage } from "./lineage.ts"
import { scrubReceipt } from "./receipts-feed.ts"
export { scrubReceipt, type PublicReceiptRow, type PublicReceiptChild } from "./receipts-feed.ts"
import { listingReceiptFeed, publicStats, receiptLimit } from "./public-feeds.ts"
import { receiptChildExplorer, receiptExplorer } from "./receipt-reference.ts"
import { escrowResultDelivery } from "./escrow-result.ts"
import { escrowListingChallenge } from "./escrow-listing.ts"
import { makeEscrowRoutes } from "./escrow-http.ts"
import { runEscrowJob } from "./escrow-pipeline.ts"
import { openEscrowHubRail, readEscrowHubBoot } from "./escrow-config.ts"
import { sellerSummary, SellerSummaryUnavailable } from "./summary.ts"
import { buildTreeView } from "./tree-view.ts"
import { chainCheck, chainMetadataCheck, chainStartupRefusal } from "./chain-check.ts"
import { createChainRpc } from "./chain-rpc.ts"
import {
  renderIndex,
  renderListingPage,
  renderListingRows,
  renderMeta,
  renderReceiptRows
} from "./ui.ts"
import { buildAgentSkill, buildOpenApi, buildWellKnownX402 } from "./openapi.ts"
import { splitterRefusal } from "./splitter.ts"
import { sepoliaEnsReader } from "@arcade/buyer"
import { handleNames, makeEnsWatch, parseEnsSellerLabels, type EnsListingSnapshot } from "./ens.ts"

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
const chainConfig = loadChainConfig()
const onHostingPlatform = (): boolean => Object.keys(process.env).some(
  (key) => key.startsWith("RAILWAY_") || key.startsWith("FLY_") || key.startsWith("RENDER_")
)

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
  if (RAIL !== "eip3009" && RAIL !== "gateway" && RAIL !== "test") {
    console.error("[hub] refusing to start: invalid ARCADE_RAIL")
    process.exit(2)
  }
  const unavailable = chainStartupRefusal(chainConfig, RAIL)
  if (unavailable !== undefined) {
    console.error(`[hub] refusing to start: ${unavailable}`)
    process.exit(2)
  }
  // Arming this on `ARCADE_PUBLIC_URL` alone made the guard depend on remembering the one
  // variable whose absence it cannot detect: forget it, and the hub boots with every
  // insecure default and no refusal at all. So the deployment detects ITSELF — Railway
  // injects `RAILWAY_*` into every container, and their presence is evidence this is not a
  // laptop. Same move as deriving the treasury disclosure from the contract, one level up:
  // read the fact that this is public, do not configure it.
  const onPlatform = onHostingPlatform()
  const publicUrl = process.env["ARCADE_PUBLIC_URL"]
  if (publicUrl === undefined && !onPlatform) return

  const missing: Array<string> = []
  if (publicUrl === undefined) {
    missing.push(
      "ARCADE_PUBLIC_URL — a hosting platform was detected, so this is public. Without it " +
        "every 402 challenge and /openapi.json advertise the socket Bun bound rather than " +
        "the URL buyers can reach, and the challenge names an unreachable resource"
    )
  }
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

  // Durability. `StoreFromEnv` reads an ABSENT `ARCADE_DB` as a legitimate configuration —
  // it returns the in-memory store, which is exactly right on a laptop — so its absence
  // does not raise an error, it produces a working hub with a quietly different guarantee:
  // one that takes payments, writes receipts, and forgets them on the next deploy. That is
  // the one claim a marketplace cannot afford to make falsely, so it is checked here
  // rather than left to whoever set the variable last.
  const dbPath = process.env["ARCADE_DB"]
  const volumeMount = process.env["RAILWAY_VOLUME_MOUNT_PATH"]
  if (dbPath === undefined || dbPath === "") {
    missing.push(
      "ARCADE_DB — unset means the in-memory store, which is correct on a laptop and " +
        "catastrophic here: this hub would accept payments and write receipts to RAM, then " +
        "lose every one of them on the next deploy. Point it at a file on a mounted volume" +
        (volumeMount === undefined ? "" : `, e.g. ${volumeMount}/arcade.db`)
    )
  } else if (volumeMount !== undefined && !dbPath.startsWith(volumeMount)) {
    // A path outside the volume is the same failure wearing a different hat: the file is
    // created, writes succeed, and the container filesystem is discarded on redeploy.
    missing.push(
      `ARCADE_DB is ${dbPath}, which is NOT under this service's only mounted volume ` +
        `(${volumeMount}). A container filesystem is ephemeral, so the store would be ` +
        `written successfully and thrown away on every deploy — the same silent loss as ` +
        `leaving it unset, but harder to spot because the file exists`
    )
  } else if (volumeMount === undefined) {
    // Fly and Render mount volumes at operator-chosen paths with no comparable variable to
    // read, so this cannot be verified there. Say so rather than implying it was checked.
    console.warn(
      `[hub] NOTE: ARCADE_DB=${dbPath}. No RAILWAY_VOLUME_MOUNT_PATH is set, so durability ` +
        `could not be verified — confirm this path is on a persistent volume yourself. ` +
        `If it is not, receipts are lost on every deploy.`
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
  if (!process.env["ARCADE_CANARY_KEY"]) {
    console.warn(
      "[hub] NOTE: ARCADE_CANARY_KEY is not set, so no automatic pay-tests will run. " +
      "Existing dated evidence remains visible; untested listings say so. Set a dedicated " +
      "funded Arc testnet key to opt into purchases once per ARCADE_CANARY_INTERVAL."
    )
  }
  if (missing.length > 0) {
    console.error(
      `[hub] refusing to start: this is a public deployment.\n\n` +
        missing.map((m) => `  - ${m}`).join("\n\n") +
        `\n\nSet them. (Detected via ARCADE_PUBLIC_URL or a hosting platform's own env.)`
    )
    process.exit(2)
  }
}

/**
 * The origin buyers can actually reach.
 *
 * Behind a proxy `new URL(req.url).origin` is the INTERNAL http origin — Railway terminates
 * TLS, so a service that only serves https advertises `http://…` if it uses that directly.
 * The discovery documents already went through `ARCADE_PUBLIC_URL`; the 402 challenge did
 * not, so the same process served an https resource in /.well-known/x402 and an http one in
 * the challenge for the identical listing. `docs/runbook.md:18` names this exact failure and
 * the fix had reached only half of it.
 *
 * One function rather than two `??` expressions, because two places computing the same fact
 * is how they came to disagree.
 */
const browserCors = (() => {
  try { return makeBrowserCors(process.env["ARCADE_WEB_ORIGIN"], process.env["ARCADE_PUBLIC_URL"]) }
  catch { console.error("[hub] refusing to start: browser transport configuration invalid"); process.exit(2) }
})()
const publicOrigin = (url: URL): string => browserCors.publicOrigin ?? process.env["ARCADE_PUBLIC_URL"] ?? url.origin

let facilitatorAccount: ReturnType<typeof privateKeyToAccount> | undefined
const facilitator = (): ReturnType<typeof privateKeyToAccount> => {
  if (facilitatorAccount === undefined) {
    const key = process.env["ARCADE_FACILITATOR_KEY"]
    if (key === undefined) {
      console.warn("[hub] ARCADE_FACILITATOR_KEY not set — generating an ephemeral facilitator key. Settlement requires funded USDC for gas.")
    }
    facilitatorAccount = privateKeyToAccount((key ?? generatePrivateKey()) as `0x${string}`)
  }
  return facilitatorAccount
}

const railLayer = (name: string) => {
  switch (name) {
    case "gateway":
      // Equality assertions bind construction to the same selected snapshot as boot.
      // Constructing a rail makes no support, deposit or provider-network request.
      return GatewayLive({
        facilitatorUrl: chainConfig.gateway!.facilitatorUrl,
        wallet: chainConfig.gateway!.wallet,
        chainId: chainConfig.chainId,
        minValiditySeconds: chainConfig.gateway!.minValiditySeconds
      })
    case "test":
      // Seed unlisted payers so a real `arcade-buy` can reach settlement on this rail —
      // it is what makes the marketplace page demonstrable without a funded chain.
      return RailTest({}, parsePrice(process.env["ARCADE_TEST_BALANCE"] ?? "$1000"))
    default: {
      // No `feeSplitter` here, deliberately. It used to be a hub-wide setting substituted
      // for every listing's payout, which is correct with one seller and loses money with
      // two — `FeeSplitter.seller` is immutable, so a second seller's buyers would sign
      // authorizations paying the first seller's contract. It now travels per seller in
      // the signed handshake; see `Hello.feeSplitter`.
      return Eip3009Live({
        chain: chainConfig,
        ...(process.env["ARCADE_RPC_URL"] === undefined ? {} : { rpcUrl: process.env["ARCADE_RPC_URL"] }),
        facilitator: facilitator()
      })
    }
  }
}

// Before the layers: building them emits its own diagnostics, and a refusal to start
// should be the first thing in the log rather than buried under warnings about the
// configuration it is refusing.
const escrowBoot = (() => {
  try { return readEscrowHubBoot(process.env, { chainId: chainConfig.chainId, rail: RAIL }) }
  catch { console.error("[hub] refusing to start: escrow_hub_configuration_refused"); process.exit(2) }
})()
preflight()

// The test rail moves no funds and stays offline. Static availability refusals above
// remain mandatory even when an operator opts out of the live RPC check.
if (RAIL !== "test" && process.env["ARCADE_CHAIN_CHECK"] !== "0") {
  let result: { ok: boolean; findings: string[] }
  try {
    const rpc = createChainRpc(chainConfig, process.env["ARCADE_RPC_URL"])
    result = RAIL === "gateway"
      ? await chainMetadataCheck(chainConfig, rpc)
      : await chainCheck(chainConfig, rpc, facilitator().address)
  } catch {
    result = { ok: false, findings: ["chain check could not initialize; check the RPC and facilitator configuration"] }
  }
  if (result.ok) console.log(`[hub] chain check ok (${chainConfig.id})${RAIL === "gateway" ? "; Gateway gas is handled by Circle's hosted facilitator" : ""}`)
  else {
    console.warn(`[hub] chain check: ${result.findings.join("; ")}`)
    if (process.env["ARCADE_PUBLIC_URL"] !== undefined || onHostingPlatform()) {
      console.error("[hub] refusing to start: chain check failed")
      process.exit(2)
    }
  }
}

const Erc8004Layer = Erc8004FromEnv(chainConfig.erc8004)
const StoreLayer = StoreFromEnv()
const RailsLayer = Layer.unwrapScoped(Effect.gen(function* () {
  const store = yield* StoreTag, broker = yield* BrokerTag
  const fallback = yield* RailTag.pipe(Effect.provide(railLayer(RAIL)))
  const others = chainConfig.status === "ready" && chainConfig.gateway !== null && RAIL !== "gateway"
    ? [yield* RailTag.pipe(Effect.provide(railLayer("gateway")))] : []
  const escrow = escrowBoot === undefined ? undefined : yield* Effect.acquireRelease(
    Effect.sync(() => openEscrowHubRail(escrowBoot, store, broker)), opened => Effect.sync(opened.close))
  return railsLayerFrom(fallback, others, escrow?.rail)
})).pipe(Layer.provide(Layer.merge(StoreLayer, BrokerLive)))
const AppLive = Layer.mergeAll(StoreLayer, BrokerLive, RailsLayer, Erc8004Layer, GraphFromEnv(),
  AttestLive.pipe(Layer.provide(Layer.merge(StoreLayer, Erc8004Layer))))

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2), {
    status,
    headers: { "content-type": "application/json" }
  })

const newJobId = () => `job_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`

/**
 * Read `feeBps()` off a seller's splitter. `undefined` means "could not tell" — an
 * unreachable RPC, a non-contract address, or something that is not a splitter — which is
 * deliberately distinct from a value that disagrees.
 */
const SPLITTER_ABI = [
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint16" }] },
  { type: "function", name: "seller", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "treasury", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "version", stateMutability: "pure", inputs: [], outputs: [{ name: "", type: "uint8" }] }
] as const

export interface SplitterFacts {
  readonly feeBps: number
  readonly seller: string
  readonly treasury: string
  /** Whether the fee ultimately returns to the seller — read, never configured. */
  readonly treasuryIsSeller: boolean
  /**
   * `1` or `2`, read via `version()`. v1 has no such selector, so a call that reverts IS
   * the v1 signal — there is nothing further to distinguish "genuinely v1" from "reverted
   * for some other reason" without a second contract to compare against, and treating both
   * as v1 is the conservative direction: it only ever under-selects `settleWithTree`, never
   * calls a selector a v1 contract cannot serve.
   */
  readonly version: 1 | 2
}

const splitterFacts = async (address: string): Promise<SplitterFacts | undefined> => {
  try {
    const client = createPublicClient({ transport: http(process.env["ARCADE_RPC_URL"] ?? ARC_RPC_URL) })
    const read = <T>(fn: "feeBps" | "seller" | "treasury" | "version") =>
      client.readContract({ address: address as `0x${string}`, abi: SPLITTER_ABI, functionName: fn }) as Promise<T>

    // Sequential, spaced, and retried on -32011. Arc's public RPC answers
    // `request limit reached` to a burst, and a runner reconnect storm turns three reads
    // per handshake into exactly that — at which point every seller with a splitter would
    // be admitted unverified, since the read failing is the fail-open branch.
    const paced = async <T>(fn: "feeBps" | "seller" | "treasury" | "version"): Promise<T> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await read<T>(fn)
        } catch (e) {
          const m = String((e as Error)?.message ?? e).toLowerCase()
          const rateLimited = m.includes("request limit") || m.includes("-32011")
          if (!rateLimited || attempt >= 4) throw e
          await Bun.sleep(750 * 2 ** attempt)
        }
      }
    }

    const feeBps = Number(await paced<bigint | number>("feeBps"))
    await Bun.sleep(250)
    const seller = String(await paced<string>("seller"))
    await Bun.sleep(250)
    const treasury = String(await paced<string>("treasury"))

    // A separate try/catch from the block above: a revert here means "this is a v1
    // contract, which has no `version()` selector" — a fact about the contract, not an RPC
    // outage — and must not be conflated with the outer catch, which would otherwise throw
    // away the feeBps/seller/treasury reads that already succeeded.
    let version: 1 | 2 = 1
    try {
      await Bun.sleep(250)
      version = Number(await paced<bigint | number>("version")) === 2 ? 2 : 1
    } catch {
      version = 1
    }

    return {
      feeBps,
      seller,
      treasury,
      treasuryIsSeller: seller.toLowerCase() === treasury.toLowerCase(),
      version
    }
  } catch {
    return undefined
  }
}

const main = Effect.gen(function* () {
  const runtime = yield* Effect.runtime<StoreTag | BrokerTag | RailTag | RailsTag | Erc8004Tag | AttestTag | GraphTag>()
  const run = Runtime.runPromise(runtime)
  const store = yield* StoreTag
  const broker = yield* BrokerTag
  const rail = yield* RailTag
  const rails = yield* RailsTag
  const erc8004 = yield* Erc8004Tag
  const graph = yield* GraphTag

  // One read-only observer per hub lifetime. Discovery may use the observation;
  // no ENS lookup is awaited by the paid or settlement paths below.
  const ensReader = sepoliaEnsReader()
  const ensRoot = process.env["ARCADE_ENS_ROOT"]
  const ensIntervalMs = Number(process.env["ARCADE_ENS_CHECK_MS"] ?? 5 * 60_000)
  if (ensRoot !== undefined && ensRoot !== "" &&
    (!Number.isSafeInteger(ensIntervalMs) || ensIntervalMs < 1000 || ensIntervalMs > 2_147_483_647)) {
    throw new Error("ARCADE_ENS_CHECK_MS must be a whole number from 1000 to 2147483647")
  }
  const sameEnsPublication = (rec: ListingRecord, snapshot: EnsListingSnapshot): boolean =>
    rec.listing.id === snapshot.id && rec.seller.toLowerCase() === snapshot.seller.toLowerCase() &&
    rec.runnerId === snapshot.runnerId && rec.publishedAtMs === snapshot.publishedAtMs
  const ensWatch = makeEnsWatch({ root: ensRoot, reader: ensReader, log: line => console.log(line),
    sellerLabels: parseEnsSellerLabels(ensRoot ? process.env["ARCADE_ENS_SELLER_LABELS"] : undefined),
    isCurrent: snapshot => run(store.getListing(snapshot.id).pipe(Effect.either)).then(current =>
      current._tag === "Right" && sameEnsPublication(current.right, snapshot)),
    onResolved: (snapshot, name, isActive) => run(Effect.gen(function* () {
      // Keep the final read/check/write in one synchronous Store Effect sequence.
      // Never spread a pre-RPC record over newer canary, runner or identity evidence.
      const current = yield* store.getListing(snapshot.id).pipe(Effect.either)
      if (!isActive() || current._tag === "Left" || !sameEnsPublication(current.right, snapshot) || current.right.ensName === name) return
      yield* store.putListing({ ...current.right, ensName: name })
    }))
  })

  const canaryMaxPrice = (() => {
    try { return parsePrice(process.env["ARCADE_CANARY_MAX_PRICE"] ?? "$0.25") }
    catch {
      console.error("[hub] refusing to start: ARCADE_CANARY_MAX_PRICE is invalid")
      process.exit(2)
    }
  })()

  // Only an address is used by request gates. Never echo malformed private-key input.
  const canaryAddress = (() => {
    const key = process.env["ARCADE_CANARY_KEY"]
    if (key === undefined || key === "") return undefined
    try { return privateKeyToAccount(key as `0x${string}`).address }
    catch {
      console.error("[hub] refusing to start: ARCADE_CANARY_KEY is invalid")
      process.exit(2)
    }
  })()

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
  const configuredHubSecret = process.env["ARCADE_HUB_SECRET"]
  const hubSecret = configuredHubSecret ?? crypto.randomUUID() + crypto.randomUUID()
  const jobToken = (jobId: string): string =>
    createHmac("sha256", hubSecret).update(`arcade-job:${jobId}`).digest("hex").slice(0, 32)
  const jobTokenOk = (jobId: string, presented: string | null): boolean => timingSafeTokenOk(jobToken(jobId), presented)
  const sessions = makeSessions({ store, rails, chain: chainConfig })
  const handleSessionRoute = makeSessionRoutes({ sessions, rails, sessionStorage: store.sessionStorage, hubSecret, configuredHubSecret })
  const attester = yield* AttestTag
  const handleSessionCall = makeSessionCallRoutes({ store, broker, sessions, rails, chain: chainConfig, hubSecret,
    configuredHubSecret, publicOrigin, canaryAddress, attester, attestationArmed: erc8004.armed })
  const escrowScope = yield* Scope.make()
  let escrowClosing = false
  const escrowRoutes = makeEscrowRoutes({ store, rails, hubSecret, configuredHubSecret, publicOrigin, jobToken,
    attestation: (agentId, payTo, origin) => !erc8004.armed || chainConfig.erc8004 === undefined ? undefined : {
      agentId, payTo, origin, chainId: chainConfig.chainId, identityRegistry: chainConfig.erc8004.identity },
    start: async args => {
      if (escrowClosing) throw Error("escrow_unavailable")
      await run(runEscrowJob(args).pipe(
        Effect.onError(() => store.escrow!.uncertain(args.verified.context, args.jobId).pipe(Effect.catchAllCause(() => Effect.void))),
        Effect.catchAllCause(() => Effect.sync(() => console.error("[hub] escrow job requires reconciliation"))),
        Effect.forkIn(escrowScope)))
    } })
  // Stop new requests, await request-owned verification/relay cleanup, then interrupt
  // accepted jobs and await their uncertainty cleanup. Boot journal ownership encloses this.
  yield* Effect.addFinalizer(() => Effect.sync(() => { escrowClosing = true }).pipe(
    Effect.zipRight(Effect.promise(escrowRoutes.close)), Effect.zipRight(Scope.close(escrowScope, Exit.void))))
  const tokenFrom = (req: Request, url: URL): string | null =>
    req.headers.get("x-job-token") ?? url.searchParams.get("token")

  const sockets = new Map<object, { runnerId?: string }>()
  const socketHellos = new WeakMap<object, { sequence: number }>()
  const latestHellos = new Map<string, { token: { sequence: number }; socket: object; seller: string }>()
  const currentSockets = new Map<string, object>()
  const registrationLock = yield* Effect.makeSemaphore(1)
  let helloSequence = 0

  const server = Bun.serve<{ runnerId?: string; seller?: string }, never>({
    port: PORT,
    idleTimeout: 120,

    /*
     * An error boundary, so no future throw in any route can answer with Bun's fallback
     * page. That page embeds the error, the offending source lines and absolute filesystem
     * paths, and it is served to whoever made the request — which for an unauthenticated
     * route is anyone. One uncaught SyntaxError on /ratings was enough to publish hub
     * source from the live deployment. The detail goes to the log, where it belongs; the
     * caller gets a bare 500.
     */
    error(cause) {
      console.error("[hub] unhandled request error", cause)
      return json({ error: "internal" }, 500)
    },

    websocket: {
      open() {},
      async message(ws, raw) {
        /*
         * Parse inside the guard, not outside it.
         *
         * `Bun.serve`'s `error` boundary covers `fetch` and nothing else, so a throw here
         * became an unhandled rejection and took the process down — one malformed frame
         * from any unauthenticated client, since /ws accepts a socket before a Hello proves
         * anything. That is worse than the /ratings leak this is the twin of: it crashes
         * rather than merely tells. The decoder already answers a structurally wrong message
         * with the same Ack; a syntactically wrong one now gets it too.
         */
        let payload: unknown
        try {
          payload = JSON.parse(String(raw))
        } catch {
          ws.send(JSON.stringify({ _tag: "Ack", ok: false, detail: "bad message" }))
          return
        }
        const parsed = await run(decodeRunnerMessage(payload).pipe(Effect.either))
        if (parsed._tag === "Left") {
          ws.send(JSON.stringify({ _tag: "Ack", ok: false, detail: "bad message" }))
          return
        }
        const msg = parsed.right

        switch (msg._tag) {
          case "Hello": {
            if (ws.data.runnerId !== undefined && ws.data.runnerId !== msg.runnerId) {
              ws.send(JSON.stringify({ _tag: "Ack", ok: false, detail: "socket already authenticated as another runner" }))
              ws.close()
              return
            }
            const token = { sequence: ++helloSequence }
            socketHellos.set(ws.data, token)
            const socketIsCurrent = () => sockets.has(ws.data) && ws.readyState === 1 && socketHellos.get(ws.data) === token
            const helloIsCurrent = () => socketIsCurrent() && latestHellos.get(msg.runnerId)?.token === token
            const abandon = () => { if (socketHellos.get(ws.data) === token && ws.readyState === 1) ws.close() }
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
            if (!socketIsCurrent()) return

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

            // Reserve freshness only after signature/listing ownership checks. A slow
            // older verification cannot replace a more recent authenticated Hello.
            const currentRunner = await run(store.getRunner(msg.runnerId))
            if (!socketIsCurrent()) return
            const previous = latestHellos.get(msg.runnerId)
            if ((currentRunner !== undefined && currentRunner.seller.toLowerCase() !== msg.seller.toLowerCase()) ||
                (previous !== undefined && previous.seller !== msg.seller.toLowerCase())) {
              ws.send(JSON.stringify({ _tag: "Ack", ok: false, detail: "runner id already claimed" }))
              ws.close()
              return
            }
            if (previous !== undefined && previous.token.sequence > token.sequence) { abandon(); return }
            // One pending entry per socket, even if it sent overlapping Hello messages.
            for (const [runnerId, pending] of latestHellos) if (pending.socket === ws.data) latestHellos.delete(runnerId)
            latestHellos.set(msg.runnerId, { token, socket: ws.data, seller: msg.seller.toLowerCase() })

            // A splitter's `feeBps` is immutable, while receipts are computed from the
            // hub's `ARCADE_FEE_BPS`. Nothing tied them together, so they could drift and
            // a receipt would confidently state a split the chain did not perform — the
            // one number on the public page a judge can check against the contract.
            //
            // Fail-closed on a real mismatch, fail-OPEN on an unreachable RPC: a seller
            // should not be refused because Arc's public endpoint hiccuped, but a
            // contract that genuinely disagrees must not be allowed to produce receipts.
            let splitterInfo: SplitterFacts | undefined
            if (msg.feeSplitter !== undefined) {
              splitterInfo = await splitterFacts(msg.feeSplitter)
              const onChain = splitterInfo?.feeBps
              if (onChain !== undefined && onChain !== FEE_BPS) {
                console.error(
                  `[hub] rejected ${msg.runnerId}: splitter ${msg.feeSplitter} charges ` +
                    `${onChain}bps but this hub reports ${FEE_BPS}bps on receipts`
                )
                ws.send(
                  JSON.stringify({
                    _tag: "Ack",
                    ok: false,
                    detail:
                      `your fee splitter charges ${onChain}bps, this hub reports ${FEE_BPS}bps. ` +
                      "A receipt would state a split the chain did not perform. Deploy a " +
                      "splitter with matching feeBps, or point at a hub configured for yours."
                  })
                )
                ws.close()
                return
              }
              if (onChain === undefined) {
                console.warn(
                  // Widened rather than duplicated. When the contract cannot be read, BOTH
                  // checks fail open in the same breath: the split is unverified AND the
                  // payee was never compared to the announcing seller. Reporting only the
                  // first would announce the smaller uncertainty while the larger one
                  // exists, which is the failure the page's own disclosures exist to avoid.
                  `[hub] could not read ${msg.feeSplitter} on chain — accepting ${msg.runnerId}, ` +
                    "but BOTH its split and its payee are unverified: receipts state a fee " +
                    "this hub computed rather than one checked against the contract, and " +
                    "nothing confirmed the splitter pays the seller announcing it."
                )
              }

              /*
               * The splitter must pay the seller that announced it.
               *
               * `FeeSplitter.seller` is immutable, and `ARCADE_FEE_SPLITTER` is a runner
               * ENVIRONMENT variable read at `daemon.ts:135` — not part of the config. So
               * the two move independently: change `sellerAddress` and the announced
               * splitter does not follow. Without this comparison the handshake passes on
               * `feeBps` alone, the listings publish under the new seller, and every buyer
               * payment routes into a contract that pays the OLD one.
               *
               * That is not hypothetical here. The pilot splitter's `seller()` is
               * 0x3b2Bbb84…, an address whose key nobody holds — so repointing the runner
               * to a signable seller while leaving `ARCADE_FEE_SPLITTER` set would have
               * published listings naming one address while paying an unspendable other,
               * and every purchase in a recording would have landed somewhere unrecoverable.
               *
               * Two facts that must agree, one immutable on chain and one an environment
               * variable. The usual answer in this codebase is to delete the second copy;
               * here the on-chain copy is beyond anyone's reach to change, so the only
               * remaining move is to refuse the combination. `seller()` is already read for
               * the treasury disclosure, so this costs a comparison and no extra RPC.
               */
              const refusal = splitterRefusal(
                msg.seller,
                splitterInfo?.seller,
                msg.feeSplitter
              )
              if (refusal !== undefined) {
                console.error(`[hub] rejected ${msg.runnerId}: ${refusal}`)
                ws.send(JSON.stringify({ _tag: "Ack", ok: false, detail: refusal }))
                ws.close()
                return
              }
            }

            const announced = new Set(msg.listings.map(listing => listing.id))
            const agentClaims = await run(verifyAgentClaims(erc8004, msg.seller,
              (msg.agents ?? []).filter(claim => announced.has(claim.skillId))))
            if (!helloIsCurrent()) { abandon(); return }
            const conn: RunnerConn = {
              runnerId: msg.runnerId,
              seller: msg.seller,
              connectionId: ws.data,
              isCurrent: () => currentSockets.get(msg.runnerId) === ws.data && sockets.has(ws.data) && ws.readyState === 1,
              send: (m: HubMessage) => ws.send(JSON.stringify(m)),
              close: () => ws.close()
            }
            const accepted = await run(
              registrationLock.withPermits(1)(Effect.gen(function* () {
                if (!helloIsCurrent()) return false
                // Ownership may have changed while the RPC was awaited. Recheck inside
                // the same critical section as registration and socket-specific teardown.
                const records = yield* store.allListings
                if (records.some(record => announced.has(record.listing.id) && record.seller.toLowerCase() !== msg.seller.toLowerCase())) return false
                const previousSocket = currentSockets.get(msg.runnerId)
                const continuing = previousSocket === ws.data ? yield* store.getRunner(msg.runnerId) : undefined
                ws.data.runnerId = msg.runnerId
                ws.data.seller = msg.seller
                currentSockets.set(msg.runnerId, ws.data)
                // A replacement cannot inherit jobs assigned to another connection. A
                // same-socket refresh retains those jobs but replaces its serving set.
                if (previousSocket !== undefined && previousSocket !== ws.data) yield* broker.unregister(msg.runnerId)
                yield* store.removeListingsForRunner(msg.runnerId)
                yield* broker.register(conn, msg.listings.map((l) => l.id))
                yield* store.putRunner({
                  runnerId: msg.runnerId,
                  seller: msg.seller,
                  skillIds: msg.listings.map((l) => l.id),
                  maxConcurrency: msg.maxConcurrency,
                  connectedAtMs: Date.now(),
                  lastSeenMs: Date.now(),
                  activeJobs: continuing?.activeJobs ?? 0
                })
                for (const listing of msg.listings) {
                  yield* store.putListing({
                    listing,
                    seller: msg.seller,
                    ...agentClaims.get(listing.id),
                    // Carried per listing from the signed handshake, never from a global.
                    ...(msg.feeSplitter === undefined ? {} : { feeSplitter: msg.feeSplitter }),
                    ...(splitterInfo === undefined
                      ? { splitterVerified: msg.feeSplitter === undefined }
                      : {
                          treasuryIsSeller: splitterInfo.treasuryIsSeller,
                          splitterVerified: true,
                          splitterVersion: splitterInfo.version,
                          splitterFeeBps: splitterInfo.feeBps,
                          splitterNetwork: chainConfig.caip2
                        }),
                    runnerId: msg.runnerId,
                    publishedAtMs: Date.now()
                  })
                }
                return true
              }))
            )
            if (!accepted) { abandon(); return }
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
            await run(registrationLock.withPermits(1)(Effect.gen(function* () {
              const rid = ws.data.runnerId
              // Runner IDs survive reconnects; authority to finish jobs does not.
              if (rid === undefined || currentSockets.get(rid) !== ws.data || !sockets.has(ws.data)) return
              const owner = yield* broker.runnerForJob(msg.jobId)
              if (owner === undefined || owner !== rid) {
                console.error(`[hub] dropped JobResult for ${msg.jobId} from ${rid} (assigned to ${owner ?? "nobody"})`)
                return
              }
              yield* broker.complete(msg.jobId, msg.outcome)
            })))
            break
          }
          case "EscrowBudgetSigned":
          case "EscrowSubmitSigned":
          case "EscrowAuthorizationRefused": {
            await run(registrationLock.withPermits(1)(Effect.gen(function* () {
              const rid = ws.data.runnerId
              if (rid === undefined || currentSockets.get(rid) !== ws.data || !sockets.has(ws.data)) return
              if (broker.escrow) yield* Effect.promise(() => broker.escrow!.accept(ws.data, msg))
            })))
            break
          }
          case "Heartbeat": {
            // Same principle: a socket may only speak for the runner it authenticated as.
            await run(registrationLock.withPermits(1)(Effect.gen(function* () {
              if (ws.data.runnerId !== msg.runnerId || currentSockets.get(msg.runnerId) !== ws.data || !sockets.has(ws.data)) return
              yield* store.touchRunner(msg.runnerId, msg.activeJobs)
            })))
            break
          }
          case "JobLog": {
            console.log(`[job ${msg.jobId}] ${msg.line}`)
            break
          }
        }
      },
      async close(ws) {
        // Mark closed BEFORE awaiting cleanup, so a pending ownerOf cannot resurrect it.
        sockets.delete(ws.data)
        socketHellos.delete(ws.data)
        for (const [runnerId, pending] of latestHellos) if (pending.socket === ws.data) latestHellos.delete(runnerId)
        const rid = ws.data.runnerId
        if (rid !== undefined) {
          await run(
            registrationLock.withPermits(1)(Effect.gen(function* () {
              // The old socket may close after its replacement has registered this ID.
              if (currentSockets.get(rid) !== ws.data) return
              currentSockets.delete(rid)
              yield* broker.unregister(rid)
              yield* store.dropRunner(rid)
              yield* store.removeListingsForRunner(rid)
              console.log(`[hub] runner ${rid} offline`)
            }))
          )
        }
      }
    },

    async fetch(req) {
      return browserCors.handle(req, async () => {
      const url = new URL(req.url)
      const path = url.pathname

      const escrowBudgetResponse = await escrowRoutes.budget(req)
      if (escrowBudgetResponse !== undefined) return escrowBudgetResponse
      const sessionResponse = await handleSessionRoute(req)
      if (sessionResponse !== undefined) return sessionResponse
      const sessionCallResponse = await handleSessionCall(req)
      if (sessionCallResponse !== undefined) return sessionCallResponse

      if (path === "/ws") {
        const data = {}
        sockets.set(data, data)
        if (server.upgrade(req, { data })) return undefined as unknown as Response
        return new Response("expected websocket", { status: 400 })
      }

      if (path === "/healthz") return json({ ok: true, rail: rail.name, rails: rails.names, network: ARC_CAIP2,
        ...(escrowBoot === undefined || rails.escrow === undefined ? {} : { erc8183: escrowBoot.identity }) })

      // ---- the marketplace page ----------------------------------------------
      // Statistics are computed per listing rather than stored, so the page cannot show a
      // number the receipts do not support.
      const pageData = async (evidenceForSkill?: string) => {
        const records = await run(store.allListings)
        const receipts = await run(store.allReceipts)
        const listings = await Promise.all(
          records.map(async rec => {
            const { listing, seller, treasuryIsSeller, splitterVerified, feeSplitter, payTested, delisted } = rec
            const stats = await run(store.statsFor(listing.id))
            const ratings = await run(store.ratingsFor(listing.id))
            // Only a requested detail page needs identity evidence. The catalog/feed
            // must not fan out ownerOf/evidence reads across every listing on each poll.
            const identity = evidenceForSkill === listing.id ? await run(listingEvidence(rec, erc8004, chainConfig, rail.name)) : undefined
            return {
              listing,
              seller,
              treasuryIsSeller,
              splitterVerified,
              feeSplitter,
              agentId: rec.agentId,
              registrationTx: rec.registrationTx,
              agentVerified: identity?.verified === true,
              evidence: identity?.stale === false ? { validationPasses: identity.validationPasses!,
                validationsRead: identity.validationsRead!, settlementFeedback: identity.settlementFeedback!, stale: false } : undefined,
              ...(payTested === undefined ? {} : { payTested }),
              delisted: delisted === true,
              ...(() => {
                const skip = payTestSkipReason(listing, canaryMaxPrice)
                return skip === null ? {} : { payTestSkip: skip }
              })(),
              stats,
              ratingCount: ratings.length,
              ratingAverage:
                ratings.length === 0
                  ? null
                  : ratings.reduce((a, r) => a + r.stars, 0) / ratings.length
            }
          })
        )
        return {
          listings,
          receipts,
          rail: rail.name,
          network: ARC_CAIP2,
          feeBps: FEE_BPS,
          // Derived per listing from the announced contract — never a process-wide flag.
          treasuryIsSeller: listings.some((l) => l.treasuryIsSeller === true)
        }
      }

      if (path === "/") {
        const d = await pageData()
        return new Response(renderIndex({ ...d, listings: d.listings.filter((listing) => !listing.delisted) }), {
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      }

      // Feeds the 4s poll. Returning rendered fragments rather than raw rows keeps the
      // markup in one place — the client swaps innerHTML and never re-implements a row.
      if (path === "/_feed") {
        const d = await pageData()
        const visible = d.listings.filter((listing) => !listing.delisted)
        return json({
          listings: renderListingRows(visible),
          receipts: renderReceiptRows(d.receipts),
          meta: renderMeta({ ...d, listings: visible }),
          total: d.receipts.length
        })
      }

      const skillPage = /^\/skill\/([a-z0-9-]+)$/.exec(path)
      if (skillPage !== null) {
        const d = await pageData(skillPage[1])
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
        const origin = publicOrigin(url)
        const discovery = {
          listings: path === "/skill.md" ? listings : await run(prepareDiscoveryListings(rails, listings, origin, record => {
            const name = record.ensName
            // No new ENS read here: do not turn a configured label, expired name,
            // or another publication's persisted observation into provider identity.
            if (name === undefined || ensWatch.isExpired(record.listing.id, record.seller) ||
              name !== ensWatch.nameFor({ id: record.listing.id, seller: record.seller,
                runnerId: record.runnerId, publishedAtMs: record.publishedAtMs })) return undefined
            return name.slice(name.indexOf(".") + 1)
          })),
          origin,
          rail: rail.name,
          rails: rails.names,
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
        const all = (await run(store.allListings)).filter((record) => record.delisted !== true)
          .filter(record => !ensWatch.isExpired(record.listing.id, record.seller))
        const indexed = await run(graphEvidenceOf(graph, all.map(record => record.listing.id)))
        return json(all.map(r => {
          const evidence = indexed.get(r.listing.id)
          const ensName = ensWatch.nameFor({ id: r.listing.id, seller: r.seller })
          const test = r.payTested
          const reference = test?.settleTx
          const publicReference = test?.ok === true && typeof reference === "string" &&
            /^0x[0-9a-fA-F]{64}$/.test(reference) && !/^0x0{64}$/.test(reference) ? reference : undefined
          // Catalog evidence is store-derived, not a new pay-test. Null means no
          // recorded history; older hubs can still omit this metadata entirely.
          // Redact the job ID; this summary carries no locator or explorer authority.
          const payTested = test === undefined ? null : { atMs: test.atMs, ok: test.ok, jobId: "",
            ...(publicReference === undefined ? {} : { settleTx: publicReference }) }
          return { ...r.listing, seller: r.seller, payTested, delisted: r.delisted === true,
            ...(evidence === undefined ? {} : { graph: evidence }),
            ...(ensName === undefined ? {} : { ensName }) }
        }))
      }

      const nameMatch = /^\/names\/([^/]+)$/.exec(path)
      if (nameMatch !== null && req.method === "GET") return handleNames(ensReader, nameMatch[1]!)

      // Explicit public projection: no signing keys, provider configuration, or clients.
      if (path === "/erc8004" && req.method === "GET") {
        return json(erc8004.armed ? {
          armed: true,
          chainId: chainConfig.chainId,
          caip2: chainConfig.caip2,
          registries: {
            identity: erc8004.registries.identity,
            reputation: erc8004.registries.reputation,
            validation: erc8004.registries.validation
          },
          operator: erc8004.addresses.operator,
          validator: erc8004.addresses.validator,
          attester: erc8004.addresses.attester
        } : { armed: false, chainId: chainConfig.chainId, caip2: chainConfig.caip2 })
      }

      const registrationMatch = /^\/listings\/([a-z0-9-]+)\/agent-registration\.json$/.exec(path)
      if (registrationMatch !== null && req.method === "GET") {
        const result = await run(store.getListing(registrationMatch[1]!).pipe(Effect.either))
        if (result._tag === "Left" || chainConfig.erc8004 === undefined) return json({ error: "not_found" }, 404)
        const doc = agentRegistrationFor({
          rec: result.right,
          runner: await run(store.getRunner(result.right.runnerId)),
          origin: publicOrigin(url),
          chainId: chainConfig.chainId,
          identityRegistry: chainConfig.erc8004.identity,
          nowMs: Date.now()
        })
        // The compact served bytes are exactly the bytes committed by docHash.
        return new Response(docBytes(doc), {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=30" }
        })
      }

      const listingMatch = /^\/listings\/([a-z0-9-]+)$/.exec(path)
      if (listingMatch !== null && req.method === "GET") {
        const res = await run(store.getListing(listingMatch[1]!).pipe(Effect.either))
        if (res._tag === "Left") return json({ error: "not_found" }, 404)
        const stats = await run(store.statsFor(listingMatch[1]!))
        const ratings = await run(store.ratingsFor(listingMatch[1]!))
        const avg =
          ratings.length === 0 ? null : ratings.reduce((a, r) => a + r.stars, 0) / ratings.length
        const identity = await run(listingEvidence(res.right, erc8004, chainConfig, rail.name))
        const indexed = (await run(graphEvidenceOf(graph, [res.right.listing.id]))).get(res.right.listing.id)
        return json({ ...res.right.listing, seller: res.right.seller, stats, ratings: { count: ratings.length, average: avg },
          ...(indexed === undefined ? {} : { graph: indexed }),
          ...(identity === undefined ? {} : { erc8004: identity }),
          ensName: ensWatch.nameFor({ id: res.right.listing.id, seller: res.right.seller }) ?? null,
          ensExpired: ensWatch.isExpired(res.right.listing.id, res.right.seller),
          delisted: res.right.delisted === true, payTested: res.right.payTested ?? null,
          payTestHistory: await run(store.payTestHistory(res.right.listing.id, res.right.seller)) })
      }

      const listingReceipts = /^\/listings\/([a-z0-9-]+)\/receipts$/.exec(path)
      if (listingReceipts !== null && req.method === "GET") {
        const limit = receiptLimit(url.searchParams)
        if (limit === null) return json({ error: "ambiguous_limit" }, 400)
        // Historical receipt evidence survives listing disconnection; no job tokens,
        // private output or reconstructed parent/child edges are exposed here.
        return json(listingReceiptFeed(await run(store.allReceipts), listingReceipts[1]!, limit))
      }

      if (path === "/graph/stats" && req.method === "GET") {
        const payload = await run(graphStatsPayload(graph, store.allReceipts.pipe(Effect.map(receipts => {
          const settled = receipts.filter(receipt => receipt.settled)
          return { settlementCount: settled.length, settledVolumeAtomic: settled.reduce((sum, receipt) => sum + receipt.priceAtomic, 0n) }
        }))).pipe(Effect.exit))
        return payload._tag === "Success" ? json(payload.value) : json({ error: "graph_stats_unavailable" }, 503)
      }

      if (path === "/stats" && req.method === "GET") {
        const source = await run(store.statsSource)
        const stats = publicStats(await run(store.allListings), await run(store.allReceipts), source)
        return stats === undefined ? json({ error: "stats_unavailable" }, 503) : json(stats)
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

      const sellerSummaryMatch = /^\/sellers\/(0x[a-fA-F0-9]{40})\/summary$/.exec(path)
      if (sellerSummaryMatch !== null && req.method === "GET") {
        const seller = sellerSummaryMatch[1]!
        if (/^0x0{40}$/.test(seller)) return json({ error: "not_found" }, 404)
        // Deliberately public derived economics, with no private receipt handles. Use
        // complete raw ledger inputs locally: the public feed removes payer/lineage data
        // needed to distinguish known spend from unavailable funding attribution.
        const result = await run(Effect.gen(function* () {
          const listings = yield* store.allListings
          const receipts = yield* store.allReceipts
          const runners = yield* store.allRunners
          return yield* Effect.try({
            try: () => sellerSummary(seller, listings, receipts, runners, Date.now()),
            catch: error => error instanceof SellerSummaryUnavailable ? error : new SellerSummaryUnavailable()
          })
        }).pipe(Effect.exit))
        // Store defects and the named accounting refusal share a fixed public response;
        // neither provider/storage diagnostics nor private job IDs reach the caller.
        return result._tag === "Failure" ? json({ error: "seller_summary_unavailable" }, 503) : json(result.value)
      }

      if (path === "/receipts" && req.method === "GET") {
        const receipts = await run(store.allReceipts)
        // The same explicit privacy whitelist as the per-listing feed.
        return json(receipts.map(scrubReceipt))
      }

      // Public hash-only documents survive runner disconnection and hub restart. Never
      // rebuild from current listing/output state or expose the private job payload here.
      const documentMatch = /^\/receipts\/([A-Za-z0-9_-]{1,256})\/(validation-request|validation-response|feedback)\.json$/.exec(path)
      if (documentMatch !== null && req.method === "GET") {
        const kind = documentMatch[2] as "validation-request" | "validation-response" | "feedback"
        const bytes = await run(store.getErc8004Doc(documentMatch[1]!, kind))
        return bytes === undefined ? json({ error: "not_found" }, 404) : new Response(bytes, {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=31536000, immutable" }
        })
      }

      const jobMatch = /^\/jobs\/([A-Za-z0-9_]+)$/.exec(path)
      if (jobMatch !== null && req.method === "GET") {
        const jobId = jobMatch[1]!
        if (!jobTokenOk(jobId, tokenFrom(req, url))) return sessionRefusal("not_found", 404)
        const job = await run(store.getJob(jobId))
        if (job === undefined) return json({ error: "not_found" }, 404)
        // `input` is deliberately absent: the buyer already has it, and nobody else should.
        const { input: _input, ...rest } = job
        return json({ ...rest, priceAtomic: rest.priceAtomic.toString() })
      }

      if (path === "/ratings" && req.method === "POST") {
        // `await req.json()` throws on any non-JSON body, and this is the route's first
        // statement — no payment, signature or token needed to reach it. The `/x/` route
        // above already has the right shape; this one never got it.
        const raw = await req.text()
        let body: { jobId?: string; stars?: number; comment?: string; signature?: string }
        try {
          const parsed: unknown = raw === "" ? {} : JSON.parse(raw)
          // `null`, `3` and `[]` are all valid JSON and none of them has fields. Reading
          // `.jobId` off the first two throws, which is the same 500 the malformed case
          // used to produce — a parse that succeeds is not yet a body.
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return json({ error: "invalid_body" }, 400)
          }
          body = parsed as typeof body
        } catch {
          return json({ error: "invalid_body" }, 400)
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

        let rawBody: string
        try { rawBody = await readOrdinaryBody(req) }
        catch { return json({ error: "input_invalid" }, 400) }
        let input: unknown
        try {
          input = rawBody === "" ? {} : JSON.parse(rawBody)
        } catch {
          return json({ error: "input_invalid", detail: "body is not JSON" }, 400)
        }
        const gate = inputGate(listing, input)
        if (gate !== null) return json(gate, 400)

        const header =
          req.headers.get(HEADER_PAYMENT_SIGNATURE) ?? req.headers.get(HEADER_PAYMENT_LEGACY)
        // Canonical position 2: no signed stranger proceeds to lineage or verification.
        // A genuinely headerless probe may ONLY get a challenge when a canary exists;
        // the standard buyer needs that 402 before it can prove its identity. It never
        // creates a reservation or job. Claims are rechecked against verified.payer below.
        if (!(header === null && canaryAddress !== undefined)) {
          const refusal = delistRefusal(found.right, claimedPayerOf(req), canaryAddress)
          if (refusal !== null) return json(refusal, 403)
        }

        const priceAtomic = parsePrice(listing.price)
        const resource = `${publicOrigin(url)}${path}`

        // Lineage is verified before the payment challenge: a probe carrying a forged or
        // expired capability is refused here, before it costs the caller a 402 round trip
        // it could never complete honestly.
        const maxHop = maxHopFromEnv(process.env["ARCADE_MAX_HOP"])
        const lineageE = await run(
          resolveLineage(store, hubSecret, req.headers.get(HIRE_CAPABILITY_HEADER), listing, Date.now(), maxHop).pipe(
            Effect.either
          )
        )
        if (lineageE._tag === "Left") {
          const e = lineageE.left
          const code =
            e._tag === "LineageCycle" ? "lineage_cycle" : e._tag === "LineageDepth" ? "lineage_depth" : "lineage_invalid"
          return json(
            {
              error: code,
              detail:
                e._tag === "LineageInvalid"
                  ? e.reason
                  : e._tag === "LineageCycle"
                    ? `${e.skillId} is already in this call tree`
                    : `hop ${e.hop} exceeds max ${e.max}`
            },
            402
          )
        }
        const lineage0 = lineageE.right

        let escrowContext: ReturnType<typeof escrowListingChallenge>["challenge"]["escrow"]
        if (rails.escrow && lineage0.hop === 0 && !found.right.delisted && !url.search && callMatch[1]!.toLowerCase() === seller.toLowerCase()) {
          try { escrowContext = escrowListingChallenge(found.right, input, resource).challenge.escrow }
          catch { /* An unverified/not-opted-in listing cannot advertise escrow. */ }
        }
        const choices = await run(challengeChoices(rails, listing, {
          priceAtomic, resource, payTo: seller, description: listing.description,
          ...(escrowContext === undefined ? {} : { escrow: escrowContext }),
          ...(found.right.feeSplitter === undefined ? {} : { feeSplitter: found.right.feeSplitter }),
          ...(found.right.splitterVersion === undefined ? {} : { feeSplitterVersion: found.right.splitterVersion })
        }, { child: lineage0.hop > 0 }))

        if (header === null) {
          return json(
            { x402Version: 2, error: choices.length === 0 ? "unsupported_rail" : "payment required",
              resource: { url: resource, description: listing.description, mimeType: "application/json" },
              rail: rail.name, accepts: choices.map(choice => choice.requirements) },
            402
          )
        }

        const raw = await run(Effect.try(() => decodeHeaderJson(header)).pipe(Effect.either))
        if (raw._tag === "Left") return json({ error: "malformed payment header" }, 400)
        const name = paymentRailName(raw.right)
        if (name === "malformed") return json({ error: "malformed payment header" }, 400)
        const chosen = choices.find(choice => choice.rail.name === name || name === "eip3009" && choice.rail.name === "test")
        if (chosen === undefined) return json({ error: "unsupported_rail" }, 402)
        if (chosen.kind === "escrow") return escrowRoutes.root(req, input, raw.right)
        const decoded = await run(Schema.decodeUnknown(PaymentPayload)(raw.right).pipe(Effect.either))
        if (decoded._tag === "Left") return json({ error: "malformed payment header" }, 400)
        const { rail: selectedRail, requirements } = chosen
        if (!matchesRequirements(decoded.right.accepted, requirements)) return json({ error: "payment_invalid", detail: "requirements_mismatch" }, 402)
        const verifiedE = await run(selectedRail.verify(decoded.right, requirements).pipe(Effect.either))
        if (verifiedE._tag === "Left") {
          return json({ error: "payment_invalid", detail: verifiedE.left._tag }, 402)
        }
        const verified = verifiedE.right

        // A claimed canary address grants no execution authority. Only the payer proved
        // by the rail may buy a delisted listing, before any job or budget side effect.
        const refusal = delistRefusal(found.right, verified.payer, canaryAddress)
        if (refusal !== null) return json(refusal, 403)
        const isCanary = canaryAddress !== undefined && verified.payer.toLowerCase() === canaryAddress.toLowerCase()

        const jobId = newJobId()


        // The probe (no payment header) returned above and never reaches here — the tree
        // reservation happens only on the paid retry, after `rail.verify`, so a refusal
        // never broadcasts and a probe never holds budget.
        const lineage = lineage0.hop === 0 ? ROOT_LINEAGE(jobId) : lineage0
        if (lineage.hop > 0) {
          const root = await run(store.getJob(lineage.rootJobId))
          const rootListing =
            root === undefined ? undefined : await run(store.getListing(root.skillId).pipe(Effect.either))
          const ceiling =
            rootListing !== undefined && rootListing._tag === "Right"
              ? ceilingAtomicFor(rootListing.right.listing.bounds.maxSubSpendUsd)
              : 0n
          const ok = await run(store.reserveTree(lineage.rootJobId, jobId, priceAtomic, ceiling))
          if (!ok) {
            return json({ error: "tree_budget_exceeded", detail: `this call tree's ceiling is ${formatPrice(ceiling)}` }, 402)
          }
        }

        /*
         * Claim the authorization — after every refusal that creates no job, and before any
         * work is dispatched.
         *
         * `rail.verify` asks the chain whether this nonce has been used, and until this job
         * settles the honest answer is no — for the original request and for every copy of
         * its PAYMENT-SIGNATURE header sent in the same window. So a captured header could
         * be replayed to dispatch N jobs, the seller's agent would run N times, and exactly
         * one settle would land: the seller pays for N inference runs and is paid once. The
         * chain cannot close that window. Only the hub can, by claiming the authorization
         * when it accepts one rather than when it settles.
         *
         * The claim is keyed on the authorization's own identity — network, payer, nonce —
         * which is what USDC itself makes single use, so it is scoped no more narrowly than
         * the thing it protects. A replay against a DIFFERENT listing by the same seller is
         * refused too, which is correct: one signature authorizes one payment.
         *
         * POSITION MATTERS, and it is why this sits here rather than beside `rail.verify`.
         * A claim is never released, so claiming before the tree-budget check would burn a
         * legitimate authorization on a request that was then refused with 402 and produced
         * no job at all — the buyer would have to re-sign for nothing. Every refusal that
         * creates no job now happens above this line; below it, the job row is written and
         * dispatched.
         */
        const claimed = await run(store.claimAuthorization(
          [verified.network, verified.payer.toLowerCase(), verified.payload.payload.authorization.nonce.toLowerCase()].join("|"),
          jobId
        ))
        if (!claimed) {
          // A child reserved budget a few lines up and is now refused, so hand it back —
          // a refusal that creates no job must not hold a root's ceiling. `releaseTree` is
          // the same call the pipeline's terminal branches make, and is a no-op for a root.
          if (lineage.hop > 0) await run(store.releaseTree(jobId))
          return json({
            error: "authorization_already_used",
            detail: "this payment authorization has already been accepted for a job. It authorizes one " +
              "payment, and settlement may still be in flight. Sign a fresh authorization to buy again."
          }, 402)
        }

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
              createdAtMs: Date.now(),
              rootJobId: lineage.rootJobId,
              ...(lineage.parentJobId === undefined ? {} : { parentJobId: lineage.parentJobId }),
              hop: lineage.hop,
              ancestors: lineage.ancestors
            })
          )
        )

        // Minted only when this listing may hire sub-skills — a proxy check the runner still
        // gates for real behind the private `hire-skills` capability. Expiry gives a child
        // job's own timeout budget plus slack for dispatch latency.
        const mayHire = (listing.bounds.maxSubSpendUsd ?? 0) > 0
        const hireCapability = mayHire
          ? mintHireCapability(hubSecret, jobId, Date.now() + (listing.bounds.timeoutSec + 60) * 1000)
          : undefined

        // 202 immediately: real skills take seconds to minutes, so the request cannot block.
        const accrualId = `acc_${new Date().toISOString().slice(0, 10)}`
        void run(
          runJob({
            jobId,
            listing,
            seller,
            input,
            verified,
            rail: selectedRail,
            feeBps: FEE_BPS,
            accrualId,
            lineage,
            // Only ownership-verified, real-rail jobs may become registry evidence.
            // The asynchronous worker rechecks current ownership before broadcasting.
            ...(selectedRail.name === "test" || !erc8004.armed || found.right.agentVerified !== true ||
                found.right.agentId === undefined || chainConfig.erc8004 === undefined ? {} : {
              attest: { agentId: found.right.agentId, payTo: requirements.payTo,
                origin: publicOrigin(url), chainId: chainConfig.chainId, identityRegistry: chainConfig.erc8004.identity }
            }),
            ...(isCanary ? { canary: true } : {}),
            ...(hireCapability === undefined ? {} : { hireCapability })
          }).pipe(
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

        const accepted = json(
          {
            job_id: jobId,
            status: "queued",
            poll_url: `${browserCors.publicOrigin ?? url.origin}/jobs/${jobId}/result?token=${jobToken(jobId)}`,
            // The capability to read this job's result. Held only by whoever paid for it.
            job_token: jobToken(jobId),
            price: formatPrice(priceAtomic)
          },
          202
        )
        accepted.headers.set("cache-control", "private, no-store")
        return accepted
      }

      // Long-poll for a job result.
      const resultMatch = /^\/jobs\/([A-Za-z0-9_]+)\/result$/.exec(path)
      if (resultMatch !== null && req.method === "GET") {
        const jobId = resultMatch[1]!
        if (!jobTokenOk(jobId, tokenFrom(req, url))) return sessionRefusal("not_found", 404)
        const retrieval = ordinaryReadScope(req.signal)
        const resultJson = (body: unknown, status = 200) => {
          const response = json(body, status); response.headers.set("cache-control", "private, no-store"); return response
        }
        try {
        const deadline = Date.now() + 120_000
        while (Date.now() < deadline) {
          const receipts = await retrieval.read(signal => run(store.allReceipts, { signal }))
          const receipt = receipts.find((r) => r.jobId === jobId)
          if (receipt !== undefined) {
            const job = await retrieval.read(signal => run(store.getJob(jobId), { signal }))
            // The payload is released only against a SETTLED receipt. Previously a receipt
            // merely EXISTING was enough — and the pipeline writes one on every terminal
            // outcome, settled or not. So a job whose settlement failed still handed over
            // the work: the seller produced it, the buyer received it, nobody paid. D2 says
            // On the authorization-only legacy path a failed job leaves the buyer's
            // balance untouched; it has to also leave the
            // buyer without the goods, or "non-settlement is the refund" is a transfer.
            // Escrow has already funded a contract: only confirmed refund proves
            // money returned, and uncertainty must never use the legacy fallback.
            const escrowResult = escrowResultDelivery(receipt, job)
            if (escrowResult?.kind === "unavailable") return resultJson({ error: "escrow_evidence_unavailable" }, 503)
            const delivered = escrowResult === undefined ? receipt.settled === true : escrowResult.kind === "delivered"
            return resultJson({
              job_id: jobId,
              status: job?.outcome?.status ?? (receipt.settled ? "succeeded" : "failed"),
              result: escrowResult?.kind === "delivered" ? escrowResult.output : delivered ? (job?.outcome?.output ?? null) : null,
              ...(delivered
                ? {}
                : {
                    /*
                     * "You were not charged" is a claim about the chain, so only make it when
                     * this hub actually knows. A receipt carrying `unresolvedSettleTx` is one
                     * where settlement was broadcast and its outcome could not be read; the
                     * buyer may well have paid. Withholding the output is still right — an
                     * unconfirmed payment is not a confirmed one — but the buyer is owed the
                     * reference rather than a false reassurance.
                     */
                    detail: escrowResult?.kind === "withheld" ? escrowResult.detail : job?.outcome?.error ??
                      (receipt.unresolvedSettleTx === undefined
                        ? "not settled — you were not charged, and no result is released"
                        : `settlement unconfirmed — transaction ${receipt.unresolvedSettleTx} was broadcast and ` +
                          "this hub could not read its receipt, so whether you were charged is unknown. " +
                          "No result is released until it is confirmed. Check that transaction on the chain.")
                  }),
              receipt: {
                ...receipt,
                priceAtomic: receipt.priceAtomic.toString(),
                sellerAtomic: receipt.sellerAtomic.toString(),
                feeAtomic: receipt.feeAtomic.toString(),
                price: formatPrice(receipt.priceAtomic),
                sellerShare: formatPrice(receipt.sellerAtomic),
                fee: formatPrice(receipt.feeAtomic),
                explorer: receiptExplorer(receipt),
                treeCeilingAtomic: receipt.treeCeilingAtomic?.toString(),
                treeCommittedAtomic: receipt.treeCommittedAtomic?.toString(),
                children: receipt.children?.map((c) => ({
                  ...c,
                  priceAtomic: c.priceAtomic.toString(),
                  explorer: receiptChildExplorer(receipt, c)
                }))
              }
            })
          }
          await retrieval.read(signal => run(Effect.sleep(300), { signal }))
        }
        return resultJson({ job_id: jobId, status: "pending" }, 202)
        } catch {
          return retrieval.expired() && !req.signal.aborted ? resultJson({ job_id: jobId, status: "pending" }, 202)
            : resultJson({ error: "result_unavailable" }, 503)
        } finally { retrieval.close() }
      }

      if (path === "/trees" || path.startsWith("/trees/")) {
        const treeJson = (body: unknown, status = 200) => {
          const response = json(body, status)
          response.headers.set("cache-control", "private, no-store")
          return response
        }
        const treeMatch = /^\/trees\/(job_[A-Za-z0-9]{16,128})$/.exec(path)
        if (req.method !== "GET" || treeMatch === null) return treeJson({ error: "not_found" }, 404)
        const rootJobId = treeMatch[1]!
        // Root capability only, checked before any ledger read. The builder also
        // refuses to promote a child with its own otherwise-valid job capability.
        if (!jobTokenOk(rootJobId, tokenFrom(req, url))) return treeJson({ error: "not_found" }, 404)
        const retrieval = ordinaryReadScope(req.signal, 10000)
        try {
        const result = await retrieval.read(signal => run(store.allReceipts.pipe(
          Effect.map(receipts => buildTreeView(rootJobId, receipts)),
          Effect.exit
        ), { signal }))
        if (result._tag === "Failure") return treeJson({ error: "tree_unavailable" }, 503)
        if (result.value === undefined) return treeJson({ error: "not_found" }, 404)
        return treeJson(result.value)
        } catch { return treeJson({ error: "tree_unavailable" }, 503) }
        finally { retrieval.close() }
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
      })
    }
  })

  let stopEns = () => {}
  yield* Effect.addFinalizer(() => Effect.sync(() => { stopEns(); server.stop(true) }))
  if (ensRoot !== undefined && ensRoot !== "") {
    stopEns = ensWatch.start(ensIntervalMs, () => run(store.allListings).then(all => all.map(rec => ({
      id: rec.listing.id, seller: rec.seller, runnerId: rec.runnerId, publishedAtMs: rec.publishedAtMs
    }))))
  }
  // Use the actual bound port, including PORT=0, unless the operator advertises a public
  // origin. The buyer uses ordinary HTTP and remains within this application's scope.
  const canary = (() => {
    try { return canaryFromEnv(process.env["ARCADE_PUBLIC_URL"] ?? `http://127.0.0.1:${server.port}`, rail.name) }
    catch (error) {
      // canaryFromEnv errors contain only fixed field-specific diagnostics, never values.
      console.error(`[hub] refusing to start: ${error instanceof Error ? error.message : "invalid canary configuration"}`)
      process.exit(2)
    }
  })()
  if (canary !== undefined) yield* Effect.forkScoped(canaryLoop(canary))

  console.log(`[hub] ARCADE listening on :${server.port}  rail=${rail.name}  network=${ARC_CAIP2}  fee=${FEE_BPS}bps`)
  yield* Effect.never
})

if (escrowBoot === undefined) {
  Effect.runPromise(Effect.scoped(main.pipe(Effect.provide(AppLive)))).catch((e) => {
    console.error(e)
    process.exit(1)
  })
} else {
  // Armed escrow owns actual process shutdown, not only an in-memory Scope.
  // Journal release follows request/fiber interruption and bounded action cleanup.
  const shutdown = new AbortController(), stop = () => shutdown.abort()
  /*
   * Defense in depth for the class. Bun.serve's `error` boundary covers `fetch` only, so a
   * throw anywhere else async — a socket handler, a timer, a background task — would exit
   * the process and take every connected runner's listings with it. A public hub should
   * log and keep serving instead. This is a net, not a license: anything caught here is a
   * defect worth fixing at its source, which is why it logs loudly.
   */
  process.on("unhandledRejection", (reason) => console.error("[hub] unhandled rejection", reason))
  process.on("uncaughtException", (error) => console.error("[hub] uncaught exception", error))
  process.on("SIGINT", stop); process.on("SIGTERM", stop)
  // The application scope is INSIDE layer provision. With an outer application
  // scope, the inner layer scope closed its journal before the application's
  // request/job finalizers. Repeated signals keep awaiting the same cleanup.
  void Effect.runPromiseExit(Effect.scoped(main).pipe(Effect.provide(AppLive)), { signal: shutdown.signal }).then(exit => {
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop)
    const failed = Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause)
    if (failed) console.error("[hub] escrow startup or runtime unavailable")
    process.exit(failed ? 1 : 0)
  })
}

export { JobOutcome }

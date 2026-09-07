/** Strict opt-in CLI. Files and keys are consumed only by an explicit invocation. */
import { Effect, Exit } from "effect"
import { docBytes, parsePrice } from "@arcade/core"
import { callSkill } from "./index.ts"
import { captureCliArgv } from "./gateway-funding-cli.ts"
import { looksLikeEnsName, parseArcadeEndpoint, type EnsReader } from "./ens-policy.ts"
import { escrowAddress, escrowCheck } from "../../payments/src/erc8183-codec.ts"
import { readEscrowBuyerBoot, openEscrowBuyerPurchase, escrowBuyerAccount, escrowGasAtomic } from "./erc8183-private.ts"
const fail = () => Error("escrow_buyer_input_invalid")
export function parseEscrowBuyerCommand(raw: readonly string[]) {
  try {
    const args = captureCliArgv(raw)
    if (args.length === 3 && args[0] === "--rail" && args[1] === "erc8183" && args[2] === "--help") return Object.freeze({ kind: "help" as const })
    const byName = args[0] === "--name", flags: Record<string, string> = Object.create(null), skillId = byName ? undefined : args[0]
    escrowCheck(byName || typeof skillId === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(skillId))
    for (let i = byName ? 0 : 1; i < args.length; i += 2) {
      const key = args[i]!, value = args[i + 1]
      escrowCheck(["--name", "--rail", "--hub", "--seller", "--input", "--max-amount"].includes(key) && !Object.hasOwn(flags, key) &&
        typeof value === "string" && value.length > 0 && !value.startsWith("--"))
      flags[key] = value
    }
    escrowCheck(flags["--rail"] === "erc8183" && typeof flags["--input"] === "string" && Buffer.byteLength(flags["--input"]) <= 131072)
    const body = docBytes(JSON.parse(flags["--input"])); escrowCheck(Buffer.byteLength(body) <= 131072)
    const max = flags["--max-amount"]
    escrowCheck(typeof max === "string" && max.length <= 88 && /^\$?(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(max))
    const maxAmountAtomic = parsePrice(max); escrowCheck(maxAmountAtomic > 0n && maxAmountAtomic < 1n << 256n)
    const hub = flags["--hub"]
    if (hub !== undefined) {
      const url = new URL(hub)
      escrowCheck(hub === url.origin && !url.username && !url.password && (url.protocol === "https:" ||
        url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    }
    if (byName) {
      const name = flags["--name"]
      escrowCheck(typeof name === "string" && looksLikeEnsName(name) && flags["--seller"] === undefined)
      return Object.freeze({ kind: "name" as const, name, body, maxAmountAtomic, ...(hub === undefined ? {} : { expectedHubUrl: hub }) })
    }
    escrowCheck(flags["--name"] === undefined && hub !== undefined)
    const seller = escrowAddress(flags["--seller"])
    parseArcadeEndpoint(`${hub}/x/${seller}/${skillId}`)
    return Object.freeze({ kind: "id" as const, hubUrl: hub, seller, skillId: skillId!, body, maxAmountAtomic })
  } catch { throw fail() }
}
const HELP = "arcade-buy SKILL --rail erc8183 --hub ORIGIN --seller ADDRESS --input JSON --max-amount USDC\n" +
  "arcade-buy --name NAME --rail erc8183 --input JSON --max-amount USDC [--hub EXPECTED_ORIGIN]\n" +
  "Owner env: ARCADE_BUYER_ESCROW_CONFIG (owned0600 JSON), ARCADE_BUYER_ESCROW_JOURNAL (one private.sqlite), ARCADE_BUYER_KEY.\n" +
  "Config: identity, buyer, gasBudgetWei (decimal string), expiresInSeconds, operationTimeoutMs. Parents must be owned0700.\n" +
  "--max-amount caps principal; the separately owner-configured gas budget is additional exposure. Arc testnet only.\n" +
  "Funding evidence is not terminal settlement/refund proof. Retain private journal after uncertainty; never rotate or retry automatically.\n"
export interface EscrowBuyerCliContext {
  readonly env: Readonly<Record<string, string | undefined>>; readonly signal?: AbortSignal
  readonly write?: (line: string, error: boolean) => Promise<void>
  /** Programmatic fixture seams only; no argument, env or config file selects these. */
  readonly fetch?: typeof globalThis.fetch; readonly rpcFetch?: typeof globalThis.fetch
  readonly ensReader?: EnsReader; readonly nowSeconds?: () => number
}
const output = (line: string, error: boolean): Promise<void> => new Promise((resolve, reject) => {
  ;(error ? process.stderr : process.stdout).write(line + "\n", error => error ? reject(error) : resolve())
})
export async function escrowBuyerMain(raw: readonly string[], context: EscrowBuyerCliContext): Promise<number> {
  const write = context.write ?? output, controller = new AbortController(), cancel = () => controller.abort(), parent = context.signal
  let timer: ReturnType<typeof setTimeout> | undefined, owned: Awaited<ReturnType<typeof openEscrowBuyerPurchase>> | undefined
  let started = false
  parent?.addEventListener("abort", cancel, { once: true }); if (parent?.aborted) cancel()
  try {
    const command = parseEscrowBuyerCommand(raw)
    if (command.kind === "help") { await write(HELP, false); return 0 }
    const boot = readEscrowBuyerBoot(context.env)
    escrowCheck(boot !== undefined && !controller.signal.aborted && command.maxAmountAtomic + escrowGasAtomic(boot.gasBudgetWei) < 1n << 256n)
    timer = setTimeout(cancel, boot.operationTimeoutMs)
    owned = await openEscrowBuyerPurchase(boot)
    escrowCheck(!controller.signal.aborted)
    const account = escrowBuyerAccount(boot, context.env, controller.signal), config = { ...owned.config,
      ...(context.rpcFetch === undefined ? {} : { rpcFetch: context.rpcFetch }), ...(context.nowSeconds === undefined ? {} : { nowSeconds: context.nowSeconds }) }
    started = true
    const result = await Effect.runPromiseExit(callSkill({ ...(command.kind === "id" ? { hubUrl: command.hubUrl, seller: command.seller, skillId: command.skillId } :
      { name: command.name, ...(command.expectedHubUrl === undefined ? {} : { expectedHubUrl: command.expectedHubUrl }) }),
      input: JSON.parse(command.body), account, maxAmountAtomic: command.maxAmountAtomic, preferRail: ["erc8183"], escrow: config,
      ...(context.fetch === undefined ? {} : { fetch: context.fetch }), ...(context.ensReader === undefined ? {} : { ensReader: context.ensReader }) }), { signal: controller.signal })
    if (Exit.isFailure(result)) throw Error()
    const evidence = await owned.evidence(result.value)
    escrowCheck(typeof result.value.status === "string" && /^[a-z_]{1,32}$/.test(result.value.status) && typeof result.value.fencedResult === "string" &&
      Buffer.byteLength(result.value.fencedResult) <= 1048576)
    await write(JSON.stringify({ jobId: result.value.jobId, hubReportedStatus: result.value.status, evidence,
      principalCapAtomic: command.maxAmountAtomic.toString(), additionalGasCapWei: boot.gasBudgetWei.toString(),
      maximumExposureAtomic: (command.maxAmountAtomic + escrowGasAtomic(boot.gasBudgetWei)).toString(),
      fencedResult: result.value.fencedResult }), false)
    return 0
  } catch {
    await write(started ? "escrow_buyer_uncertain: gas or funds may have moved; retain the private journal and reconcile before retrying" :
      "escrow_buyer_input_or_configuration_refused: nothing signed by this invocation; retain any existing journal", true)
    return started ? 1 : 2
  } finally {
    controller.abort(); clearTimeout(timer); parent?.removeEventListener("abort", cancel)
    // runPromiseExit joins the SDK's interruption finalizer before reaching here.
    try { owned?.close() } catch { /* Never emit private OS/provider diagnostics. */ }
  }
}
/** Actual owning process: repeated signals join cleanup; hard fuse never replays. */
export async function runOwnedEscrowBuyerCli(work: (signal: AbortSignal) => Promise<number>, hardTimeoutMs = 330000): Promise<void> {
  escrowCheck(Number.isSafeInteger(hardTimeoutMs) && hardTimeoutMs > 0 && hardTimeoutMs <= 330000)
  const controller = new AbortController(), stop = () => controller.abort(), timer = setTimeout(() => {
    console.error("escrow_buyer_deadline_exceeded: retain the private journal; do not retry"); process.exit(124)
  }, hardTimeoutMs)
  process.on("SIGINT", stop); process.on("SIGTERM", stop)
  try { process.exitCode = await work(controller.signal) }
  catch { console.error("escrow_buyer_unavailable: retain the private journal; do not retry"); process.exitCode = 1 }
  finally { controller.abort(); clearTimeout(timer); process.off("SIGINT", stop); process.off("SIGTERM", stop) }
}

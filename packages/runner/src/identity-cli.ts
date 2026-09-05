import { Effect } from "effect"
import { agentRegistrationUrl, explorerTxUrl, IDENTITY_REGISTRY_ABI, loadChainConfig } from "@arcade/core"
import {
  beginAgentRegistration, configPath, readConfig, recordAgent, recordPendingAgent,
  type AgentIdentity, type PendingAgentRegistration, type RunnerConfig
} from "./config.ts"
import {
  approveOperator, gasCheck, hubErc8004Refusal, IdentityFailed, makeViemIdentityClient,
  registerAgent, skillRefusal, UnfundedSeller, unfundedMessage, type HubErc8004, type IdentityClient
} from "./identity.ts"
import { loadSkills } from "./skills.ts"
import { addressForKey, resolveSellerKey } from "./wallet.ts"

export class IdentityCommandError extends Error {
  constructor(message: string, readonly exitCode = 1) { super(message); this.name = "IdentityCommandError" }
}
type ArmedHub = Required<HubErc8004>
export type IdentityFetch = (input: string, init?: RequestInit) => Promise<Response>
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const HASH = /^0x[0-9a-fA-F]{64}$/
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const validAddress = (value: string) => ADDRESS.test(value) && !/^0x0{40}$/i.test(value)
const usage = "usage: arcade identity status | arcade identity register <skill> --approve-operator ADDRESS [--skills DIR]"
const consentScope = "ERC-721 setApprovalForAll allows the operator to transfer ALL current and future identity NFTs you own in this registry; it is not limited to validation requests."

type Command = { kind: "status" } | { kind: "register"; skillId: string; operator: string; skillsDir: string }
const parseCommand = (argv: ReadonlyArray<string>, skillsDir: string): Command => {
  if (argv[0] === "status" && argv.length === 1) return { kind: "status" }
  if (argv[0] !== "register" || !argv[1] || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(argv[1]) || argv[1] === "constructor") {
    throw new IdentityCommandError(usage, 2)
  }
  let operator: string | undefined
  const seen = new Set<string>()
  for (let i = 2; i < argv.length; i += 2) {
    const flag = argv[i]!, value = argv[i + 1]
    if (!["--approve-operator", "--skills"].includes(flag) || seen.has(flag) || !value?.trim() || value.startsWith("-")) {
      throw new IdentityCommandError(`Invalid identity option. ${usage}`, 2)
    }
    seen.add(flag)
    if (flag === "--skills") skillsDir = value
    else operator = value
  }
  if (operator === undefined || !validAddress(operator)) {
    throw new IdentityCommandError(`${usage}\n${consentScope}\nExplicit --approve-operator ADDRESS consent is required; inspect the hub's /erc8004 document for its operator.`, 2)
  }
  return { kind: "register", skillId: argv[1], operator, skillsDir }
}

/** A single deadline covers headers and the whole bounded body. No redirects or credentials. */
export const fetchIdentityHub = async (hubUrl: string, fetcher: IdentityFetch = (input, init) => fetch(input, init)): Promise<ArmedHub> => {
  let url: URL
  try {
    url = new URL(hubUrl)
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error()
  } catch { throw new IdentityCommandError("The identity hub must be a root HTTPS origin (HTTP is allowed only for loopback), without URL credentials, path, query, or fragment.") }
  const endpoint = `${url.href.replace(/\/+$/, "")}/erc8004`
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const download = async () => {
    const response = await fetcher(endpoint, { redirect: "error", signal: controller.signal, headers: { accept: "application/json" } })
    if (response.redirected || (response.status >= 300 && response.status < 400)) throw new IdentityCommandError("ERC-8004 hub redirects are refused.")
    if (!response.ok) throw new IdentityCommandError(`ERC-8004 hub returned HTTP ${response.status}.`)
    if (Number(response.headers.get("content-length")) > 65_536) throw new IdentityCommandError("ERC-8004 hub document exceeds the 64 KiB limit.")
    if (response.body === null) throw new IdentityCommandError("ERC-8004 hub returned an empty body.")
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let bytes = 0, text = ""
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) { text += decoder.decode(); break }
      bytes += chunk.value.byteLength
      if (bytes > 65_536) throw new IdentityCommandError("ERC-8004 hub document exceeds the 64 KiB limit.")
      text += decoder.decode(chunk.value, { stream: true })
    }
    let document: unknown
    try { document = JSON.parse(text) } catch { throw new IdentityCommandError("ERC-8004 hub returned malformed JSON.") }
    const refusal = hubErc8004Refusal(document, hubUrl)
    if (refusal !== undefined) throw new IdentityCommandError(refusal)
    return document as ArmedHub
  }
  try {
    return await Promise.race([download(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { reject(new IdentityCommandError("ERC-8004 hub exceeded the 10-second deadline.")); controller.abort() }, 10_000)
    })])
  } catch (error) {
    if (error instanceof IdentityCommandError) throw error
    throw new IdentityCommandError("Could not fetch the ERC-8004 hub document. No seller key was accessed.")
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    controller.abort()
    void reader?.cancel().catch(() => {})
  }
}

/** Small seams keep real persistence and key access out of offline tests; D3 is not mocked. */
export interface IdentityCliDependencies {
  readConfig: Effect.Effect<RunnerConfig, unknown>
  configPath: () => string
  loadSkillIds: (directory: string) => Effect.Effect<ReadonlyArray<string>, unknown>
  resolveKey: (seller: string) => Effect.Effect<{ privateKey: string }, unknown>
  makeClient: (privateKey: string) => IdentityClient
  beginRegistration: (skillId: string, intent: Omit<PendingAgentRegistration, "txHash">) => Effect.Effect<RunnerConfig, unknown>
  recordPending: (skillId: string, pending: PendingAgentRegistration) => Effect.Effect<RunnerConfig, unknown>
  recordIdentity: (skillId: string, identity: AgentIdentity) => Effect.Effect<RunnerConfig, unknown>
  fetch: IdentityFetch
  log: (line: string) => void
  now: () => number
}
const defaults: IdentityCliDependencies = {
  readConfig, configPath, loadSkillIds: directory => loadSkills(directory).pipe(Effect.map(skills => skills.map(skill => skill.manifest.id))),
  resolveKey: resolveSellerKey, makeClient: privateKey => makeViemIdentityClient({ privateKey }),
  beginRegistration: beginAgentRegistration, recordPending: recordPendingAgent, recordIdentity: recordAgent,
  fetch: (input, init) => fetch(input, init), log: line => console.log(line), now: () => Date.now()
}
const checked = <A>(effect: () => Effect.Effect<A, unknown>, message: string) => Effect.suspend(effect).pipe(
  Effect.mapError(() => new IdentityCommandError(message)),
  // wallet.resolveSellerKey can throw while deriving a malformed key inside Effect.gen.
  // That is a defect, not a typed failure; neither path may expose private diagnostics.
  Effect.catchAllDefect(() => Effect.fail(new IdentityCommandError(message)))
)
const errorMessage = (error: IdentityFailed | UnfundedSeller, faucet: string, saved = false) => {
  if (error instanceof UnfundedSeller) return new IdentityCommandError(unfundedMessage(error, faucet))
  const evidence = error.txHash && HASH.test(error.txHash) ? `\nKnown transaction hash: ${error.txHash}` : ""
  if (error.phase === "reverted") return new IdentityCommandError((saved
    ? "Registration is saved. The operator approval transaction was confirmed reverted; no approval was recorded."
    : "The registration transaction was confirmed reverted. No agent was adopted; reconcile its pending checkpoint before retrying.") + evidence)
  if (!saved && ["logs", "ownership", "uri"].includes(error.phase ?? "")) {
    return new IdentityCommandError("The transaction was confirmed, but its mint, owner, or URI could not be validated for this skill. Preserve the checkpoint; do not mint again." + evidence)
  }
  if (!saved && error.phase === "journal") {
    return new IdentityCommandError("Registration was broadcast but its hash journal could not be saved. Preserve this hash and reconcile the pending checkpoint; do not mint again." + evidence)
  }
  return new IdentityCommandError((saved
    ? "Registration is saved. Operator approval was not confirmed; rerun with the same explicit operator consent to reconcile approval."
    : error.broadcast === "not-sent" ? "Identity preflight failed; nothing was broadcast. Check the selected chain and seller configuration."
      : "Registration is not confirmed; its broadcast outcome may be unknown. Reconcile the pending checkpoint before retrying; never automatically mint again.") + evidence)
}

/** Import-safe orchestration. Parsing/status never fetch or resolve a key. */
export const runIdentityCommand = (argv: ReadonlyArray<string>, options: {
  deps?: Partial<IdentityCliDependencies>; skillsDirDefault?: string; faucet?: string
} = {}): Effect.Effect<void, IdentityCommandError> => Effect.gen(function* () {
  const d = { ...defaults, ...options.deps }, faucet = options.faucet ?? "https://faucet.circle.com"
  const command = yield* Effect.try({ try: () => parseCommand(argv, options.skillsDirDefault ?? `${process.cwd()}/skills`),
    catch: error => error instanceof IdentityCommandError ? error : new IdentityCommandError(usage, 2) })
  const cfg = yield* checked(() => d.readConfig, "Could not read the runner config. Inspect the configured file without replacing an existing identity.")
  if (command.kind === "status") {
    d.log(`config ${d.configPath()}\nseller ${cfg.sellerAddress}`)
    if (Object.keys(cfg.agents).length === 0 && Object.keys(cfg.pendingAgents ?? {}).length === 0) d.log("No ERC-8004 identity yet. Use arcade identity register with explicit --approve-operator consent.")
    for (const [skillId, agent] of Object.entries(cfg.agents)) {
      d.log(`${skillId}\n  agent ${agent.agentId}\n  registered ${explorerTxUrl(agent.registrationTx)}\n` +
        `  operator ${agent.operator ?? "(not recorded)"} (recorded only; not checked on-chain)\n` +
        (agent.approvalTx ? `  approval ${explorerTxUrl(agent.approvalTx)}\n` : "") + `  file ${agent.agentURI}`)
    }
    for (const [skillId, pending] of Object.entries(cfg.pendingAgents ?? {})) {
      d.log(`${skillId}\n  pending ${pending.txHash ? `known transaction ${pending.txHash}; rerun to resume this hash` : "unknown broadcast outcome; reconcile on Arc before changing this checkpoint or retrying"}\n  file ${pending.agentURI}`)
    }
    return
  }
  const skills = yield* checked(() => d.loadSkillIds(command.skillsDir), "Could not load local skill manifests. Check --skills and their validity.")
  const skillMiss = skillRefusal(command.skillId, skills)
  if (skillMiss !== undefined) return yield* Effect.fail(new IdentityCommandError(skillMiss))
  const existing = cfg.agents[command.skillId], pending = cfg.pendingAgents?.[command.skillId]
  if (pending && !pending.txHash) return yield* Effect.fail(new IdentityCommandError("A pending registration has an unknown broadcast outcome. Reconcile this seller's on-chain transactions before changing the checkpoint; no automatic remint is permitted."))
  if (existing && pending) return yield* Effect.fail(new IdentityCommandError("Both confirmed and pending registration exist. Reconcile the config before proceeding."))
  const hub = yield* Effect.tryPromise({ try: () => fetchIdentityHub(cfg.hubUrl, d.fetch),
    catch: error => error instanceof IdentityCommandError ? error : new IdentityCommandError("Could not verify the ERC-8004 hub.") })
  if (!same(command.operator, hub.operator)) return yield* Effect.fail(new IdentityCommandError("--approve-operator must exactly match the operator published by the verified hub. Nothing was registered or approved.", 2))
  if ([hub.operator, hub.validator, hub.attester].some(role => same(role, cfg.sellerAddress))) {
    return yield* Effect.fail(new IdentityCommandError("The seller must be distinct from the hub's operator, validator, and attester. Nothing was registered or approved."))
  }
  const config = yield* Effect.try({ try: () => loadChainConfig(), catch: () => new IdentityCommandError("Could not load the selected chain configuration.") })
  const agentURI = agentRegistrationUrl(cfg.hubUrl, command.skillId)
  for (const previous of [existing, pending]) {
    if (previous && (previous.registry === undefined || !same(previous.registry, hub.registries.identity) ||
      previous.chainId !== config.chainId || previous.agentURI !== agentURI)) {
      return yield* Effect.fail(new IdentityCommandError("Saved identity provenance (chain, registry, or URI) is missing or changed. Reconcile it explicitly; this command will not adopt or replace it."))
    }
  }
  d.log(`WARNING: ${consentScope}\nOperator: ${hub.operator}\nRegistry: ${hub.registries.identity}\n` +
    `You opted in with --approve-operator. Revoke with setApprovalForAll(${hub.operator}, false) on this registry.`)
  const key = yield* checked(() => d.resolveKey(cfg.sellerAddress), "Could not resolve the signing key for the saved seller. No identity transaction was sent.")
  const keyAddress = yield* Effect.try({ try: () => addressForKey(key.privateKey), catch: () => new IdentityCommandError("The signing key for the saved seller is invalid.") })
  if (!same(keyAddress, cfg.sellerAddress)) return yield* Effect.fail(new IdentityCommandError("The resolved key does not control the saved seller. Nothing was broadcast."))
  const client = yield* Effect.try({ try: () => d.makeClient(key.privateKey), catch: () => new IdentityCommandError("Could not prepare a ready Arc testnet identity client. Nothing was broadcast.") })
  if (!same(client.address, cfg.sellerAddress)) return yield* Effect.fail(new IdentityCommandError("The identity client does not control the saved seller. Nothing was broadcast."))
  let registered: AgentIdentity
  if (existing) {
    const owner = yield* Effect.tryPromise({ try: () => client.readContract({ address: hub.registries.identity, abi: IDENTITY_REGISTRY_ABI, functionName: "ownerOf", args: [BigInt(existing.agentId)] }),
      catch: () => new IdentityCommandError("Could not revalidate the existing agent's owner. Nothing was approved.") })
    if (typeof owner !== "string" || !same(owner, cfg.sellerAddress)) return yield* Effect.fail(new IdentityCommandError("The existing agent's owner is not this seller. Nothing was approved."))
    const uri = yield* Effect.tryPromise({ try: () => client.readContract({ address: hub.registries.identity, abi: IDENTITY_REGISTRY_ABI, functionName: "tokenURI", args: [BigInt(existing.agentId)] }),
      catch: () => new IdentityCommandError("Could not revalidate the existing agent's token URI. Nothing was approved.") })
    if (uri !== agentURI) return yield* Effect.fail(new IdentityCommandError("The existing agent's token URI does not match this skill. Nothing was approved."))
    registered = existing
  } else {
    const intent = pending ?? { agentURI, registry: hub.registries.identity, chainId: config.chainId, submittedAtMs: d.now() }
    if (!pending) {
      yield* gasCheck(client, cfg.sellerAddress).pipe(Effect.mapError(error => errorMessage(error, faucet)))
      yield* checked(() => d.beginRegistration(command.skillId, intent), "Could not reserve the registration intent checkpoint. Another attempt may already exist; nothing was broadcast.")
    }
    const result = yield* registerAgent({ client, registry: hub.registries.identity, agentURI,
      ...(pending?.txHash ? { resumeTxHash: pending.txHash } : { onBroadcast: (txHash: string) => Effect.runPromise(d.recordPending(command.skillId, { ...intent, txHash })).then(() => {}) })
    }).pipe(Effect.mapError(error => errorMessage(error, faucet)))
    registered = { agentId: result.agentId, agentURI, registrationTx: result.txHash, registeredAtMs: d.now(),
      registry: hub.registries.identity, chainId: config.chainId }
    yield* checked(() => d.recordIdentity(command.skillId, registered), `Could not save confirmed registration. Preserve transaction ${result.txHash}; do not register again. Operator approval was not sent.`)
    d.log(`Registered agent ${registered.agentId}\nTransaction: ${explorerTxUrl(registered.registrationTx)}\nRegistration saved before operator approval.`)
  }
  const approval = yield* approveOperator({ client, registry: hub.registries.identity, operator: hub.operator })
    .pipe(Effect.mapError(error => errorMessage(error, faucet, true)))
  const { operator: previousOperator, approvalTx: previousApproval, ...registration } = registered
  const approvalTx = approval.txHash || (previousOperator && same(previousOperator, hub.operator) ? previousApproval : undefined)
  yield* checked(() => d.recordIdentity(command.skillId, { ...registration, operator: hub.operator, ...(approvalTx ? { approvalTx } : {}) }),
    "Could not save the confirmed operator approval. Registration remains saved; rerun with the same operator consent to refresh recorded approval.")
  d.log(approval.alreadyApproved ? "Operator already approved; no approval transaction sent." : `Operator approval confirmed: ${explorerTxUrl(approval.txHash)}`)
  d.log(`Saved to ${d.configPath()}. Restart the runner to announce this agent identity.`)
})

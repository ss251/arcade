/** Owned offline process only. Never preload into a shared test or production process. */
import { createHash } from "node:crypto"
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import type { Store } from "../../apps/hub/src/store.ts"

export const FIXTURE_POLICY = Object.freeze({ calls: 20, priceAtomic: "10000", budgetAtomic: "200000",
  skillId: "gateway-session-probe", serviceName: "gateway-session-probe", version: "1.0.0",
  buyer: "0x1a642f0e3c3af545e7acbd38b07251b3990914f1", seller: "0x5050a4f4b3f9338c3472dcc01a87c76a144b3c9c" })
type Base = { readonly version: 1; readonly runId: string; readonly directory: string; readonly ownerPid: number; readonly deadlineUnixMs: number }
export type FixtureStart = Base & ({ readonly role: "hub"; readonly hubSecret: string } | { readonly role: "runner"; readonly hubOrigin: string })
const fail = (): never => { throw Error("Gateway session fixture unavailable") }
const own = (value: unknown, keys: readonly string[]) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail()
  const names = Reflect.ownKeys(value)
  if (names.length !== keys.length) return fail()
  const result: Record<string, unknown> = Object.create(null)
  for (const key of names) {
    if (typeof key !== "string" || !keys.includes(key)) return fail()
    const d = Object.getOwnPropertyDescriptor(value, key)
    if (!d || !("value" in d) || !d.enumerable) return fail()
    result[key] = d.value
  }
  return result
}
const origin = (v: unknown): string => {
  if (typeof v !== "string" || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(v)) return fail()
  const u = new URL(v)
  return u.origin === v && Number(u.port) <= 65535 ? v : fail()
}
export function decodeFixtureStart(value: unknown): FixtureStart {
  if (value === null || typeof value !== "object") return fail()
  const role = Object.getOwnPropertyDescriptor(value, "role")
  if (!role || !("value" in role) || !["hub", "runner"].includes(role.value)) return fail()
  const v = own(value, ["version", "runId", "role", "directory", "ownerPid", "deadlineUnixMs", role.value === "hub" ? "hubSecret" : "hubOrigin"])
  if (v.version !== 1 || typeof v.runId !== "string" || v.runId.length !== 32 || !/^[0-9a-f]{32}$/.test(v.runId) ||
    typeof v.directory !== "string" || v.directory.length > 2048 || !isAbsolute(v.directory) || normalize(v.directory) !== v.directory ||
    /[\u0000-\u0020\u007f]/.test(v.directory) || v.directory === "/" ||
    !Number.isSafeInteger(v.ownerPid) || (v.ownerPid as number) <= 1 || !Number.isSafeInteger(v.deadlineUnixMs) || (v.deadlineUnixMs as number) <= 0) return fail()
  const base = { version: 1 as const, runId: v.runId, directory: v.directory, ownerPid: v.ownerPid as number, deadlineUnixMs: v.deadlineUnixMs as number }
  if (v.role === "runner") return Object.freeze({ ...base, role: "runner", hubOrigin: origin(v.hubOrigin) })
  if (typeof v.hubSecret !== "string" || v.hubSecret.length < 32 || v.hubSecret.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(v.hubSecret)) return fail()
  return Object.freeze({ ...base, role: "hub", hubSecret: v.hubSecret })
}
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const bounded = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Fixture deadline")), ms) })]) }
  finally { if (timer !== undefined) clearTimeout(timer) }
}
type RunnerRecord = { jobId: string; index: number; pid: number; inputDigest: string; outputDigest: string | null; exitCode: number | null }
type HubRecord = { jobId: string; nonce: string; begin: boolean; finish: boolean; settleRef: string | null }
type FacilitatorRecord = { nonce: string; verify: 1; settle: 0 | 1; settleRef: string | null }

export async function fixtureMain(args: readonly string[]): Promise<number> {
  // Runtime wrappers are never installed by an import or shared-process caller.
  if (!import.meta.main || args.length !== 1 || (args[0] !== "--hub" && args[0] !== "--runner")) return 2
  const role = args[0] === "--hub" ? "hub" : "runner"
  let config: FixtureStart | undefined, stopped = false, output = Promise.resolve(), stopWork: (() => Promise<void>) | undefined
  let snapshot: () => object = () => ({ pid: process.pid }), reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let hard: ReturnType<typeof setTimeout> | undefined, orphan: ReturnType<typeof setInterval> | undefined
  let stopping: Promise<void> | undefined, initializing: Promise<void> | undefined, exitCode = 0
  const emit = (event: "ready" | "snapshot" | "stopped" | "failed", facts: object) => {
    if (!config) return Promise.resolve()
    const line = "GATEWAY_SESSION_FIXTURE " + JSON.stringify({ version: 1, runId: config.runId, role, event, facts }) + "\n"
    if (Buffer.byteLength(line) > 32768) return Promise.reject(Error("Fixture control bound"))
    output = output.then(() => bounded(new Promise<void>((resolve, reject) => process.stdout.write(line, e => e ? reject(Error()) : resolve())), 1000))
    void output.catch(() => {})
    return output
  }
  const stop = () => stopping ??= (async () => {
    stopped = true
    try { if (initializing) await bounded(initializing, 2500); if (stopWork) await bounded(stopWork(), 4000); await emit("stopped", snapshot()) }
    catch { exitCode = 1; await emit("failed", { code: "fixture_unavailable" }).catch(() => {}) }
    if (reader) void reader.cancel().catch(() => {})
  })()
  const onSignal = () => { void stop() }
  const quietMethods = ["log", "warn", "error", "info", "debug"] as const
  try {
    // Parent supplies a minimal environment. Never inspect an inherited credential value.
    if (Object.keys(process.env).some(k => !["PATH", "ARCADE_NETWORK"].includes(k)) ||
      process.env.ARCADE_NETWORK !== undefined && process.env.ARCADE_NETWORK !== "arc-testnet") return fail()
    process.env.ARCADE_NETWORK = "arc-testnet"
    reader = Bun.stdin.stream().getReader()
    let pending = "", configSeen = false, commands = 0, emptyChunks = 0
    const decoder = new TextDecoder("utf-8", { fatal: true })
    const initialize = async (line: string) => {
      config = decodeFixtureStart(JSON.parse(line)); configSeen = true
      if (config.role !== role || config.ownerPid !== process.ppid || config.deadlineUnixMs <= Date.now() || config.deadlineUnixMs > Date.now() + 120000) return fail()
      const stat = lstatSync(config.directory)
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700 || realpathSync(config.directory) !== config.directory) return fail()
      hard = setTimeout(() => process.exit(93), Math.max(1, config.deadlineUnixMs - Date.now()) + 5000)
      orphan = setInterval(() => { if (process.ppid !== config!.ownerPid || Date.now() >= config!.deadlineUnixMs) void stop() }, 100)
      process.on("SIGTERM", onSignal); process.on("SIGINT", onSignal)
      for (const key of quietMethods) console[key] = () => {}
      if (config.role === "hub") {
        const opened = await startHub(config, () => stopped, emit)
        stopWork = opened.stop; snapshot = opened.snapshot
      } else {
        const opened = await startRunner(config, () => stopped, emit)
        stopWork = opened.stop; snapshot = opened.snapshot
      }
    }
    while (!stopped) {
      const part = await bounded(reader.read(), config ? Math.max(1, config.deadlineUnixMs - Date.now()) : 3000)
      if (part.done) break
      if (part.value.length === 0) { if (++emptyChunks > 1024) return fail() } else emptyChunks = 0
      pending += decoder.decode(part.value, { stream: true })
      if (Buffer.byteLength(pending) > 16384) return fail()
      for (;;) {
        const newline = pending.indexOf("\n"); if (newline < 0) break
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1)
        if (!configSeen) { initializing = initialize(line); await initializing }
        else {
          if (++commands > 64) return fail()
          const command = own(JSON.parse(line), ["version", "runId", "command"])
          if (command.version !== 1 || command.runId !== config!.runId) return fail()
          if (command.command === "stop") { await stop(); break }
          if (command.command !== "snapshot") return fail()
          await emit("snapshot", snapshot())
        }
      }
    }
    // Fatal flushing also rejects an incomplete trailing UTF-8 sequence at EOF.
    pending += decoder.decode()
    if (!configSeen || pending !== "") return fail()
    await stop()
  } catch { exitCode = 1; await emit("failed", { code: "fixture_unavailable" }).catch(() => {}); await stop().catch(() => {}) }
  finally {
    if (hard) clearTimeout(hard); if (orphan) clearInterval(orphan)
    process.off("SIGTERM", onSignal); process.off("SIGINT", onSignal)
    // Owned entry exits immediately; keep denial/log boundaries installed through exit.
  }
  return exitCode
}

async function startHub(config: Extract<FixtureStart, { role: "hub" }>, stopped: () => boolean,
  emit: (event: "ready", facts: object) => Promise<void>) {
  const [{ mock }, { Effect, Layer }, core, payments, viem, stores, sqlite] = await Promise.all([
    import("bun:test"), import("effect"), import("@arcade/core"), import("@arcade/payments"), import("viem"),
    import("../../apps/hub/src/store.ts"), import("../../apps/hub/src/store-sqlite.ts")])
  const chain = core.loadChainConfig("arc-testnet"), dbPath = join(config.directory, "database.sqlite")
  if (existsSync(dbPath)) return fail()
  const disk = sqlite.openSqliteStore(dbPath, "f12_owned_offline")
  let originValue = "", rpcCalls = 0, verifyCalls = 0, settleCalls = 0, beginCalls = 0, finishCalls = 0, unexpectedRequests = 0
  const records: HubRecord[] = [], facilitator: FacilitatorRecord[] = [], bindings = new Map<string, string>(), wire = new Map<string, string>(), rpcSeen = new Set<string>()
  const deny = (): never => { unexpectedRequests++; return fail() }
  const wrapped: Store = { ...disk.store,
    reserveSessionJob: (binding, job) => Effect.suspend(() => {
      if (stopped() || records.length >= 20 || records.some(r => r.jobId === job.id) || bindings.has(binding.nonce)) return deny()
      return disk.store.reserveSessionJob(binding, job).pipe(Effect.tap(() => Effect.sync(() => {
        bindings.set(binding.nonce, job.id); records.push({ jobId: job.id, nonce: binding.nonce, begin: false, finish: false, settleRef: null })
      })))
    }),
    beginSessionSettlement: (sessionId, jobId) => Effect.suspend(() => {
      const record = records.find(r => r.jobId === jobId)
      if (stopped() || !record || record.begin || ++beginCalls > 20) return deny()
      return disk.store.beginSessionSettlement(sessionId, jobId).pipe(Effect.tap(() => Effect.sync(() => { record.begin = true })))
    }),
    finishSessionJob: terminal => Effect.suspend(() => {
      const record = records.find(r => r.jobId === terminal.jobId)
      if (stopped() || !record || !record.begin || record.finish || ++finishCalls > 20) return deny()
      return disk.store.finishSessionJob(terminal).pipe(Effect.tap(() => Effect.sync(() => { record.finish = true; record.settleRef = terminal.receipt.settleTx ?? null })))
    }) }
  mock.module(fileURLToPath(new URL("../../apps/hub/src/store-sqlite.ts", import.meta.url)), () => ({ ...sqlite, StoreFromEnv: () => Layer.succeed(stores.StoreTag, wrapped) }))
  const serve = Bun.serve
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (stopped() || typeof input !== "string" || typeof init?.body !== "string" || Buffer.byteLength(init.body) > 16384) return deny()
      const url = new URL(input)
      if (url.search || url.hash || url.username || url.password || init.method !== "POST") return deny()
      if (url.origin === new URL(chain.rpcHttp[0]!).origin && url.pathname === "/") {
        const body = JSON.parse(init.body), key = body.method === "eth_chainId" ? "eth_chainId" : body.params?.[0]?.data
        if (body === null || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).some(k => !["jsonrpc", "id", "method", "params"].includes(k)) ||
          body.jsonrpc !== "2.0" || !Number.isSafeInteger(body.id) || rpcSeen.has(key) || ++rpcCalls > 4) return deny()
        let result: string
        if (body.method === "eth_chainId" && (body.params === undefined || Array.isArray(body.params) && body.params.length === 0)) result = "0x" + chain.chainId.toString(16)
        else if (body.method === "eth_call" && body.params?.[0]?.to?.toLowerCase() === chain.usdc.address.toLowerCase() && body.params.length === 2 && body.params[1] === "latest") {
          if (key === "0x06fdde03") result = viem.encodeAbiParameters([{ type: "string" }], [chain.usdc.eip712Name])
          else if (key === "0x54fd4d50") result = viem.encodeAbiParameters([{ type: "string" }], [chain.usdc.eip712Version])
          else if (key === "0x313ce567") result = viem.encodeAbiParameters([{ type: "uint8" }], [6])
          else return deny()
        } else return deny()
        rpcSeen.add(key); return Response.json({ jsonrpc: "2.0", id: body.id, result })
      }
      if (url.origin !== chain.gateway!.facilitatorUrl || !["/v1/x402/verify", "/v1/x402/settle"].includes(url.pathname) ||
        init.redirect !== "error" || init.credentials !== "omit" || new Headers(init.headers).has("authorization")) return deny()
      const body = own(JSON.parse(init.body), ["paymentPayload", "paymentRequirements"])
      const payload = body.paymentPayload as { payload: { authorization: { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: `0x${string}` }; signature: `0x${string}` }; accepted: unknown }
      const requirements = body.paymentRequirements as { network: string; amount: string; asset: string; payTo: string; extra: { name: string; version: string; verifyingContract: string } }
      const auth = payload.payload.authorization, nonce = auth.nonce
      if (requirements.network !== chain.caip2 || requirements.amount !== "10000" || requirements.asset !== chain.usdc.address.toLowerCase() ||
        requirements.payTo !== FIXTURE_POLICY.seller || auth.from !== FIXTURE_POLICY.buyer || auth.to !== FIXTURE_POLICY.seller || auth.value !== "10000" ||
        !/^0x[0-9a-f]{64}$/.test(nonce) || JSON.stringify(payload.accepted) !== JSON.stringify(requirements)) return deny()
      const recovered = await viem.recoverTypedDataAddress({ domain: payments.gatewayDomain(requirements as never, chain.chainId), types: payments.TRANSFER_TYPES,
        primaryType: "TransferWithAuthorization", message: { from: auth.from as `0x${string}`, to: auth.to as `0x${string}`, value: 10000n,
          validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore), nonce }, signature: payload.payload.signature })
      if (stopped() || recovered.toLowerCase() !== FIXTURE_POLICY.buyer) return deny()
      const digest = sha(Buffer.from(init.body)), prior = facilitator.find(r => r.nonce === nonce)
      if (url.pathname.endsWith("/verify")) {
        if (prior || ++verifyCalls > 20) return deny()
        wire.set(nonce, digest); facilitator.push({ nonce, verify: 1, settle: 0, settleRef: null })
        return Response.json({ isValid: true, payer: auth.from })
      }
      if (!prior || prior.settle || wire.get(nonce) !== digest || ++settleCalls > 20 || !records.find(r => r.nonce === nonce)?.begin) return deny()
      prior.settle = 1; prior.settleRef = "00000000-0000-4000-8000-" + String(settleCalls).padStart(12, "0")
      return Response.json({ success: true, payer: auth.from, network: chain.caip2, transaction: prior.settleRef })
    } catch { return deny() }
  }, { preconnect() { return deny() } }) as typeof fetch
  let server: ReturnType<typeof Bun.serve> | undefined
  Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
    if (server || stopped()) return deny()
    const original = options.fetch!
    server = serve({ ...options, hostname: "127.0.0.1", port: 0, fetch: (request, current) => stopped()
      ? new Response(null, { status: 503 }) : original.call(current, request, current) } as Parameters<typeof Bun.serve>[0])
    originValue = `http://127.0.0.1:${server.port}`; process.env.ARCADE_PUBLIC_URL = originValue
    void emit("ready", { pid: process.pid, origin: originValue }).catch(() => {})
    return server
  }) as typeof Bun.serve
  process.env.ARCADE_RAIL = "gateway"; process.env.PORT = "0"; process.env.ARCADE_HUB_SECRET = config.hubSecret
  process.env.ARCADE_DB = dbPath; process.env.ARCADE_PUBLIC_URL = "http://127.0.0.1:1"
  const snapshot = () => ({ pid: process.pid, origin: originValue, rpcCalls, verifyCalls, settleCalls, beginCalls, finishCalls, unexpectedRequests, records, facilitator })
  const stop = async () => { try { if (server) await server.stop(true) } finally { disk.close() } }
  try { await import("../../apps/hub/src/server.ts") }
  catch { await stop(); return fail() }
  return { snapshot, stop }
}

async function startRunner(config: Extract<FixtureStart, { role: "runner" }>, stopped: () => boolean,
  emit: (event: "ready", facts: object) => Promise<void>) {
  const [{ Effect, Fiber }, { startDaemon }, { sessionRequestDigest }] = await Promise.all([
    import("effect"), import("../../packages/runner/src/daemon.ts"), import("../../apps/hub/src/session-ledger.ts")])
  const skillRoot = join(config.directory, "skills"), skillDir = join(skillRoot, FIXTURE_POLICY.skillId), entry = join(skillDir, "run.ts")
  if (existsSync(skillRoot)) return fail()
  const manifest = readFileSync(new URL("./gateway-session-probe/arcade.json", import.meta.url)), source = readFileSync(new URL("./gateway-session-probe/run.ts.txt", import.meta.url))
  mkdirSync(skillRoot, { mode: 0o700 }); mkdirSync(skillDir, { mode: 0o700 })
  writeFileSync(join(skillDir, "arcade.json"), manifest, { flag: "wx", mode: 0o600 }); writeFileSync(entry, source, { flag: "wx", mode: 0o600 })
  const manifestHash = sha(manifest), sourceHash = sha(source), guardedSourceHash = sha(readFileSync(entry))
  let spawned = 0, exited = 0, results = 0, unexpectedRequests = 0
  const records: RunnerRecord[] = [], children: Array<Bun.Subprocess<"pipe", "pipe", "pipe">> = [], observations: Promise<void>[] = []
  const assignments = new Map<string, { index: number; inputDigest: string }>()
  const deny = (): never => { unexpectedRequests++; return fail() }
  const nativeSpawn = Bun.spawn, NativeWebSocket = globalThis.WebSocket
  const snapshot = () => ({ pid: process.pid, manifestHash, sourceHash, guardedSourceHash, spawned, exited, results, unexpectedRequests, records })
  Bun.spawn = ((cmd: string[], options: { cwd: string; env: Record<string, string>; stdin: "pipe"; stdout: "pipe"; stderr: "pipe" }) => {
    if (stopped() || ++spawned > 20 || !Array.isArray(cmd) || JSON.stringify(cmd) !== JSON.stringify(["bun", "--no-env-file", "run", entry]) ||
      options.cwd !== skillDir || options.stdin !== "pipe" || options.stdout !== "pipe" || options.stderr !== "pipe" ||
      Object.keys(options.env ?? {}).some(k => !["PATH", "HOME", "LANG", "ARCADE_SANDBOX"].includes(k))) return deny()
    const child = nativeSpawn(cmd, options), record: RunnerRecord = { jobId: "", index: 0, pid: child.pid, inputDigest: "", outputDigest: null, exitCode: null }
    children.push(child); records.push(record)
    const sink = child.stdin, write = sink.write.bind(sink)
    const observedWrite = (data: Parameters<typeof write>[0]) => {
      if (typeof data !== "string" || Buffer.byteLength(data) > 16384 || record.jobId !== "") return deny()
      const envelope = JSON.parse(data), assignment = assignments.get(envelope.jobId)
      if (!assignment || sessionRequestDigest(envelope.input) !== assignment.inputDigest) return deny()
      record.jobId = envelope.jobId; record.index = assignment.index; record.inputDigest = assignment.inputDigest
      return write(data)
    }
    const observation = child.exited.then(code => { record.exitCode = code; exited++ })
    observations.push(observation); void observation.catch(() => {})
    // Bun's native FileSink methods are readonly. Observe through a facade, never
    // mutate them; every operation still uses the original child/sink receiver.
    const observedSink = new Proxy(sink, { get(target, key) {
      if (key === "write") return observedWrite
      const value = Reflect.get(target, key, target)
      return typeof value === "function" ? value.bind(target) : value
    } })
    return new Proxy(child, { get(target, key) {
      if (key === "stdin") return observedSink
      const value = Reflect.get(target, key, target)
      return typeof value === "function" ? value.bind(target) : value
    } })
  }) as typeof Bun.spawn
  globalThis.fetch = Object.assign(async () => deny(), { preconnect: () => deny() }) as typeof fetch
  globalThis.WebSocket = class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      if (stopped() || String(url) !== config.hubOrigin.replace(/^http/, "ws") + "/ws") return deny()
      super(url, protocols)
      this.addEventListener("message", event => {
        try {
          if (typeof event.data !== "string" || event.data.length > 16384) return deny()
          const value = JSON.parse(event.data)
          if (value._tag !== "JobAssignment") return
          const index = value.input?.index
          if (stopped() || assignments.size >= 20 || assignments.has(value.jobId) || value.skillId !== FIXTURE_POLICY.skillId ||
            !Number.isInteger(index) || index !== assignments.size + 1 || Object.keys(value.input).length !== 1 ||
            Object.hasOwn(value, "sessionId") || Object.hasOwn(value, "sessionToken") || Object.hasOwn(value, "hireCapability")) return deny()
          assignments.set(value.jobId, { index, inputDigest: sessionRequestDigest(value.input) })
        } catch { deny() }
      })
    }
    override send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (stopped() || typeof data !== "string" || data.length > 32768) return deny()
      const value = JSON.parse(data)
      if (value._tag === "JobResult") {
        const record = records.find(r => r.jobId === value.jobId)
        if (!record || record.outputDigest !== null || value.outcome?.status !== "succeeded" || record.exitCode !== 0 ||
          sessionRequestDigest(value.outcome.output) !== sessionRequestDigest({ index: record.index, proof: "offline-runner-probe" })) return deny()
        record.outputDigest = sessionRequestDigest(value.outcome.output); results++
      } else if (value._tag !== "Hello" && value._tag !== "Heartbeat") return deny()
      return super.send(data)
    }
  } as typeof WebSocket
  // This is the public, deterministic, unfunded 0x02 fixture identity only.
  process.env.ARCADE_SELLER_KEY = "0x" + "02".repeat(32)
  process.env.PATH = dirname(process.execPath)
  const fiber = Effect.runFork(startDaemon({ skillsDir: skillRoot, config: { runnerId: "rnr_f12_" + config.runId, sellerAddress: FIXTURE_POLICY.seller,
    hubUrl: config.hubOrigin, hubWsUrl: config.hubOrigin.replace(/^http/, "ws") + "/ws", maxConcurrency: 1, agents: {}, pendingAgents: {} },
    ensTickerFactory: async () => undefined }))
  const stop = async () => {
    let failed = false
    try { await bounded(Effect.runPromise(Fiber.interrupt(fiber)), 1000) } catch { failed = true }
    for (const child of children) {
      try {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM")
          try { await bounded(child.exited, 300) } catch { child.kill("SIGKILL"); await bounded(child.exited, 1000) }
        }
        if (child.exitCode === null && child.signalCode === null) failed = true
      } catch { failed = true }
    }
    try { await bounded(Promise.all(observations), 1000) } catch { failed = true }
    // Detached daemon work may finish later. Keep its spawn/network denial until exit.
    if (failed) return fail()
  }
  void Effect.runPromise(Fiber.await(fiber)).then(exit => { if (!stopped() && exit._tag === "Failure") process.exitCode = 1 }).catch(() => {})
  await emit("ready", { pid: process.pid, manifestHash, sourceHash, guardedSourceHash })
  return { snapshot, stop }
}

if (import.meta.main) process.exit(await fixtureMain(process.argv.slice(2)))

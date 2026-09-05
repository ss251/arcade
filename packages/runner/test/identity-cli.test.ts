import { afterEach, describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { encodeAbiParameters, encodeEventTopics, zeroAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { IDENTITY_REGISTRY_ABI, loadChainConfig } from "@arcade/core"
import { defaultConfig, type AgentIdentity, type RunnerConfig } from "../src/config.ts"
import { hubErc8004Refusal, MIN_GAS_WEI, skillRefusal, UnfundedSeller, unfundedMessage, type IdentityClient } from "../src/identity.ts"
import { fetchIdentityHub, runIdentityCommand, type IdentityCliDependencies } from "../src/identity-cli.ts"

const HUB = "https://hub.example"
const KEY = `0x${"11".repeat(32)}` as const // Public, unfunded fixture key; never a real credential.
const SELLER = privateKeyToAccount(KEY).address
const OPERATOR = `0x${"22".repeat(20)}`
const VALIDATOR = `0x${"33".repeat(20)}`
const ATTESTER = `0x${"44".repeat(20)}`
const REG = `0x${"ab".repeat(32)}`
const APP = `0x${"cd".repeat(32)}`
const SKILL = "diff-triage"
const URI = `${HUB}/listings/${SKILL}/agent-registration.json`
const chain = loadChainConfig("arc-testnet")
const document = () => ({ armed: true, caip2: chain.caip2, registries: chain.erc8004!, operator: OPERATOR, validator: VALIDATOR, attester: ATTESTER })
const identity: AgentIdentity = { agentId: "42", agentURI: URI, registrationTx: REG, registeredAtMs: 123,
  registry: chain.erc8004!.identity, chainId: chain.chainId }
const argv = () => ["register", SKILL, "--approve-operator", OPERATOR]
const PRIVATE = "PRIVATE_DIAGNOSTIC_SENTINEL"
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe("strict public hub metadata", () => {
  it("accepts a fully armed, pinned Arc testnet document", () => {
    expect(hubErc8004Refusal(document(), HUB)).toBeUndefined()
  })
  it.each([null, [], "<html>secret</html>", {}, { ...document(), armed: "true" }, Object.create(document())])("refuses non-document or inherited metadata", (doc) => {
    expect(hubErc8004Refusal(doc, HUB)).toBeTypeOf("string")
  })
  it("explains unarmed hubs without claiming registration happened", () => {
    expect(hubErc8004Refusal({ armed: false }, HUB)).toMatch(/ERC-8004.*unarmed/)
  })
  it.each(["operator", "validator", "attester"])("requires a real nonzero %s address", (role) => {
    for (const value of [undefined, "0x1", zeroAddress]) expect(hubErc8004Refusal({ ...document(), [role]: value }, HUB)).toContain(role)
  })
  it("requires three distinct roles, correct chain, and each pinned registry", () => {
    expect(hubErc8004Refusal({ ...document(), attester: OPERATOR }, HUB)).toMatch(/distinct/)
    expect(hubErc8004Refusal({ ...document(), caip2: "eip155:1" }, HUB)).toMatch(/chain|network/)
    for (const name of ["identity", "reputation", "validation"]) {
      expect(hubErc8004Refusal({ ...document(), registries: { ...chain.erc8004, [name]: OPERATOR } }, HUB)).toMatch(/registr/)
    }
  })
  it("validates an optional numeric chain id against the same pinned chain", () => {
    expect(hubErc8004Refusal({ ...document(), chainId: chain.chainId }, HUB)).toBeUndefined()
    for (const chainId of [1, "5042002", null, undefined, NaN, 5042002.5]) {
      expect(hubErc8004Refusal({ ...document(), chainId }, HUB)).toMatch(/chain|network/)
    }
  })
  it("refuses mainnet/pending even when the hub claims to be armed", () => {
    vi.stubEnv("ARCADE_NETWORK", "arc-mainnet")
    expect(hubErc8004Refusal(document(), HUB)).toMatch(/testnet|pending/)
  })
  it("does not echo private malformed metadata or URL credentials", () => {
    expect(hubErc8004Refusal(PRIVATE, `https://user:${PRIVATE}@hub.example`)).not.toContain(PRIVATE)
  })
  it("names available local skills and formats honest native gas units", () => {
    expect(skillRefusal(SKILL, [SKILL])).toBeUndefined()
    expect(skillRefusal("missing", [SKILL])).toContain(SKILL)
    const text = unfundedMessage(new UnfundedSeller({ address: SELLER, balanceWei: 1_000_000_000_000_000n }), "https://faucet.circle.com")
    expect(text).toContain("0.001"); expect(text).toContain("0.05")
    expect(text).toMatch(/gas on Arc is USDC/i); expect(text).toMatch(/not a guarantee/i)
    expect(text).not.toMatch(/one.*job.*enough|already holds enough/i)
  })
})

const attempt = <A>(f: () => A) => Effect.try({ try: f, catch: error => error })
const fixture = (config: Partial<RunnerConfig> = {}) => {
  let state = defaultConfig({ sellerAddress: SELLER, hubUrl: HUB, ...config })
  const events: string[] = [], output: string[] = []
  const writes: string[] = []
  const client: IdentityClient = {
    address: SELLER, getBalance: vi.fn(async () => MIN_GAS_WEI),
    writeContract: vi.fn(async (args) => {
      const name = (args as { functionName: string }).functionName
      writes.push(name); events.push(name)
      return name === "register" ? REG : APP
    }),
    getTransactionReceipt: vi.fn(async ({ hash }) => ({ status: "success", logs: hash === REG ? [{ address: chain.erc8004!.identity,
      topics: encodeEventTopics({ abi: IDENTITY_REGISTRY_ABI, eventName: "Registered", args: { agentId: 42n, owner: SELLER } }),
      data: encodeAbiParameters([{ type: "string" }], [URI])
    }] : [] })),
    readContract: vi.fn(async (args) => {
      const name = (args as { functionName: string }).functionName
      return name === "ownerOf" ? SELLER : name === "tokenURI" ? URI : false
    })
  }
  const deps: IdentityCliDependencies = {
    readConfig: Effect.sync(() => structuredClone(state)), configPath: () => "/isolated/config.json",
    loadSkillIds: vi.fn(() => Effect.succeed([SKILL])), resolveKey: vi.fn(() => Effect.succeed({ privateKey: KEY })),
    makeClient: vi.fn(() => client), fetch: vi.fn(async () => Response.json(document())), log: line => output.push(line), now: () => 123,
    beginRegistration: vi.fn((skillId, intent) => attempt(() => {
      if (state.agents[skillId] || state.pendingAgents?.[skillId]) throw new Error("already pending")
      events.push("intent"); state = { ...state, pendingAgents: { ...state.pendingAgents, [skillId]: intent } }; return state
    })),
    recordPending: vi.fn((skillId, pending) => attempt(() => {
      events.push("hash"); state = { ...state, pendingAgents: { ...state.pendingAgents, [skillId]: pending } }; return state
    })),
    recordIdentity: vi.fn((skillId, saved) => attempt(() => {
      events.push(saved.operator ? "saved-approval" : "saved-registration")
      const pendingAgents = { ...state.pendingAgents }; delete pendingAgents[skillId]
      state = { ...state, agents: { ...state.agents, [skillId]: saved }, pendingAgents }; return state
    }))
  }
  return { deps, client, writes, events, output, state: () => state,
    run: (args = argv()) => Effect.runPromise(runIdentityCommand(args, { deps, skillsDirDefault: "/fixtures" })) }
}

describe("identity command sequencing and recovery", () => {
  it.each([[], ["oops"], ["register"], ["register", SKILL], ["status", "--skills", "/tmp"],
    ["register", SKILL, "--approve-operator", "0x1"], [...argv(), "--unknown"], [...argv(), "--approve-operator", OPERATOR], [...argv(), "--", "ignored"]].map(args => ({ args })))(
    "refuses invalid syntax/absent consent before config, fetch, or keys", async ({ args }) => {
      const f = fixture(); const read = vi.fn(() => f.state())
      f.deps.readConfig = Effect.sync(read)
      await expect(f.run(args)).rejects.toThrow(/usage|approve-operator|option|status/i)
      expect(read).not.toHaveBeenCalled(); expect(f.deps.fetch).not.toHaveBeenCalled(); expect(f.deps.resolveKey).not.toHaveBeenCalled()
    })
  it("status is offline and labels recorded approval plus known/unknown pending attempts", async () => {
    const f = fixture({ agents: { [SKILL]: { ...identity, operator: OPERATOR, approvalTx: APP } }, pendingAgents: {
      "known-pending": { txHash: REG, agentURI: URI, registry: chain.erc8004!.identity, chainId: chain.chainId, submittedAtMs: 123 },
      "unknown-pending": { agentURI: URI, registry: chain.erc8004!.identity, chainId: chain.chainId, submittedAtMs: 123 }
    } })
    await f.run(["status"])
    expect(f.output.join("\n")).toMatch(/recorded.*not.*checked/i)
    expect(f.output.join("\n")).toContain(REG); expect(f.output.join("\n")).toMatch(/unknown.*reconcile/i)
    expect(f.deps.fetch).not.toHaveBeenCalled(); expect(f.deps.resolveKey).not.toHaveBeenCalled(); expect(f.deps.makeClient).not.toHaveBeenCalled()
  })
  it("rejects unknown skills without reaching the hub", async () => {
    const f = fixture(); await expect(f.run(["register", "unknown", "--approve-operator", OPERATOR])).rejects.toThrow(SKILL)
    expect(f.deps.fetch).not.toHaveBeenCalled(); expect(f.deps.resolveKey).not.toHaveBeenCalled()
  })
  it.each(["unarmed", "wrong-consent", "seller-role"])("refuses %s before key resolution or intent", async (mode) => {
    const f = fixture()
    if (mode !== "wrong-consent") f.deps.fetch = vi.fn(async () => Response.json(mode === "unarmed" ? { armed: false } : { ...document(), attester: SELLER }))
    await expect(f.run(mode === "wrong-consent" ? ["register", SKILL, "--approve-operator", VALIDATOR] : argv())).rejects.toThrow()
    expect(f.deps.resolveKey).not.toHaveBeenCalled(); expect(f.deps.beginRegistration).not.toHaveBeenCalled(); expect(f.writes).toEqual([])
  })
  it("checks the actual resolved key matches the saved seller", async () => {
    const f = fixture(); f.deps.resolveKey = vi.fn(() => Effect.succeed({ privateKey: `0x${"55".repeat(32)}` }))
    await expect(f.run()).rejects.toThrow(/key.*seller|seller.*key/i)
    expect(f.deps.makeClient).not.toHaveBeenCalled(); expect(f.deps.beginRegistration).not.toHaveBeenCalled()
  })
  it("sanitizes a key-resolution Effect defect as well as typed failures", async () => {
    const f = fixture(); f.deps.resolveKey = () => Effect.die(new Error(PRIVATE))
    const error = await f.run().catch(error => error)
    expect(String(error)).not.toContain(PRIVATE); expect(String(error)).toMatch(/signing key/)
    expect(f.deps.beginRegistration).not.toHaveBeenCalled()
  })
  it.each(["resolveKey", "loadSkillIds", "beginRegistration", "recordIdentity"] as const)("sanitizes %s throwing before it returns an Effect", async name => {
    const f = fixture(); f.deps[name] = () => { throw new Error(PRIVATE) }
    const error = await f.run().catch(error => error)
    expect(error).toBeInstanceOf(Error); expect(String(error)).not.toContain(PRIVATE)
    expect(f.writes).not.toContain("setApprovalForAll")
  })
  it("refuses low gas before creating an intent checkpoint", async () => {
    const f = fixture(); f.client.getBalance = vi.fn(async () => 0n)
    await expect(f.run()).rejects.toThrow(/0.05/)
    expect(f.deps.beginRegistration).not.toHaveBeenCalled(); expect(f.state().pendingAgents).toEqual({}); expect(f.writes).toEqual([])
  })
  it("journals intent/hash and confirmed registration BEFORE approval, with full consent warning", async () => {
    const f = fixture(); await f.run()
    expect(f.events).toEqual(["intent", "register", "hash", "saved-registration", "setApprovalForAll", "saved-approval"])
    expect(f.state().agents[SKILL]).toEqual({ ...identity, operator: OPERATOR, approvalTx: APP })
    expect(f.output.join("\n")).toMatch(/ALL.*current.*future.*identity NFTs/i)
    expect(f.output.join("\n")).toMatch(/transfer/i); expect(f.output.join("\n")).toContain(`setApprovalForAll(${OPERATOR}, false)`)
  })
  it("a failed approval leaves registration saved and the next run never remints", async () => {
    const f = fixture(), write = f.client.writeContract
    f.client.writeContract = async args => {
      if ((args as { functionName: string }).functionName === "setApprovalForAll") throw new Error(PRIVATE)
      return write(args)
    }
    await expect(f.run()).rejects.toThrow(/registration.*saved|saved.*registration/i)
    expect(f.state().agents[SKILL]).toEqual(identity)
    f.client.readContract = async args => {
      const name = (args as { functionName: string }).functionName
      return name === "ownerOf" ? SELLER : name === "tokenURI" ? URI : true
    }
    await f.run()
    expect(f.writes).toEqual(["register"])
    expect(f.state().agents[SKILL]?.registrationTx).toBe(REG)
  })
  it("reports a confirmed registration revert truthfully and retains its pending hash", async () => {
    const f = fixture(); f.client.getTransactionReceipt = async () => ({ status: "reverted", logs: [] })
    await expect(f.run()).rejects.toThrow(/registration transaction.*reverted/i)
    expect(f.state().pendingAgents?.[SKILL]?.txHash).toBe(REG); expect(f.state().agents[SKILL]).toBeUndefined()
  })
  it("keeps an unknown broadcast intent and refuses a rerun without reaching keys or hub", async () => {
    const f = fixture(); f.client.writeContract = vi.fn(async () => { throw new Error(PRIVATE) })
    await expect(f.run()).rejects.toThrow(/unknown|reconcile/i)
    expect(f.state().pendingAgents?.[SKILL]).toBeDefined()
    vi.mocked(f.deps.fetch).mockClear(); vi.mocked(f.deps.resolveKey).mockClear()
    await expect(f.run()).rejects.toThrow(/unknown.*reconcile|reconcile.*unknown/i)
    expect(f.deps.fetch).not.toHaveBeenCalled(); expect(f.deps.resolveKey).not.toHaveBeenCalled()
    expect(f.client.writeContract).toHaveBeenCalledTimes(1)
  })
  it("a failed hash journal retains the known hash in a safe error and never approves", async () => {
    const f = fixture(); f.deps.recordPending = () => Effect.fail(new Error(PRIVATE))
    await expect(f.run()).rejects.toThrow(REG)
    expect(f.writes).toEqual(["register"]); expect(f.state().agents[SKILL]).toBeUndefined()
  })
  it("resumes a known hash without gas checks or mint, then persists before approval", async () => {
    const f = fixture({ pendingAgents: { [SKILL]: { txHash: REG, agentURI: URI, registry: chain.erc8004!.identity, chainId: chain.chainId, submittedAtMs: 100 } } })
    await f.run()
    expect(f.client.getBalance).not.toHaveBeenCalled(); expect(f.deps.beginRegistration).not.toHaveBeenCalled()
    expect(f.events).toEqual(["saved-registration", "setApprovalForAll", "saved-approval"])
  })
  it("does not approve if confirmed registration could not be saved", async () => {
    const f = fixture(); f.deps.recordIdentity = () => Effect.fail(new Error(PRIVATE))
    await expect(f.run()).rejects.toThrow(/save.*registration|registration.*save/i)
    expect(f.writes).toEqual(["register"]); expect(f.state().pendingAgents?.[SKILL]?.txHash).toBe(REG)
  })
  it("a competing intent reservation prevents every broadcast", async () => {
    const f = fixture(); f.deps.beginRegistration = () => Effect.fail(new Error("competing writer"))
    await expect(f.run()).rejects.toThrow(/checkpoint|intent|config/i)
    expect(f.writes).toEqual([])
  })
  it("preserves the old approval hash when the same operator is already approved", async () => {
    const f = fixture({ agents: { [SKILL]: { ...identity, operator: OPERATOR, approvalTx: APP } } })
    f.client.readContract = async args => (args as { functionName: string }).functionName === "ownerOf" ? SELLER
      : (args as { functionName: string }).functionName === "tokenURI" ? URI : true
    await f.run(); expect(f.state().agents[SKILL]?.approvalTx).toBe(APP); expect(f.writes).toEqual([])
  })
  it.each([{ registry: undefined }, { chainId: undefined }, { chainId: 1 }, { agentURI: "https://other.example" }])("refuses existing identities with missing/changed provenance", async over => {
    const f = fixture({ agents: { [SKILL]: { ...identity, ...over } } })
    await expect(f.run()).rejects.toThrow(/provenance|registry|chain|URI/i)
    expect(f.deps.resolveKey).not.toHaveBeenCalled(); expect(f.writes).toEqual([])
  })
  it.each(["ownerOf", "tokenURI"])("revalidates existing %s before approving", async field => {
    const f = fixture({ agents: { [SKILL]: identity } })
    f.client.readContract = async args => (args as { functionName: string }).functionName === field ? "wrong" : SELLER
    await expect(f.run()).rejects.toThrow(/owner|URI/i); expect(f.writes).toEqual([])
  })
})

describe("bounded hub metadata fetch", () => {
  it("uses an explicit redirect refusal and supports loopback HTTP only", async () => {
    const fetch = vi.fn(async () => Response.json(document()))
    expect(await fetchIdentityHub("http://127.0.0.1:8787", fetch)).toEqual(document())
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8787/erc8004", expect.objectContaining({ redirect: "error" }))
    await expect(fetchIdentityHub("http://public.example", fetch)).rejects.toThrow(/HTTPS|loopback/)
  })
  it.each(["https://user:secret@hub.example", "https://hub.example?token=secret", "file:///secret", "https://hub.example/non-root"])("refuses unsafe origins before fetch", async url => {
    const fetch = vi.fn(); await expect(fetchIdentityHub(url, fetch)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled()
  })
  it.each([401, 404, 500, 302])("rejects HTTP %s without interpreting its body", async status => {
    await expect(fetchIdentityHub(HUB, async () => new Response(PRIVATE, { status }))).rejects.toThrow(/HTTP|redirect/)
  })
  it("refuses a followed redirect even from a custom transport", async () => {
    const response = Response.json(document()); Object.defineProperty(response, "redirected", { value: true })
    await expect(fetchIdentityHub(HUB, async () => response)).rejects.toThrow(/redirect/)
  })
  it.each(["malformed", "declared-large", "stream-large"])("refuses %s metadata without echoing its body", async mode => {
    const response = mode === "malformed" ? new Response(PRIVATE) : new Response("x".repeat(65_537),
      mode === "declared-large" ? { headers: { "content-length": "65537" } } : undefined)
    const error = await fetchIdentityHub(HUB, async () => response).catch(error => error)
    expect(error).toBeInstanceOf(Error); expect(String(error)).not.toContain(PRIVATE)
  })
  it.each(["headers", "body"])("has one deadline covering stalled %s", async mode => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => mode === "headers" ? await new Promise<Response>(() => {}) : new Response(new ReadableStream({ start() {} })))
    const result = fetchIdentityHub(HUB, fetch).catch(error => error)
    await vi.advanceTimersByTimeAsync(10_001)
    expect(await result).toBeInstanceOf(Error)
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true)
  })
})

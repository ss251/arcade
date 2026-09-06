import { afterEach, describe, expect, it, vi } from "vitest"
import { privateKeyToAccount } from "viem/accounts"
import { recoverTypedDataAddress } from "viem"
import chain from "../../../config/chains/arc-testnet.json"
import { signOrdinaryPayment } from "../src/lib/ordinary-payment-sign.ts"
import type { Eip1193Provider } from "../src/lib/wallet.ts"

const account = privateKeyToAccount(`0x${"01".repeat(32)}`)
const other = privateKeyToAccount(`0x${"02".repeat(32)}`)
const SELLER = `0x${"3".repeat(40)}`, SPLITTER = `0x${"4".repeat(40)}`
const hexChain = `0x${chain.chainId.toString(16)}`
const context = (rail = "eip3009", split = false) => {
  const payTo = split ? SPLITTER : SELLER, resource = `/x/${SELLER}/diff-triage`
  return { hubOrigin: "https://hub.example", skillId: "diff-triage", seller: SELLER,
    resource, amountAtomic: "10000", payTo, asset: chain.usdc.address, network: chain.caip2, rail,
    requirements: { scheme: "exact", network: chain.caip2, amount: "10000", asset: chain.usdc.address,
      payTo, resource: "https://hub.example" + resource, maxTimeoutSeconds: 604900, mimeType: "application/json",
      extra: rail === "gateway" ? { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway.wallet }
        : { name: "USDC", version: "2", ...(split ? { feeSplitter: SPLITTER, feeSplitterVersion: 2 } : {}) } } }
}
type SignRequest = Parameters<typeof account.signTypedData>[0]
type RpcArgs = Parameters<Eip1193Provider["request"]>[0]
const fixture = (options: {
  sign?: (wire: SignRequest, args: RpcArgs) => Promise<unknown>
  chains?: unknown[]; accounts?: unknown[]
} = {}) => {
  let chainReads = 0, accountReads = 0
  const requests: SignRequest[] = []
  const request = vi.fn(async (args: RpcArgs): Promise<unknown> => {
    if (args.method === "eth_chainId") return options.chains?.[chainReads++] ?? hexChain
    if (args.method === "eth_accounts") return options.accounts?.[accountReads++] ?? [account.address]
    if (args.method === "eth_signTypedData_v4") {
      const wire = JSON.parse(args.params?.[1] as string) as SignRequest
      requests.push(wire)
      return options.sign ? options.sign(wire, args) : account.signTypedData(wire)
    }
    throw Error("PRIVATE_UNEXPECTED_RPC")
  })
  return { provider: { request }, request, requests }
}
const signs = (f: ReturnType<typeof fixture>) => f.request.mock.calls.filter(([a]) => a.method === "eth_signTypedData_v4").length
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe("ordinary browser signing boundary", () => {
  it.each(["eip3009", "gateway"])("recovers the fixture buyer over the actual shared %s domain", async rail => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000)
    const f = fixture(), c = context(rail)
    const result = await signOrdinaryPayment(f.provider, c, account.address)
    expect(result).toMatchObject({ from: account.address, to: SELLER, value: "10000",
      validAfter: rail === "gateway" ? "1799999400" : "0", validBefore: "1800604900" })
    expect(result.nonce).toMatch(/^0x[0-9a-f]{64}$/)
    expect(Object.isFrozen(result)).toBe(true)
    const { TRANSFER_TYPES, EIP712_DOMAIN } = await import("../../../packages/payments/src/eip3009.ts")
    const { gatewayDomain } = await import("../../../packages/payments/src/gateway-sign.ts")
    const { PaymentRequirements } = await import("../../../packages/payments/src/types.ts")
    const domain = rail === "gateway" ? gatewayDomain(PaymentRequirements.make({ ...c.requirements, scheme: "exact" })) : EIP712_DOMAIN
    expect(f.requests[0]?.domain).toEqual(domain)
    expect(f.requests[0]?.types.TransferWithAuthorization).toEqual(TRANSFER_TYPES.TransferWithAuthorization)
    const recovered = await recoverTypedDataAddress({ ...f.requests[0]!, signature: result.signature as `0x${string}` })
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
    if (rail === "gateway") {
      expect((await recoverTypedDataAddress({ ...f.requests[0]!, domain: EIP712_DOMAIN, signature: result.signature as `0x${string}` })).toLowerCase()).not.toBe(account.address.toLowerCase())
    }
    expect(f.request.mock.calls.map(([a]) => a.method)).toEqual([
      "eth_chainId", "eth_accounts", "eth_signTypedData_v4", "eth_chainId", "eth_accounts"
    ])
  })
  it("binds the actual EIP3009 splitter payee and keeps the seller distinct", async () => {
    const f = fixture()
    expect(await signOrdinaryPayment(f.provider, context("eip3009", true), account.address)).toMatchObject({ to: SPLITTER, value: "10000" })
    expect(signs(f)).toBe(1)
  })
  it("captures source context and provider method synchronously", async () => {
    const f = fixture(), c = context(), original = f.provider.request
    const run = signOrdinaryPayment(f.provider, c, account.address)
    c.payTo = SPLITTER; c.requirements.payTo = SPLITTER; c.requirements.extra.name = "changed"
    f.provider.request = vi.fn(async () => { throw Error("replaced method") })
    expect(await run).toMatchObject({ to: SELLER })
    expect(original).toHaveBeenCalledTimes(5)
    expect(f.provider.request).not.toHaveBeenCalled()
  })
  it("does not pass mutable signing objects to the wallet", async () => {
    const f = fixture({ sign: async (wire, args) => {
      expect(Object.isFrozen(args)).toBe(true); expect(Object.isFrozen(args.params)).toBe(true)
      expect(typeof args.params?.[1]).toBe("string")
      return account.signTypedData(wire)
    } })
    await signOrdinaryPayment(f.provider, context(), account.address)
    expect(signs(f)).toBe(1)
  })
  it.each(["test", "unknown"])("refuses %s before any wallet call", async rail => {
    const f = fixture()
    await expect(signOrdinaryPayment(f.provider, context(rail), account.address)).rejects.toMatchObject({ code: "refused" })
    expect(f.request).not.toHaveBeenCalled()
  })
  it.each([
    { network: "eip155:1" }, { asset: SPLITTER }, { payTo: SPLITTER }, { amountAtomic: "0" },
    { extra: "not a field" }, { requirements: { extra: { name: "GatewayWalletBatched" } } }
  ])("refuses malformed context before wallet access %j", async change => {
    const f = fixture()
    await expect(signOrdinaryPayment(f.provider, { ...context(), ...change }, account.address)).rejects.toMatchObject({ code: "refused" })
    expect(f.request).not.toHaveBeenCalled()
  })
  it("does not invoke a context getter or reflect a revoked proxy error", async () => {
    const f = fixture(), getter = vi.fn(() => { throw Error("PRIVATE_GETTER") }), c = context()
    Object.defineProperty(c, "payTo", { enumerable: true, get: getter })
    await expect(signOrdinaryPayment(f.provider, c, account.address)).rejects.toMatchObject({ code: "refused" })
    const proxy = Proxy.revocable({}, {}); proxy.revoke()
    await expect(signOrdinaryPayment(f.provider, proxy.proxy, account.address)).rejects.toMatchObject({ code: "refused" })
    expect(getter).not.toHaveBeenCalled(); expect(f.request).not.toHaveBeenCalled()
  })
  it.each([undefined, "0x0", `0x${"0".repeat(40)}`, `0x${"a".repeat(40)}\n`])("refuses malformed buyer %s", async from => {
    const f = fixture()
    await expect(signOrdinaryPayment(f.provider, context(), from)).rejects.toMatchObject({ code: "refused" })
    expect(f.request).not.toHaveBeenCalled()
  })
  it.each(["0x1", "5042002", 5042002, { toString: () => hexChain }])("refuses wrong/noncanonical chain before signing %j", async value => {
    const f = fixture({ chains: [value] })
    await expect(signOrdinaryPayment(f.provider, context(), account.address)).rejects.toMatchObject({ code: "refused" })
    expect(signs(f)).toBe(0)
  })
  it.each([[], [other.address, account.address], [account.address, "bad"], account.address].map(value => [value]))("refuses wrong/malformed account list %j", async value => {
    const f = fixture({ accounts: [value] })
    await expect(signOrdinaryPayment(f.provider, context(), account.address)).rejects.toMatchObject({ code: "refused" })
    expect(signs(f)).toBe(0)
  })
  it.each(["chain", "account"])("never releases a signed result after %s drift", async kind => {
    const f = fixture(kind === "chain" ? { chains: [hexChain, "0x1"] } : { accounts: [[account.address], [other.address]] })
    await expect(signOrdinaryPayment(f.provider, context(), account.address)).rejects.toMatchObject({ code: "signing_uncertain" })
    expect(signs(f)).toBe(1)
  })
  it("uses only own numeric 4001 as a wallet-reported decline; no message coercion", async () => {
    const f = fixture({ sign: async () => { throw { code: 4001, message: "PRIVATE_ERROR" } } })
    await expect(signOrdinaryPayment(f.provider, context(), account.address)).rejects.toMatchObject({ code: "declined" })
    expect(signs(f)).toBe(1)
  })
  it("keeps provider text/accessors private and does not classify by message text", async () => {
    const getter = vi.fn(() => { throw Error("PRIVATE_CODE") })
    const error = Object.defineProperty({ message: "denied PRIVATE_PROVIDER" }, "code", { get: getter })
    const f = fixture({ sign: async () => { throw error } })
    await expect(signOrdinaryPayment(f.provider, context(), account.address)).rejects.toMatchObject({
      code: "signing_uncertain", message: "Wallet authorization unavailable; a signature may exist. This browser did not submit it."
    })
    expect(getter).not.toHaveBeenCalled()
  })
  it.each(["0x", `0x${"0".repeat(130)}`, `0x${"1".repeat(130)}`, { signature: "private" }])("rejects malformed signature %j without retry", async signature => {
    const f = fixture({ sign: async () => signature })
    await expect(signOrdinaryPayment(f.provider, context(), account.address)).rejects.toMatchObject({ code: "signing_uncertain" })
    expect(signs(f)).toBe(1)
  })
  it.each(["signer", "domain", "message"])("rejects a real signature for another %s", async target => {
    const f = fixture({ sign: wire => target === "signer" ? other.signTypedData(wire)
      : account.signTypedData(target === "domain" ? { ...wire, domain: { ...wire.domain, verifyingContract: SPLITTER as `0x${string}` } }
        : { ...wire, message: { ...wire.message, value: "10001" } }) })
    await expect(signOrdinaryPayment(f.provider, context("gateway"), account.address)).rejects.toMatchObject({ code: "signing_uncertain" })
    expect(signs(f)).toBe(1)
  })
  it("refuses before wallet work when already aborted", async () => {
    const controller = new AbortController(); controller.abort("PRIVATE_REASON")
    const f = fixture()
    await expect(signOrdinaryPayment(f.provider, context(), account.address, { signal: controller.signal })).rejects.toMatchObject({ code: "refused" })
    expect(f.request).not.toHaveBeenCalled()
  })
  it.each([0, -1, 120001, Infinity, 1.5, null])("rejects an invalid overall deadline %s", async timeoutMs => {
    const f = fixture()
    await expect(signOrdinaryPayment(f.provider, context(), account.address, { timeoutMs } as never)).rejects.toMatchObject({ code: "refused" })
    expect(f.request).not.toHaveBeenCalled()
  })
  it("closes a pending wallet prompt on abort and ignores its late real signature", async () => {
    const controller = new AbortController()
    let finish!: (value: unknown) => void, entered!: () => void
    const seen = new Promise<void>(resolve => { entered = resolve })
    const f = fixture({ sign: () => { entered(); return new Promise(resolve => { finish = resolve }) } })
    const run = signOrdinaryPayment(f.provider, context(), account.address, { signal: controller.signal })
    const rejected = expect(run).rejects.toMatchObject({ code: "signing_uncertain" })
    await seen; controller.abort("PRIVATE_ABORT"); await rejected
    finish(await account.signTypedData(f.requests[0]!)); await Promise.resolve(); await Promise.resolve()
    expect(f.request.mock.calls.map(([a]) => a.method)).toEqual(["eth_chainId", "eth_accounts", "eth_signTypedData_v4"])
  })
  it("bounds an uncooperative pre-sign wallet read", async () => {
    const provider = { request: vi.fn(() => new Promise<unknown>(() => {})) }
    await expect(signOrdinaryPayment(provider, context(), account.address, { timeoutMs: 20 })).rejects.toMatchObject({ code: "refused" })
    expect(provider.request).toHaveBeenCalledTimes(1)
  })
  it("bounds an uncooperative signing prompt without a retry", async () => {
    const f = fixture({ sign: () => new Promise<unknown>(() => {}) })
    await expect(signOrdinaryPayment(f.provider, context(), account.address, { timeoutMs: 100 })).rejects.toMatchObject({ code: "signing_uncertain" })
    expect(signs(f)).toBe(1)
  })
  it.each([NaN, -1, 599999, Number.MAX_SAFE_INTEGER])("refuses invalid wall time %s before signing", async wallTime => {
    vi.spyOn(Date, "now").mockReturnValue(wallTime)
    const f = fixture()
    await expect(signOrdinaryPayment(f.provider, context("gateway"), account.address)).rejects.toMatchObject({ code: "refused" })
    expect(signs(f)).toBe(0)
  })
  it("imports passively with an invalid ambient selector and no wallet or network access", async () => {
    vi.resetModules(); vi.stubEnv("ARCADE_NETWORK", "PRIVATE_INVALID_NETWORK")
    const io = vi.fn(() => { throw Error("IO_UNEXPECTED") })
    vi.stubGlobal("fetch", io)
    vi.stubGlobal("ethereum", Object.defineProperty({}, "request", { get: io }))
    try {
      const mod = await import("../src/lib/ordinary-payment-sign.ts")
      expect(typeof mod.signOrdinaryPayment).toBe("function")
      expect(io).not.toHaveBeenCalled()
      const f = fixture()
      await expect(mod.signOrdinaryPayment(f.provider, context(), account.address)).rejects.toMatchObject({ code: "refused" })
      expect(f.request).not.toHaveBeenCalled()
    } finally { vi.resetModules() } // Do not retain this deliberately failed dependency evaluation.
  })
  it("refuses accessor or extra options without evaluating getters", async () => {
    const f = fixture(), getter = vi.fn(() => 10)
    const options = Object.defineProperty({}, "timeoutMs", { enumerable: true, get: getter })
    await expect(signOrdinaryPayment(f.provider, context(), account.address, options)).rejects.toMatchObject({ code: "refused" })
    await expect(signOrdinaryPayment(f.provider, context(), account.address, { extra: true } as never)).rejects.toMatchObject({ code: "refused" })
    expect(getter).not.toHaveBeenCalled(); expect(f.request).not.toHaveBeenCalled()
  })
  it("rejects a high-s flip-v signature even when it recovers the same buyer", async () => {
    const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
    let equivalent = false
    const f = fixture({ sign: async wire => {
      const original = await account.signTypedData(wire)
      const highS = (order - BigInt("0x" + original.slice(66, 130))).toString(16).padStart(64, "0")
      const signature = (original.slice(0, 66) + highS + (original.slice(130) === "1b" ? "1c" : "1b")) as `0x${string}`
      expect((await recoverTypedDataAddress({ ...wire, signature })).toLowerCase()).toBe(account.address.toLowerCase())
      equivalent = true
      return signature
    } })
    await expect(signOrdinaryPayment(f.provider, context("gateway"), account.address)).rejects.toMatchObject({ code: "signing_uncertain" })
    expect(signs(f)).toBe(1)
    expect(equivalent).toBe(true)
  })
  it.each([NaN, -1, Infinity])("rejects invalid monotonic start %s before wallet work", async value => {
    vi.spyOn(performance, "now").mockReturnValue(value)
    const f = fixture()
    await expect(signOrdinaryPayment(f.provider, context(), account.address)).rejects.toMatchObject({ code: "refused" })
    expect(f.request).not.toHaveBeenCalled()
  })
  it("rejects a backward monotonic clock before wallet work", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValue(99)
    const f = fixture()
    await expect(signOrdinaryPayment(f.provider, context(), account.address)).rejects.toMatchObject({ code: "refused" })
    expect(f.request).not.toHaveBeenCalled()
  })
  it.each(["expired", "backward"])("never releases a signature after %s wall time", async kind => {
    let wall = 1_800_000_000_000
    vi.spyOn(Date, "now").mockImplementation(() => wall)
    const f = fixture({ sign: async wire => {
      const signature = await account.signTypedData(wire)
      wall += kind === "expired" ? 604900000 : -1
      return signature
    } })
    await expect(signOrdinaryPayment(f.provider, context("gateway"), account.address)).rejects.toMatchObject({ code: "signing_uncertain" })
    expect(signs(f)).toBe(1)
  })
  it("refuses a zero nonce from unavailable randomness without signer entry", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (value: Uint8Array) => value })
    const f = fixture()
    await expect(signOrdinaryPayment(f.provider, context(), account.address)).rejects.toMatchObject({ code: "refused" })
    expect(signs(f)).toBe(0)
  })
  it("removes its external abort listener on success", async () => {
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, "addEventListener"), remove = vi.spyOn(controller.signal, "removeEventListener")
    await signOrdinaryPayment(fixture().provider, context(), account.address, { signal: controller.signal })
    expect(add).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1)
    expect(remove.mock.calls[0]?.[1]).toBe(add.mock.calls[0]?.[1])
  })
})

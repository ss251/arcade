/** Explicit browser wallet boundary, not approval authority. Consume H10b1 first.
 * Never store/serialize returned signatures into server, transcript or model data.
 * No HTTP, transaction broadcast, connect/switch, retry or ambient import-time selection.
 */
import { capturePurchaseContext } from "./purchase-context.ts"
import type { Eip1193Provider } from "./wallet.ts"
import type { SignedAuthorization } from "./sign.ts"

export type OrdinarySignCode = "refused" | "declined" | "signing_uncertain"
export class OrdinaryPaymentSignFailure extends Error {
  readonly _tag = "OrdinaryPaymentSignFailure"
  constructor(readonly code: OrdinarySignCode) {
    super(code === "refused" ? "Wallet authorization unavailable; this browser did not request a signature."
      : code === "declined" ? "The wallet reported a declined signature. This browser did not submit it."
        : "Wallet authorization unavailable; a signature may exist. This browser did not submit it.")
    this.name = "OrdinaryPaymentSignFailure"
  }
}
export interface OrdinarySignOptions { readonly signal?: AbortSignal; readonly timeoutMs?: number }
const MAX_MS = 120000, UINT256_MAX = (1n << 256n) - 1n
const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const fail = (): never => { throw 0 }
const address = (value: unknown): value is `0x${string}` => typeof value === "string" &&
  value.length === 42 && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value)
const data = (value: unknown, fields: readonly string[]): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail()
  const result: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !fields.includes(key)) return fail()
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !("value" in descriptor)) return fail()
    result[key] = descriptor.value
  }
  return result
}
const optionsOf = (value: unknown) => {
  const v = data(value, ["signal", "timeoutMs"])
  if (v.signal !== undefined && !(v.signal instanceof AbortSignal)) return fail()
  const timeoutMs = v.timeoutMs === undefined ? MAX_MS : v.timeoutMs
  if (typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_MS) return fail()
  return { signal: v.signal as AbortSignal | undefined, timeoutMs }
}
const accountIs = (value: unknown, from: string): boolean => {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < 1 || value.length > 32 || Reflect.ownKeys(value).length !== value.length + 1) return false
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i))
    if (!d?.enumerable || !("value" in d) || !address(d.value) || i === 0 && d.value.toLowerCase() !== from.toLowerCase()) return false
  }
  return true
}
const declined = (error: unknown): boolean => {
  try {
    if (error === null || typeof error !== "object") return false
    const d = Object.getOwnPropertyDescriptor(error, "code")
    return !!d && "value" in d && d.value === 4001
  } catch { return false }
}
const signatureOk = (v: unknown): v is `0x${string}` => {
  if (typeof v !== "string" || v.length !== 132 || !/^0x[0-9a-fA-F]{130}$/.test(v)) return false
  const r = BigInt("0x" + v.slice(2, 66)), s = BigInt("0x" + v.slice(66, 130)), recovery = v.slice(130).toLowerCase()
  return r > 0n && r < CURVE_ORDER && s > 0n && s <= CURVE_ORDER / 2n && (recovery === "1b" || recovery === "1c")
}

/** One bounded signer entry. Abort only closes local continuation: an injected
 * wallet prompt may remain open, and a signed authorization cannot be revoked here.
 * The caller separately rechecks the fresh actual-input/ENS quote before forwarding.
 */
export async function signOrdinaryPayment(provider: Eip1193Provider, input: unknown, buyer: unknown,
  options: OrdinarySignOptions = {}): Promise<Readonly<SignedAuthorization>> {
  let entered = false, reportedDecline = false, active = true
  let timer: ReturnType<typeof setTimeout> | undefined, external: AbortSignal | undefined
  let abort: (() => void) | undefined
  const controller = new AbortController()
  try {
    const context = capturePurchaseContext(input), captured = optionsOf(options)
    if (!context || context.rail === "test" || !address(buyer)) return fail()
    const from = buyer, request = provider.request // Capture this trusted provider method once, before any await.
    if (typeof request !== "function" || captured.signal?.aborted) return fail()
    external = captured.signal
    const now = performance.now.bind(performance), started = now()
    if (!Number.isFinite(started) || started < 0 || started > Number.MAX_SAFE_INTEGER - MAX_MS) return fail()
    let lastNow = started
    const deadline = started + captured.timeoutMs, signal = controller.signal
    const check = () => {
      const current = now()
      if (!active || signal.aborted || external?.aborted || !Number.isFinite(current) ||
        current < lastNow || current >= deadline) return fail()
      lastNow = current
    }
    abort = () => controller.abort()
    external?.addEventListener("abort", abort, { once: true })
    timer = setTimeout(abort, captured.timeoutMs)
    const wait = <A>(pending: Promise<A>): Promise<A> => new Promise((resolve, reject) => {
      let done = false
      const finish = (work: () => void) => { if (done) return; done = true; signal.removeEventListener("abort", stopped); work() }
      const stopped = () => finish(() => reject(0))
      signal.addEventListener("abort", stopped, { once: true })
      pending.then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
      if (signal.aborted) stopped()
    })
    const step = async <A>(operation: () => Promise<A>): Promise<A> => {
      check(); const result = await wait(operation()); check(); return result
    }

    // Existing payment helpers own the selected pinned configuration and no-fallback
    // checks. Their environment-selecting dependency graph is action-local, not passive.
    const { paymentRequirementsKind, gatewayDomain } = await step(() => import("../../../../packages/payments/src/gateway-sign.ts"))
    const { TRANSFER_TYPES, EIP712_DOMAIN } = await step(() => import("../../../../packages/payments/src/eip3009.ts"))
    const { PaymentRequirements } = await step(() => import("../../../../packages/payments/src/types.ts"))
    const { recoverTypedDataAddress } = await step(() => import("viem"))
    const requirements = PaymentRequirements.make(context.requirements)
    const kind = paymentRequirementsKind(requirements)
    if ((kind === "gateway") !== (context.rail === "gateway")) return fail()
    const domain = Object.freeze({ ...(kind === "gateway" ? gatewayDomain(requirements) : EIP712_DOMAIN) })
    if (context.network !== `eip155:${domain.chainId}`) return fail()
    const types = Object.freeze({ TransferWithAuthorization: Object.freeze(
      TRANSFER_TYPES.TransferWithAuthorization.map(field => Object.freeze({ ...field }))
    ) })
    const walletMatches = async () => {
      const chain = await step(() => request.call(provider, Object.freeze({ method: "eth_chainId" })))
      if (typeof chain !== "string" || chain.length > 18 || !/^0x[1-9a-fA-F][0-9a-fA-F]*$/.test(chain) ||
        BigInt(chain) !== BigInt(domain.chainId)) return fail()
      const accounts = await step(() => request.call(provider, Object.freeze({ method: "eth_accounts" })))
      if (!accountIs(accounts, from)) return fail()
    }
    await walletMatches()
    const wall = Date.now()
    if (!Number.isSafeInteger(wall) || wall < 600000 || wall > Number.MAX_SAFE_INTEGER - 605500000) return fail()
    const seconds = BigInt(Math.floor(wall / 1000)), lifetime = BigInt(requirements.maxTimeoutSeconds)
    const random = crypto.getRandomValues(new Uint8Array(32))
    if (!(random instanceof Uint8Array) || random.byteLength !== 32 || random.every(b => b === 0)) return fail()
    const nonce = `0x${Array.from(random, b => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`
    const message = Object.freeze({ from, to: context.payTo as `0x${string}`, value: BigInt(context.amountAtomic),
      validAfter: kind === "gateway" ? seconds - 600n : 0n, validBefore: seconds + lifetime, nonce })
    if (message.value > UINT256_MAX || lifetime < 1n || message.validBefore > UINT256_MAX) return fail()
    const serialized = JSON.stringify({ domain, primaryType: "TransferWithAuthorization",
      types: { EIP712Domain: [
        { name: "name", type: "string" }, { name: "version", type: "string" },
        { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }
      ], ...types },
      message: { from, to: message.to, value: String(message.value), validAfter: String(message.validAfter),
        validBefore: String(message.validBefore), nonce } })
    check()
    let signature: unknown
    try {
      // This flag precedes even a synchronous provider throw. Never retry this request.
      entered = true
      signature = await step(() => request.call(provider, Object.freeze({
        method: "eth_signTypedData_v4", params: Object.freeze([from, serialized])
      })))
    } catch (error) {
      reportedDecline = !signal.aborted && !external?.aborted && declined(error)
      return fail()
    }
    if (!signatureOk(signature)) return fail()
    const recovered = await step(() => recoverTypedDataAddress({ domain, types, primaryType: "TransferWithAuthorization", message, signature }))
    if (recovered.toLowerCase() !== from.toLowerCase()) return fail()
    await walletMatches()
    const completedWall = Date.now()
    if (!Number.isSafeInteger(completedWall) || completedWall < wall || BigInt(Math.floor(completedWall / 1000)) >= message.validBefore) return fail()
    check()
    return Object.freeze({ from, to: message.to, value: String(message.value), validAfter: String(message.validAfter),
      validBefore: String(message.validBefore), nonce, signature })
  } catch {
    throw new OrdinaryPaymentSignFailure(reportedDecline ? "declined" : entered ? "signing_uncertain" : "refused")
  } finally {
    active = false
    if (timer !== undefined) clearTimeout(timer)
    if (external && abort) external.removeEventListener("abort", abort)
    controller.abort()
  }
}

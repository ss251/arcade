/** Private conversation lifecycle; never serialize this owner or its pending data.
 * Only the real live Confirm callback may approve. SDK flags/output are data,
 * not authority; historical calls are retired, even if they claim approval.
 */
import { parsePrice } from "../../../../packages/core/src/money.ts"
import { capturePurchaseInput, createPurchaseApprovalScope, type PurchaseApprovalToken } from "./purchase-approval.ts"
import { runPurchase, type PurchaseView } from "./purchase-run.ts"
import type { Eip1193Provider } from "./wallet.ts"

export interface PurchaseBinding {
  readonly approvalId: string; readonly toolCallId: string; readonly toolName: "arcade_call_skill"
  readonly skillId: string; readonly maxAmountUsd: string; readonly input: string
}
export interface PurchasePart {
  readonly binding: Readonly<PurchaseBinding>; readonly state: string; readonly approved: boolean; readonly ready: boolean
}
const record = (input: unknown): Record<string, unknown> => {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw 0
  const keys = Reflect.ownKeys(input)
  if (keys.length > 32) throw 0
  const copy: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    if (typeof key !== "string") throw 0
    const d = Object.getOwnPropertyDescriptor(input, key)
    if (!d?.enumerable || !("value" in d)) throw 0
    copy[key] = d.value
  }
  return copy
}
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512
const callId = (input: unknown): string | undefined => {
  try { const p = record(input); return p.type === "tool-arcade_call_skill" && id(p.toolCallId) ? p.toolCallId : undefined }
  catch { return undefined }
}
export const capturePurchasePart = (input: unknown): Readonly<PurchasePart> | undefined => {
  try {
    const p = record(input), a = record(p.approval), args = record(p.input)
    if (p.type !== "tool-arcade_call_skill" || !id(p.toolCallId) || !id(a.id) ||
      typeof p.state !== "string" || !["approval-requested", "approval-responded", "output-available", "output-error", "output-denied"].includes(p.state) ||
      p.state === "approval-requested" && Object.hasOwn(a, "approved") ||
      p.preliminary !== undefined && typeof p.preliminary !== "boolean" ||
      a.approved !== undefined && typeof a.approved !== "boolean" ||
      typeof args.skillId !== "string" || args.skillId.length > 64 || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(args.skillId) ||
      typeof args.maxAmountUsd !== "string" || args.maxAmountUsd.length > 100 || parsePrice(args.maxAmountUsd) >= 1n << 256n) return undefined
    const captured = capturePurchaseInput(args.input === undefined ? {} : args.input)
    if (captured === undefined) return undefined
    let ready = false
    if (p.state === "output-available" && a.approved === true && p.preliminary !== true) {
      const output = record(p.output)
      ready = output.awaitingSignature === true && output.toolCallId === p.toolCallId && output.skillId === args.skillId
    }
    return Object.freeze({ binding: Object.freeze({ approvalId: a.id, toolCallId: p.toolCallId,
      toolName: "arcade_call_skill", skillId: args.skillId, maxAmountUsd: args.maxAmountUsd, input: captured }),
      state: p.state, approved: a.approved === true, ready })
  } catch { return undefined }
}

export const createPurchaseConversation = (initial: unknown, onUpdate: (id: string, view: Readonly<PurchaseView>) => void,
  run: typeof runPurchase = runPurchase) => {
  const scope = createPurchaseApprovalScope(), retired = new Set<string>(), seen = new Set<string>()
  const pending = new Map<string, { token: PurchaseApprovalToken; binding: Readonly<PurchaseBinding>; wallet: unknown }>()
  const active = new Set<AbortController>()
  let closed = false, tail: Promise<void> = Promise.resolve()
  const close = () => {
    closed = true; scope.close(); pending.clear()
    for (const controller of active) controller.abort()
    active.clear()
  }
  try {
    if (!Array.isArray(initial) || initial.length > 256) throw 0
    let count = 0
    for (const message of initial) {
      const m = record(message)
      if (!Array.isArray(m.parts) || m.parts.length > 512 || (count += m.parts.length) > 4096) throw 0
      for (const p of m.parts) { const key = callId(p); if (key) retired.add(key) }
    }
  } catch { close() }
  const emit = (key: string, view: Readonly<PurchaseView>) => {
    if (closed) return
    try { onUpdate(key, Object.freeze(view)) } catch { /* Display observers cannot retry work. */ }
  }
  const candidate = (input: unknown) => {
    const p = capturePurchasePart(input)
    return !closed && seen.size < 128 && p?.state === "approval-requested" &&
      !retired.has(p.binding.toolCallId) && !seen.has(p.binding.toolCallId) ? p : undefined
  }
  const discard = (key: string) => {
    const entry = pending.get(key)
    if (!entry) return
    pending.delete(key); scope.consume(entry.token, entry.binding)
    emit(key, { phase: "refused", message: "This purchase was not started. Request a fresh confirmation." })
  }
  return Object.freeze({
    canConfirm: (input: unknown) => candidate(input) !== undefined,
    approve(input: unknown, context: unknown, wallet: unknown): boolean {
      const p = candidate(input)
      if (!p) return false
      try {
        const w = record(wallet), provider = w.provider as Eip1193Provider, request = provider?.request
        if (typeof request !== "function" || typeof w.buyer !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(w.buyer) || /^0x0{40}$/i.test(w.buyer)) return false
        const capturedWallet = Object.freeze({ buyer: w.buyer, provider: Object.freeze({
          request: (args: Parameters<Eip1193Provider["request"]>[0]) => request.call(provider, args)
        }) })
        const token = scope.approve({ ...p.binding, context })
        if (!token) return false
        seen.add(p.binding.toolCallId); pending.set(p.binding.toolCallId, { token, binding: p.binding, wallet: capturedWallet })
        return true
      } catch { return false }
    },
    deny(input: unknown): boolean {
      const p = candidate(input)
      if (!p) return false
      seen.add(p.binding.toolCallId); return true
    },
    discard,
    cancelPending: () => { for (const key of pending.keys()) discard(key) },
    receive(input: unknown): Promise<void> {
      const key = callId(input)
      if (closed || !key) return Promise.resolve()
      const entry = pending.get(key)
      if (!entry) return Promise.resolve()
      const p = capturePurchasePart(input)
      if (!p || JSON.stringify(p.binding) !== JSON.stringify(entry.binding)) { discard(key); return Promise.resolve() }
      if (p.state === "approval-requested" || p.state === "approval-responded" && p.approved) return Promise.resolve()
      if (!p.ready) { discard(key); return Promise.resolve() }
      pending.delete(key) // Before queueing/awaits/effect re-entry; duplicate output has no permit.
      const controller = new AbortController(); active.add(controller)
      const work = tail.then(async () => {
        if (closed || controller.signal.aborted) return
        try {
          const view = await run(scope, entry.token, p.binding, entry.wallet, { signal: controller.signal }, next => emit(key, next))
          emit(key, view)
        } catch {
          scope.consume(entry.token, entry.binding)
          emit(key, { phase: "unconfirmed", message: "Purchase outcome unconfirmed. Do not repeat the payment." })
        } finally { active.delete(controller) }
      })
      // All approved operations are serialized. Queued permits retain their original
      // five-minute expiry, and cleanup closes them; waiting never renews consent.
      tail = work.catch(() => {})
      return tail
    },
    close
  })
}

import { useCallback, useEffect, useRef, useState } from "react"
import { formatPrice, parsePrice } from "../../../../packages/core/src/money.ts"
import { Confirm } from "./confirm.tsx"
import { capturePurchasePart } from "../lib/purchase-conversation.ts"
import { capturePurchaseContext, type BrowserPurchaseContext } from "../lib/purchase-context.ts"
import { PurchaseQuoteFailure, quotePurchaseContext } from "../lib/purchase-quote.ts"
import { readPurchaseWallet, type SelectedPurchaseWallet } from "../lib/purchase-wallet.ts"
import type { Eip1193Provider } from "../lib/wallet.ts"
import type { PurchaseView } from "../lib/purchase-run.ts"

/** Raw SDK/history output is not evidence and cannot create payment authority. */
export const ArchivedPurchase = () => <div className="tool-out">
  <p className="tool-note">Purchase record · unverified transcript. This record cannot start a payment.
    Request a fresh purchase, or inspect saved jobs for recovery.</p>
</div>

/** Receives only the private runner's closed projection, never SDK tool output. */
export const LivePurchaseView = ({ view }: { view: Readonly<PurchaseView> }) => {
  const result = view.outcome?.resultJson, long = result !== null && result !== undefined && result.length > 1200
  const body = result === null || result === undefined ? null : <blockquote className="quoted">
    <span className="quoted-label">returned by the seller · complete JSON</span>
    <pre className="result">{result}</pre>
  </blockquote>
  return <div className="tool-out">
    <p className="tool-note" role="status">{view.message}</p>
    {view.jobId ? <p className="tool-note">job <span className="measured">{view.jobId}</span></p> : null}
    {view.outcome ? <div className="tool-row"><span className="tool-id">{view.outcome.skillId}</span>
      <span className={view.outcome.settled ? "usdc" : "unsettled"}>
        {view.outcome.settled ? formatPrice(BigInt(view.outcome.priceAtomic)) : "hub reports not settled"}
      </span></div> : null}
    {view.outcome?.explorer ? <p className="tool-note"><a href={view.outcome.explorer} target="_blank" rel="noreferrer">
      inspect the reported transaction ↗</a></p> : null}
    {view.outcome?.referenceKind === "gateway-transfer" ? <p className="tool-note">Gateway transfer
      <span className="measured"> {view.outcome.reference}</span> · not a mined transaction</p> : null}
    {view.recovery === "stored" || view.recovery === "already_stored" ? <p className="tool-note">Recovery saved in this browser.</p>
      : view.recovery === "recovered" ? <p className="tool-note">Recovery saved. Earlier malformed recovery data was replaced.</p>
      : view.recovery ? <p className="tool-note" role="alert">Recovery was not saved. Keep this tab open; closing it may lose access to this job.
        Do not repeat the payment.</p> : null}
    {long ? <details className="disclose"><summary>show the full result</summary>{body}</details> : body}
  </div>
}

export type PurchaseDecision = (part: unknown, approved: boolean, context?: BrowserPurchaseContext,
  wallet?: Readonly<SelectedPurchaseWallet>) => boolean
const provider = () => (globalThis as { ethereum?: Eip1193Provider }).ethereum
const WALLET_BLOCK = "Connect a wallet on the quoted network before approving."
const TERMS_BLOCK = "Complete payment terms or verified ENS records are unavailable, unsupported, or above the approved ceiling. Request a fresh quote."

/** Mounted only by a live conversation owner, never a generic transcript renderer.
 * The caller keys this component by the complete original decision binding.
 */
export const PendingPurchase = ({ part, onDecision, quote = quotePurchaseContext }: {
  part: unknown; onDecision: PurchaseDecision; quote?: typeof quotePurchaseContext
}) => {
  const captured = capturePurchasePart(part), binding = captured?.binding, bindingKey = JSON.stringify(binding)
  const [terms, setTerms] = useState<BrowserPurchaseContext>()
  const [failed, setFailed] = useState<string>()
  const [wallet, setWallet] = useState<Readonly<SelectedPurchaseWallet>>()
  const [walletBlock, setWalletBlock] = useState(WALLET_BLOCK)
  const [connecting, setConnecting] = useState(false)
  const [decisionFailed, setDecisionFailed] = useState(false)
  const selected = useRef<{ controller: AbortController; provider: Eip1193Provider } | undefined>(undefined)
  const current = useRef({ part, onDecision, terms, wallet })
  current.current = { part, onDecision, terms, wallet }

  useEffect(() => {
    const c = new AbortController()
    setTerms(undefined); setFailed(undefined)
    if (!binding) { setFailed(TERMS_BLOCK); return () => c.abort() }
    const target = binding.name === undefined ? binding.skillId : { name: binding.name }
    quote(target, binding.input, { signal: c.signal }).then(value => {
      if (c.signal.aborted) return
      const context = capturePurchaseContext(value)
      if (!context || (binding.name === undefined ? context.skillId !== binding.skillId : context.ensName !== binding.name) || context.rail === "test" ||
        BigInt(context.amountAtomic) > parsePrice(binding.maxAmountUsd)) { setFailed(TERMS_BLOCK); return }
      setTerms(context)
    }, error => { if (!c.signal.aborted) setFailed(error instanceof PurchaseQuoteFailure ? error.message : TERMS_BLOCK) })
    return () => c.abort()
  }, [bindingKey, quote])

  const select = useCallback((connect = false) => {
    selected.current?.controller.abort(); selected.current = undefined
    setWallet(undefined); setWalletBlock(WALLET_BLOCK); setConnecting(connect)
    const p = provider()
    if (!p || !terms) {
      setConnecting(false)
      if (!p) setWalletBlock("No wallet detected. Install a browser wallet to approve a purchase.")
      return
    }
    const operation = { controller: new AbortController(), provider: p }
    selected.current = operation
    void readPurchaseWallet(p, terms.network, { signal: operation.controller.signal, connect }).then(value => {
      if (selected.current !== operation || operation.controller.signal.aborted) return
      if (provider() !== p) { setWalletBlock(WALLET_BLOCK); return }
      setWallet(value)
    }, () => { if (selected.current === operation && !operation.controller.signal.aborted) setWalletBlock(WALLET_BLOCK) })
      .finally(() => { if (selected.current === operation && !operation.controller.signal.aborted) setConnecting(false) })
  }, [terms])
  useEffect(() => {
    select()
    const p = provider() as (Eip1193Provider & { removeListener?: (event: string, handler: () => void) => void }) | undefined
    const changed = () => select()
    // Listen only when cleanup is supported. The signer always rechecks selection,
    // including providers without events; stale display never changes the buyer.
    let subscribed = false
    try {
      if (p?.on && p.removeListener) { subscribed = true; p.on("accountsChanged", changed); p.on("chainChanged", changed) }
    } catch { /* Optional wallet notifications do not enable an unknown selection. */ }
    return () => {
      selected.current?.controller.abort(); selected.current = undefined
      if (subscribed) { try { p?.removeListener?.("accountsChanged", changed); p?.removeListener?.("chainChanged", changed) } catch { /* best-effort provider cleanup */ } }
    }
  }, [select])

  const decisionKey = JSON.stringify([bindingKey, terms, wallet?.buyer])
  const approve = useCallback(() => {
    const v = current.current
    if (!v.terms || !v.wallet || selected.current?.provider !== provider() ||
      !v.onDecision(v.part, true, v.terms, v.wallet)) setDecisionFailed(true)
  }, [decisionKey])
  const deny = useCallback(() => { const v = current.current; if (!v.onDecision(v.part, false)) setDecisionFailed(true) }, [bindingKey])

  if (!binding || captured?.state !== "approval-requested") return <ArchivedPurchase />
  if (decisionFailed) return <p className="tool-note" role="alert">This decision could not be applied. Request a fresh purchase; do not repeat an existing payment.</p>
  if (!terms && !failed) return <div className="tool-out"><p className="tool-note">asking the endpoint what this costs…</p></div>
  if (!terms) return <div className="tool-out">
    <p className="tool-note">requested {binding.name ? "ENS name" : "skill"} <span className="measured">{binding.name ?? binding.skillId}</span></p>
    <p className="tool-note">Proposed ceiling {binding.maxAmountUsd}. No verified quote.</p>
    <p className="confirm-blocked purchase-refusal" role="alert">{failed}</p>
    <button type="button" className="deny" onClick={deny}>no</button>
    <details className="disclose"><summary>review exact purchase input</summary><pre className="result">{binding.input}</pre></details>
  </div>
  return <div>
    <Confirm decisionKey={decisionKey} skillId={terms.skillId} price={formatPrice(BigInt(terms.amountAtomic))}
      payTo={terms.payTo} network={terms.network} ensName={terms.ensName}
      blocked={failed ?? (wallet ? undefined : walletBlock)} connecting={connecting}
      {...(!failed && terms && !wallet && provider() ? { onConnect: () => select(true) } : {})}
      onApprove={approve} onDeny={deny} />
    {wallet ? <p className="tool-note">selected buyer <span className="measured">{wallet.buyer}</span></p> : null}
    <details className="disclose"><summary>review exact purchase input</summary><pre className="result">{binding.input}</pre></details>
  </div>
}

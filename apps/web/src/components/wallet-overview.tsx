import { useEffect, useRef, useState } from "react"
import { loadChainConfig } from "../../../../packages/core/src/chain-config.ts"
import { formatWalletUsdc, readWalletBalance, type WalletBalance } from "../lib/wallet-balance.ts"
import type { Eip1193Provider } from "../lib/wallet.ts"

type EventProvider = Eip1193Provider & { removeListener?: (event: string, callback: () => void) => void }
const provider = (): EventProvider | undefined => (globalThis as { ethereum?: EventProvider }).ethereum

/** No wallet IO at mount. A user action owns one bounded balance read and its cleanup. */
export function WalletOverview() {
  const [balance, setBalance] = useState<Readonly<WalletBalance>>()
  const [state, setState] = useState<"idle" | "reading" | "ready" | "unavailable" | "changed">("idle")
  const [message, setMessage] = useState("")
  const active = useRef<{ controller: AbortController; cleanup: () => void; provider: EventProvider } | undefined>(undefined)
  const config = (() => { try { return loadChainConfig() } catch { return undefined } })()
  const chain = config?.id === "arc-mainnet" ? "Arc Mainnet" : "Arc Testnet"
  useEffect(() => () => { active.current?.controller.abort(); active.current?.cleanup(); active.current = undefined }, [])
  const read = (connect: boolean) => {
    active.current?.controller.abort(); active.current?.cleanup(); active.current = undefined
    setBalance(undefined); setMessage("")
    const wallet = provider()
    if (!wallet) { setState("unavailable"); setMessage("No wallet is available. Enable a browser wallet, then try again."); return }
    if (!config || config.status !== "ready") { setState("unavailable"); setMessage("Balance reads are unavailable for this deployment's network."); return }
    const operation = { controller: new AbortController(), cleanup: () => {}, provider: wallet }
    active.current = operation; setState("reading")
    const invalidate = () => {
      if (active.current !== operation) return
      operation.controller.abort(); operation.cleanup(); active.current = undefined
      setBalance(undefined); setState("changed"); setMessage("Your wallet changed. Read the balance again for the selected account and network.")
    }
    void readWalletBalance(wallet, { connect, signal: operation.controller.signal }).then(value => {
      if (active.current !== operation || operation.controller.signal.aborted) return
      if (provider() !== wallet) { invalidate(); return }
      // Subscribe only when both notifications and cleanup are supported. Unsupported
      // providers still undergo account/network checks before and after the explicit read.
      if (wallet.on && wallet.removeListener) {
        operation.cleanup = () => {
          try { wallet.removeListener?.("accountsChanged", invalidate); wallet.removeListener?.("chainChanged", invalidate) } catch { /* Optional wallet cleanup. */ }
        }
        try { wallet.on("accountsChanged", invalidate); wallet.on("chainChanged", invalidate) }
        catch { operation.cleanup() }
      }
      if (active.current !== operation || operation.controller.signal.aborted) return
      if (provider() !== wallet) { invalidate(); return }
      setBalance(value); setState("ready")
    }, () => {
      if (active.current !== operation || operation.controller.signal.aborted) return
      operation.cleanup(); active.current = undefined
      setState("unavailable"); setMessage(`Could not read your USDC balance. Connect a wallet on ${chain}, then try again.`)
    })
  }
  const cancel = () => {
    active.current?.controller.abort(); active.current?.cleanup(); active.current = undefined
    setBalance(undefined); setState("idle"); setMessage("Balance read canceled. No payment was made.")
  }
  return <section className="wallet-overview content-panel" aria-label="Wallet balance">
    <div className="wallet-overview-heading"><div><p className="page-eyebrow">Your wallet</p><h2>USDC on {chain}</h2></div>
      <div className="wallet-actions">{state === "reading" ? <button type="button" onClick={cancel}>Cancel read</button>
        : <button type="button" className="button-secondary" disabled={!config || config.status !== "ready"}
          onClick={() => read(state !== "ready")}>{state === "ready" ? "Refresh balance" : "Connect and view balance"}</button>}</div></div>
    {balance ? <><p className="wallet-amount usdc">{formatWalletUsdc(balance.atomic)} <span>USDC</span></p>
      <p className="wallet-caption">Wallet-reported balance, checked at {new Date(balance.checkedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.</p>
      <details className="wallet-details"><summary>Account and balance details</summary><p>Account <span className="measured">{balance.buyer}</span></p>
        <p>Network <span className="measured">{balance.network}</span></p><p>USDC contract <span className="measured">{balance.token}</span></p>
        <p>This is the six-decimal ERC-20 wallet balance. It does not include a Gateway deposit or prove a job's settlement.</p></details></>
      : <p className="wallet-caption">{!config || config.status !== "ready" ? "USDC balance reads are unavailable for this deployment’s network."
        : state === "reading" ? "Reading the selected wallet’s USDC balance…" : "Connect to see your USDC balance. No signature or payment is requested."}</p>}
    <p className="wallet-status" role="status">{message}</p>
    
  </section>
}

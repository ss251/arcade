import { useEffect, useRef, useState } from "react"
import { Nav } from "./nav.tsx"
import { addressOk, type SellerSummary } from "../lib/hub-decode.ts"
import { ago } from "../lib/format.ts"
import { requestSellerAddress } from "../lib/seller-address.ts"
import type { SellerPageData } from "../lib/seller-page-data.ts"

type Select = (address: string) => void | Promise<void>
export function SellerAddressForm({ address, onSelect }: { address: string; onSelect: Select }) {
  const [typed, setTyped] = useState(addressOk(address) ? address : ""), [message, setMessage] = useState("")
  const [waiting, setWaiting] = useState(false)
  const generation = useRef(0), controller = useRef<AbortController | undefined>(undefined), mounted = useRef(false)
  const invalidate = () => { generation.current++; controller.current?.abort(); controller.current = undefined }
  useEffect(() => {
    mounted.current = true; invalidate(); setTyped(addressOk(address) ? address : ""); setWaiting(false); setMessage("")
    return () => { mounted.current = false; invalidate() }
  }, [address])
  const select = async (value: string, at: number) => {
    try { await onSelect(value) }
    catch { if (mounted.current && generation.current === at) setMessage("Address selection did not complete. Try the public address form again.") }
  }
  const submit = () => {
    invalidate(); setWaiting(false); setMessage("")
    const value = typed.trim()
    if (!addressOk(value)) { setMessage("Enter a nonzero 0x seller address with 40 hexadecimal digits."); return }
    void select(value, generation.current)
  }
  const wallet = async () => {
    invalidate(); const at = generation.current, pending = new AbortController(); controller.current = pending
    setWaiting(true); setMessage("")
    let selected: string | null = null
    try { selected = await requestSellerAddress((globalThis as { ethereum?: unknown }).ethereum, pending.signal) } catch { /* fixed message only */ }
    if (!mounted.current || generation.current !== at) return
    controller.current = undefined; setWaiting(false)
    if (selected === null) { setMessage("Wallet address unavailable. Enter a public seller address instead."); return }
    setTyped(selected); await select(selected, at)
  }
  return <form className="seller-address" onSubmit={event => { event.preventDefault(); submit() }}>
    <label htmlFor="seller-address-input">Public seller address</label>
    <div className="seller-form-controls">
      <input id="seller-address-input" value={typed} spellCheck={false} autoComplete="off" maxLength={128} placeholder="0x…"
        onChange={event => { invalidate(); setWaiting(false); setMessage(""); setTyped(event.target.value) }} />
      <button type="submit">Show seller</button>
      <button type="button" disabled={waiting} onClick={() => { void wallet() }}>{waiting ? "Waiting for wallet…" : "Use wallet address"}</button>
    </div>
    <p className="seller-note">Optional wallet address selection, not authentication. No signing, chain switch or payment. The public address is saved in the page URL.</p>
    <p role="status">{message}</p>
  </form>
}

export function SellerBoard({ summary, observedAtMs }: { summary: SellerSummary; observedAtMs: number | null }) {
  const metrics = [
    { label: "Revenue", value: summary.revenue }, { label: "Fees", value: summary.fees }, { label: "Net after fees", value: summary.net },
    { label: "Inference cost", value: summary.inferenceCost }, { label: "Direct sub-spend", value: summary.subSpend }, { label: "Margin", value: summary.margin }
  ]
  return <>
    <p className="seller-code">Summary for {summary.seller}</p>
    <p className="seller-note">Hub-recorded public summary, including test and canary records where present. Not independent chain verification, customer-demand measurement or a wallet balance.</p>
    <section aria-label="Seller totals" className="seller-totals">{metrics.map(metric => <div key={metric.label}>
      <span>{metric.label}</span>
      <strong className={metric.value?.startsWith("-") ? "seller-money is-refused" : metric.value === null ? "seller-unknown" : "seller-money"}>
        {metric.value ?? "Unavailable"}{metric.value?.startsWith("-") ? " · loss" : ""}
      </strong>
    </div>)}</section>
    <p>{summary.settled} recorded settlements across {summary.calls} recorded calls.</p>
    {!summary.inferenceCostComplete ? <p>Known inference subtotal <span className="seller-money">{summary.knownInferenceCost}</span> — partial; full inference cost unavailable.</p> : null}
    {!summary.subSpendComplete ? <p>Known direct sub-spend subtotal <span className="seller-money">{summary.knownSubSpend}</span> — partial; full sub-spend unavailable.</p> : null}
    <p className="seller-note">Margin is net after fees less inference and supported direct hires. Reported inference includes failed jobs. Missing costs or unsupported funding attribution keep the full margin unavailable; a known zero subtotal does not fill the gap.</p>
    {summary.settled === 0 ? <p>No recorded settlements for this address in the returned ledger.</p> : null}
    <section aria-label="Seller listings" className="seller-listings">
      <h2>Current listings</h2>
      {summary.listings.length === 0 ? <p>No current listings for this address. Historical totals above can remain after listings leave.</p>
        : <ul>{summary.listings.map(listing => <li key={listing.id}>
          <div className="seller-listing-heading"><h3><a href={`/skill/${listing.id}`}>{listing.serviceName}</a></h3><span className="seller-money">Listed price {listing.price}</span></div>
          <p className="seller-code">{listing.id}</p>
          <p>{listing.settled} recorded settlements / {listing.calls} calls · revenue <span className="seller-money">{listing.revenue}</span></p>
          <p>Margin per settled call: <span className={listing.marginPerCall?.startsWith("-") ? "seller-money is-refused" : "seller-money"}>{listing.marginPerCall ?? "Unavailable"}</span></p>
          <p className="seller-note">Total listing margin, including reported failed-job overhead, divided by settled calls; not a forecast or typical-call estimate.</p>
          <p>Runner: {listing.delisted ? "delisted" : listing.live ? "hub-reported serving" : "hub-reported offline"}</p>
          <p>Pay-test: {listing.payTestedAtMs === undefined ? "no recorded pay-test" : `hub-reported ${listing.payTestOk ? "passed" : "failed"} · ${ago(listing.payTestedAtMs, observedAtMs)}`}</p>
          {listing.ensName === undefined ? <p className="seller-note">No ENS name announced.</p>
            : <p className="seller-code">{listing.ensName} · {listing.ensExpired === undefined ? "expiry unknown" : listing.ensExpired ? "hub-reported expired" : "hub-reported unexpired"}</p>}
          <p className="seller-note">{listing.agentId === undefined ? "no identity claim" : `agent #${listing.agentId} · ${listing.agentVerified === true ? "hub-reported verified" : listing.agentVerified === false ? "unverified claim" : "verification unknown"}`}</p>
          {listing.payTestTx === undefined && listing.registrationTx === undefined ? null : <details>
            <summary>Public references — chain context unavailable</summary>
            <p className="seller-note">These listing references lack the rail/network context needed to derive verified transaction links here.</p>
            {listing.payTestTx === undefined ? null : <p>Pay-test reference <span className="seller-code">{listing.payTestTx}</span></p>}
            {listing.registrationTx === undefined ? null : <p>Registration reference <span className="seller-code">{listing.registrationTx}</span></p>}
          </details>}
        </li>)}</ul>}
    </section>
  </>
}

export function SellerPage({ address, data, onSelect }: { address: string; data: SellerPageData; onSelect: Select }) {
  return <main className="wrap seller-page">
    <Nav here="seller" />
    <h1>What the ledger says a seller earns.</h1>
    <SellerAddressForm address={address} onSelect={onSelect} />
    {data.state === "ready" && data.summary !== null ? data.address?.toLowerCase() === address.toLowerCase()
      && data.summary.seller.toLowerCase() === address.toLowerCase()
      ? <SellerBoard summary={data.summary} observedAtMs={data.observedAtMs} />
      : <p role="status">Waiting for the selected seller summary. Previous totals are hidden.</p>
      : <p role="status">{data.state === "missing" ? "Enter a public seller address. No wallet is required to read this summary."
        : data.state === "invalid" ? "Invalid seller address. Use a nonzero 0x address with 40 hexadecimal digits."
        : "Seller summary unavailable. This is not a zero-income or empty-ledger result."}</p>}
  </main>
}

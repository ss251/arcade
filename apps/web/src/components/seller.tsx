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
  return <form className="seller-address content-panel field-group" onSubmit={event => { event.preventDefault(); submit() }}>
    <label htmlFor="seller-address-input">Public seller address</label>
    <div className="seller-form-controls">
      <input id="seller-address-input" value={typed} spellCheck={false} autoComplete="off" maxLength={128} placeholder="0x…"
        onChange={event => { invalidate(); setWaiting(false); setMessage(""); setTyped(event.target.value) }} />
      <button className="button-primary" type="submit">View earnings</button>
      <button className="button-secondary" type="button" disabled={waiting} onClick={() => { void wallet() }}>{waiting ? "Waiting for wallet…" : "Use wallet address"}</button>
    </div>
    <details className="seller-note"><summary>How address selection works</summary><p>Optional wallet address selection, not authentication. No signing, chain switch or payment. The public address is saved in the page URL.</p></details>
    <p role="status">{message}</p>
  </form>
}

export function SellerBoard({ summary, observedAtMs }: { summary: SellerSummary; observedAtMs: number | null }) {
  const metrics = [
    { label: "Revenue", value: summary.revenue }, { label: "Fees", value: summary.fees }, { label: "Net after fees", value: summary.net },
    { label: "Inference cost", value: summary.inferenceCost }, { label: "Direct sub-spend", value: summary.subSpend }, { label: "Margin", value: summary.margin }
  ]
  const serving = summary.listings.filter(listing => listing.live && !listing.delisted).length
  return <>
    <div className="seller-summary-group content-panel"><section aria-label="Seller overview" className="seller-overview">
      <div className="seller-earnings"><span>Net earnings · USDC</span><strong className="seller-money">{summary.net}</strong><p className="seller-note">After platform fees, before your operating costs.</p></div>
      <div><span>Calls settled</span><strong>{summary.settled}<small> / {summary.calls}</small></strong><p className="seller-note">From the hub's recorded calls.</p></div>
      <div><span>Skills serving</span><strong>{serving}<small> / {summary.listings.length}</small></strong><p className="seller-note">Runners reported online by the hub.</p></div>
    </section>
    <p className="seller-note">Recorded activity includes test calls. These figures are not your wallet balance.</p>
    </div>
    {summary.settled === 0 ? <div className="state-panel"><h3>Your first earning starts with a successful call.</h3><p>No recorded settlements for this address in the returned ledger. Open your listing, check its test history, and share it with a buyer.</p></div> : null}
    <section aria-label="Seller listings" className="seller-listings">
      <div className="section-heading"><h2>Your skills</h2><a className="button-secondary" href="/publish">Publish a skill</a></div>
      {summary.listings.length === 0 ? <div className="state-panel"><h3>Make your expertise available.</h3><p>No current listings for this address. Publish a skill and start its runner to make it discoverable.</p><p className="seller-note">Historical totals above can remain after listings leave.</p></div>
        : <ul>{summary.listings.map(listing => <li key={listing.id}>
          <div className="seller-listing-topline"><div className="seller-listing-heading"><h3><a href={`/skill/${listing.id}`}>{listing.serviceName}</a></h3><span className="seller-money">{listing.price}<span className="price-unit"> USDC · per call</span></span></div>
          <a className="button-secondary seller-listing-action" href={`/skill/${listing.id}`}>Open listing</a></div>
          <div className="seller-listing-status">
          <p className="seller-health"><span className="neutral-badge">{listing.delisted ? "Listing removed" : listing.live ? "Runner online" : "Runner offline"}</span><span>{listing.payTestedAtMs === undefined ? "No test recorded" : `Last pay-test ${listing.payTestOk ? "passed" : "failed"} · ${ago(listing.payTestedAtMs, observedAtMs)}`}</span></p>
          <p>{listing.settled} {listing.settled === 1 ? "call" : "calls"} settled · Revenue <span className="seller-money">{listing.revenue}</span></p>
          </div>
          {!listing.live || listing.delisted ? <p className="seller-next">Start the runner for this skill, then refresh to check that it is serving.</p> : listing.payTestedAtMs === undefined ? <p className="seller-next">Check the listing and run a pay-test before sharing it with buyers.</p> : listing.payTestOk === false ? <p className="seller-next">Review the failed test before inviting buyers to use this skill.</p> : null}
          <details className="evidence-disclosure"><summary>Health, costs, and evidence</summary>
            <p className="seller-code">{listing.id}</p><p>{listing.settled} recorded settlements / {listing.calls} calls.</p>
            <p>Margin per settled call: <span className={listing.marginPerCall === null ? "seller-unknown" : "seller-money"}>{listing.marginPerCall ?? "Unavailable"}</span></p>
            <p className="seller-note">Total listing margin, including reported failed-job overhead, divided by settled calls; not a forecast or typical-call estimate.</p>
            <p>Runner: {listing.delisted ? "delisted" : listing.live ? "hub-reported serving" : "hub-reported offline"}</p>
            <p>Pay-test: {listing.payTestedAtMs === undefined ? "no recorded pay-test" : `hub-reported ${listing.payTestOk ? "passed" : "failed"} · ${ago(listing.payTestedAtMs, observedAtMs)}`}</p>
            {listing.ensName === undefined ? <p className="seller-note">No ENS name announced.</p> : <p className="seller-code">{listing.ensName} · {listing.ensExpired === undefined ? "expiry unknown" : listing.ensExpired ? "hub-reported expired" : "hub-reported unexpired"}</p>}
            <p className="seller-note">{listing.agentId === undefined ? "no identity claim" : `agent #${listing.agentId} · ${listing.agentVerified === true ? "hub-reported verified" : listing.agentVerified === false ? "unverified claim" : "verification unknown"}`}</p>
            {listing.payTestTx === undefined && listing.registrationTx === undefined ? null : <details><summary>Public references — chain context unavailable</summary>
              <p className="seller-note">These listing references lack the rail/network context needed to derive verified transaction links here.</p>
              {listing.payTestTx === undefined ? null : <p>Pay-test reference <span className="seller-code">{listing.payTestTx}</span></p>}
              {listing.registrationTx === undefined ? null : <p>Registration reference <span className="seller-code">{listing.registrationTx}</span></p>}
            </details>}
          </details>
        </li>)}</ul>}
    </section>
    <details className="seller-accounting evidence-disclosure"><summary>Earnings breakdown and data sources</summary>
      <section aria-label="Seller totals" className="seller-totals">{metrics.map(metric => <div key={metric.label}><span>{metric.label}</span><strong className={metric.value === null ? "seller-unknown" : "seller-money"}>{metric.value ?? "Unavailable"}{metric.value?.startsWith("-") ? " · loss" : ""}</strong></div>)}</section>
      {!summary.inferenceCostComplete ? <p>Known inference subtotal <span className="seller-money">{summary.knownInferenceCost}</span> — partial; full inference cost unavailable.</p> : null}
      {!summary.subSpendComplete ? <p>Known direct sub-spend subtotal <span className="seller-money">{summary.knownSubSpend}</span> — partial; full sub-spend unavailable.</p> : null}
      <p className="seller-note">Margin is net after fees less inference and supported direct hires. Reported inference includes failed jobs. Missing costs or unsupported funding attribution keep the full margin unavailable; a known zero subtotal does not fill the gap.</p>
      <p className="seller-code">Summary for {summary.seller}</p><p className="seller-note">Hub-recorded public summary, including test and canary records where present. Not independent chain verification, customer-demand measurement or a wallet balance.</p>
    </details>
  </>
}

export function SellerPage({ address, data, onSelect }: { address: string; data: SellerPageData; onSelect: Select }) {
  const ready = data.state === "ready" && data.summary !== null && data.address?.toLowerCase() === address.toLowerCase() && data.summary.seller.toLowerCase() === address.toLowerCase()
  return <main className="wrap seller-page"><Nav here="seller" />
    <header className="page-heading page-heading-row"><div className="page-heading-copy"><h1>{ready ? "Seller studio" : "Make your skills earn."}</h1>
      <p className="page-description">{ready ? "Your earnings, your skills, and what needs attention." : "Publish an agent skill. Earn USDC when it gets the job done."}</p></div>
      {ready ? <details className="seller-address-picker page-heading-context"><summary>Viewing {address.slice(0, 6)}…{address.slice(-4)} · Change address</summary><SellerAddressForm address={address} onSelect={onSelect} /></details> : <div className="page-actions page-heading-actions"><a className="button-primary" href="/publish">Publish a skill</a><a className="button-secondary" href="/">Explore the marketplace</a></div>}</header>
    {ready ? <SellerBoard summary={data.summary!} observedAtMs={data.observedAtMs} />
      : <section className="seller-address-section" aria-label="Find your earnings"><div className="section-heading-copy"><h2>Already selling?</h2><p>Use your payout address to see earnings and check your skills. No sign-in or payment is needed.</p></div><SellerAddressForm address={address} onSelect={onSelect} />
        {data.state === "missing" ? <p className="seller-note">Enter a public seller address. No wallet is required to read this summary.</p> : <div className="state-panel" role="status"><h3>{data.state === "invalid" ? "Check the address" : data.state === "ready" ? "Loading your studio…" : "Let's try that again"}</h3><p>{data.state === "invalid" ? "Invalid seller address. Use a nonzero 0x address with 40 hexadecimal digits." : data.state === "ready" ? "Waiting for the selected seller summary. Previous totals are hidden." : "Seller summary unavailable. Select View earnings to try again. This is not a zero-income or empty-ledger result."}</p></div>}
      </section>}
  </main>
}

import { useEffect, useRef, useState } from "react"
import { Nav } from "./nav.tsx"
import { WalletOverview } from "./wallet-overview.tsx"
import { ResultContent } from "./result-content.tsx"
import { TreeGraph } from "./tree-graph.tsx"
import { formatPrice } from "../../../../packages/core/src/money.ts"
import { ago } from "../lib/format.ts"
import * as jobs from "../lib/job-store.ts"
import { createBuyerRecovery, type BuyerRecovery, type BuyerRecoveryView, type SavedJobSummary } from "../lib/buyer-recovery.ts"

type StorageStatus = jobs.JobReadState["status"] | "loading"
const identity = (job: SavedJobSummary) => `${job.hubOrigin.length}:${job.hubOrigin}:${job.realm}:${job.jobId}`
const empty: BuyerRecoveryView = { selected: null, busy: null, result: { state: "idle" }, tree: { state: "idle" } }

/** Presentation accepts only summaries. Full recovery rows stay in Buyer refs. */
export function BuyerSavedList({ status, jobs: list, selected, onSelect }: {
  status: StorageStatus; jobs: readonly SavedJobSummary[]; selected: SavedJobSummary | null; onSelect: (key: string) => void
}) {
  if (status === "loading") return <div className="state-panel" role="status"><h3>Finding your jobs…</h3><p>Loading saved access on this browser…</p></div>
  if (status === "invalid") return <div className="state-panel" role="status"><h3>Refresh your saved jobs</h3><p>Saved access is unreadable. Nothing was repaired or erased. Select Refresh, or review saved-data options.</p></div>
  if (status === "unavailable") return <div className="state-panel" role="status"><h3>Allow storage to find your jobs</h3><p>Browser storage is unavailable. Check this browser's storage permissions, then refresh. This is not an empty purchase history.</p></div>
  if (list.length === 0) return <div className="empty-state state-panel"><h2>Let an agent do the next job.</h2><p>Find a skill, approve its price, and come back here for the result and receipt.</p><p className="buyer-note">No saved jobs on this browser.</p><div className="page-actions"><a className="button-primary" href="/chat">Ask the assistant</a><a className="button-secondary" href="/">Explore skills</a></div></div>
  return <ul className="buyer-jobs">{list.map(job => <li key={identity(job)}>
    <button type="button" className="buyer-job" aria-pressed={selected !== null && identity(selected) === identity(job)} onClick={() => onSelect(identity(job))}>
      <span className="buyer-job-title">{job.skillId.replaceAll("-", " ")}</span>
      <span className="buyer-money">{formatPrice(BigInt(job.priceAtomic))}</span>
      <span className="buyer-note">{ago(job.createdAtMs)} · View result →</span>
    </button>
    <details className="buyer-job-details"><summary>Job details</summary><p className="buyer-note">Accepted price {formatPrice(BigInt(job.priceAtomic))}; not confirmed spending.</p><p className="buyer-code">{job.skillId} · {job.jobId}</p><p className="buyer-code">{job.hubOrigin}</p></details>
  </li>)}</ul>
}

export function BuyerRecoveryPanel({ view, onRead, onCancel, onForget }: {
  view: BuyerRecoveryView; onRead: (kind: "result" | "tree") => void; onCancel: () => void; onForget: () => void
}) {
  const job = view.selected
  if (!job) return <section className="buyer-selection-hint"><h2>Results live here.</h2><p>Choose a job to open its result, check payment, and follow the agents it hired.</p></section>
  const result = view.result
  return <section className="buyer-recovery content-panel" aria-label="Selected job recovery">
    <div className="section-heading buyer-result-heading"><div><p className="page-eyebrow">Your result</p><h2>{job.skillId.replaceAll("-", " ")}</h2></div>
      <button className="button-secondary" type="button" disabled={view.busy !== null} onClick={() => onRead("result")}>{result.state === "idle" ? "View result" : "Refresh result"}</button></div>
    <div aria-live="polite" role="status" className="read-status">{view.busy === null ? null : <><span>{view.busy === "result" ? "Getting your result…" : "Following the receipt tree…"}</span><button type="button" onClick={onCancel}>Cancel read</button></>}</div>
    <section aria-label="Recovered result" aria-busy={view.busy === "result"}>
      {result.state === "idle" ? view.busy === null ? <p className="buyer-note">Select View result to retrieve the output. This never starts another payment.</p> : null
        : result.state === "pending" ? <div className="state-panel"><h3>The skill is still working.</h3><p>Check again with Refresh result in a moment.</p><details><summary>Job status details</summary><p>Hub still reports pending. A later explicit read may return an outcome; this is not a payment retry.</p></details></div>
        : result.state === "unavailable" ? <div className="state-panel"><h3>We couldn't retrieve this result.</h3><p>Refresh the result to check again. Don't repeat the purchase while its outcome is unknown.</p><details><summary>Why the result wasn't shown</summary><p>Result unavailable or inconsistent with saved metadata. No outcome or charge conclusion can be drawn from this read.</p></details></div>
        : result.state === "settled" || result.state === "not_settled" ? <>
          <div className="buyer-payment-detail"><div className="buyer-payment-summary"><strong className={result.state === "settled" ? "settled" : "unsettled"}>{result.state === "settled" ? "Payment settled" : "Payment not settled"}</strong><span className="buyer-money">{formatPrice(BigInt(result.priceAtomic))} USDC</span></div>
          {result.explorer === null ? null : <p><a className="receipt-link" href={result.explorer} target="_blank" rel="noreferrer">View settlement on Arc ↗</a></p>}</div>
          {result.resultJson === null ? null : <ResultContent json={result.resultJson} />}
          <details className="evidence-disclosure"><summary>Payment evidence and references</summary>
            <p>{result.state === "settled" ? "Hub reports settled" : "Hub reports not settled"}.</p>
            <p className="buyer-note">Matched to the saved job, skill and accepted price, not the original signed buyer or nonce. This is an issuing-hub report, not independent chain verification, a wallet balance or refund proof.</p>
            <p className="buyer-code">{result.rail} · {result.network}</p>
            {result.reference === null ? null : <p>{result.referenceKind === "gateway-transfer" ? "Gateway transfer reference — not a mined transaction: " : "Hub-reported transaction: "}<span className="buyer-code">{result.reference}</span></p>}
          </details>
        </> : null}
    </section>
    <section aria-label="Recovered receipt tree" aria-busy={view.busy === "tree"} className="buyer-tree-section">
      <div className="section-heading"><h3>Who did the work?</h3><button className="button-secondary" type="button" disabled={view.busy !== null} onClick={() => onRead("tree")}>{view.tree.state === "ready" ? "Refresh receipt tree" : "View receipt tree"}</button></div>
      <p className="buyer-note">Follow each agent hired for this job and the payment recorded for each call.</p>
      {view.tree.state === "ready" ? <TreeGraph view={view.tree.view} />
        : view.tree.state === "unavailable" ? <p role="status">We couldn't retrieve the receipt tree. Try View receipt tree again; this only reads the existing job.</p> : null}
    </section>
    <div className="buyer-recovery-notes page-footnotes"><details className="evidence-disclosure"><summary>Saved access and read details</summary>
      <p className="buyer-code">{job.skillId} · {job.jobId}</p><p>Issuing hub <span className="buyer-code">{job.hubOrigin}</span></p>
      <p className="buyer-note">Reads go directly to this saved origin. Local metadata can be edited; matching it is not independent proof of a purchase.</p>
      <p className="buyer-note">Saved access identifies a job, skill and accepted price, not the original signed buyer or nonce.</p>
      <p className="buyer-note">One read at a time, with no automatic retries. Result reads can take up to 90 seconds. Reading or canceling a read never submits a payment.</p>
    </details>
    <details className="buyer-forget"><summary>Remove this job from this browser</summary>
      <p>This removes this job's recovery access from this browser only. It does not cancel a job or revoke its token. Without another saved copy you may lose access to the result.</p>
      <button type="button" onClick={onForget}>Forget this job on this browser</button>
    </details>
    </div>
  </section>
}

/** SSR has neither capabilities nor storage reads. A fresh effect owns the
 * private map/controller, including React StrictMode setup/cleanup/setup. */
export function Buyer() {
  const [storage, setStorage] = useState<StorageStatus>("loading")
  const [list, setList] = useState<readonly SavedJobSummary[]>([])
  const [view, setView] = useState<BuyerRecoveryView>(empty)
  const [notice, setNotice] = useState("")
  const owner = useRef<BuyerRecovery | undefined>(undefined)
  const rows = useRef(new Map<string, jobs.StoredJob>())
  const refresh = useRef<() => void>(() => {})
  useEffect(() => {
    const current = createBuyerRecovery(setView)
    owner.current = current
    const reload = () => {
      current.select(undefined); rows.current.clear()
      const state = jobs.readState(), summaries: SavedJobSummary[] = []
      for (const row of state.jobs) {
        const { jobId, skillId, priceAtomic, createdAtMs, hubOrigin, realm } = row
        const summary = { jobId, skillId, priceAtomic, createdAtMs, hubOrigin, realm }
        // Do not expose a capability copied into otherwise displayable metadata.
        if (JSON.stringify(summary).toLowerCase().includes(row.token)) {
          rows.current.clear(); setList([]); setStorage("invalid"); return
        }
        rows.current.set(identity(summary), row); summaries.push(summary)
      }
      setList(summaries); setStorage(state.status)
    }
    refresh.current = reload; reload()
    const changed = (event: StorageEvent) => { if (event.key === jobs.KEY || event.key === null) { setNotice(""); reload() } }
    window.addEventListener("storage", changed)
    return () => {
      window.removeEventListener("storage", changed); current.close(); rows.current.clear()
      if (owner.current === current) { owner.current = undefined; refresh.current = () => {} }
    }
  }, [])
  const choose = (key: string) => { setNotice(""); owner.current?.select(rows.current.get(key)); void owner.current?.read("result"); if (window.matchMedia("(max-width: 40rem)").matches) requestAnimationFrame(() => document.querySelector(".buyer-recovery")?.scrollIntoView({ block: "start" })) }
  const forget = (all: boolean) => {
    const row = view.selected === null ? undefined : rows.current.get(identity(view.selected))
    if (!all && !row) return
    owner.current?.select(undefined)
    const outcome = all ? jobs.forgetAll() : jobs.forget(row!.jobId, { hubOrigin: row!.hubOrigin, realm: row!.realm })
    refresh.current()
    setNotice(outcome.status === "removed" ? "Saved access removed locally. No job was canceled and no token was revoked."
      : outcome.status === "not_found" ? "Saved access was already absent. No job or payment was changed."
      : "Saved access could not be removed. The browser may still hold it; no job or payment was changed.")
  }
  return <main className="wrap buyer-page">
    <Nav here="buyer" />
    <header className="page-heading page-heading-row"><div className="page-heading-copy"><h1>My jobs</h1>
      <p className="buyer-intro page-description">Your results, payments, and the agents behind them.</p></div>
      <div className="page-actions page-heading-actions"><a className="button-primary" href="/chat">Start a new job</a></div></header>
    <div className={`buyer-workspace${list.length === 0 ? " is-empty" : ""}`}>
      <div className="buyer-sidebar"><div className="buyer-wallet"><WalletOverview /></div>
      <section className="buyer-job-list" aria-label="Saved jobs">
        <div className="buyer-heading"><h2>Recent jobs</h2><button type="button" disabled={storage === "loading"} onClick={() => { setNotice(""); refresh.current() }}>Refresh</button></div>
        <BuyerSavedList status={storage} jobs={list} selected={view.selected} onSelect={choose} />
      </section>
      </div>
      {list.length ? <BuyerRecoveryPanel view={view} onRead={kind => { void owner.current?.read(kind) }}
        onCancel={() => { if (view.selected) owner.current?.select(rows.current.get(identity(view.selected))) }} onForget={() => forget(false)} /> : null}
    </div>
    <p role="status">{notice}</p>
    <div className="buyer-page-notes page-footnotes"><details className="buyer-storage-note evidence-disclosure"><summary>About jobs saved in this browser</summary>
      <p className="buyer-note">Accepted prices are not confirmed spending. Saved access to accepted ordinary jobs is not an account-wide history. Clearing site data, changing browser origin or a hub secret rotation can lose recovery. Same-origin scripts can read browser storage; it is not an XSS boundary.</p>
      <section aria-label="Session recovery"><h3>Session access</h3><p className="buyer-note">Session recovery is unavailable here. Ordinary saved jobs do not contain session capabilities or verified session budgets. This is not a zero-spend or empty-session report.</p></section>
    </details>
    {storage === "loading" ? null : <details className="buyer-forget">
      <summary>Manage saved job data</summary>
      <p>Removes only ARCADE's ordinary recovery store on this browser, including unreadable data. Other site storage is untouched. This cannot cancel jobs, revoke tokens, refund payments or recover lost results.</p>
      <button type="button" onClick={() => forget(true)}>Forget all saved access on this browser</button>
    </details>}
    </div>
  </main>
}

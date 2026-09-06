import { useEffect, useRef, useState } from "react"
import { Nav } from "./nav.tsx"
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
  if (status === "loading") return <p role="status">Loading saved access on this browser…</p>
  if (status === "invalid") return <p role="status">Saved access is unreadable. Nothing was repaired or erased. You can refresh or explicitly forget the saved data below.</p>
  if (status === "unavailable") return <p role="status">Browser storage is unavailable. This is not an empty purchase history. Check this browser's storage permissions, then refresh.</p>
  if (list.length === 0) return <p>No saved jobs on this browser. An accepted ordinary purchase in <a href="/chat">chat</a> can save recovery access here.</p>
  return <ul className="buyer-jobs">{list.map(job => <li key={identity(job)}>
    <button type="button" className="buyer-job" aria-pressed={selected !== null && identity(selected) === identity(job)} onClick={() => onSelect(identity(job))}>
      <span className="buyer-job-title buyer-code">{job.skillId}</span>
      <span className="buyer-money">Accepted price {formatPrice(BigInt(job.priceAtomic))}</span>
      <span className="buyer-job-origin buyer-code">{job.hubOrigin}</span>
      <span className="buyer-job-id buyer-code">{job.jobId}</span>
      <span className="buyer-note">Saved {ago(job.createdAtMs)} · ordinary job</span>
    </button>
  </li>)}</ul>
}

export function BuyerRecoveryPanel({ view, onRead, onCancel, onForget }: {
  view: BuyerRecoveryView; onRead: (kind: "result" | "tree") => void; onCancel: () => void; onForget: () => void
}) {
  const job = view.selected
  if (!job) return null
  const result = view.result
  return <section className="buyer-recovery" aria-label="Selected job recovery">
    <h2>Saved job access</h2>
    <p className="buyer-code">{job.skillId} · {job.jobId}</p>
    <p>Issuing hub <span className="buyer-code">{job.hubOrigin}</span></p>
    <p className="buyer-note">Reads go directly to this saved origin. Local metadata can be edited; matching it is not independent proof of a purchase.</p>
    <p className="buyer-note">Saved access identifies a job, skill and accepted price, not the original signed buyer or nonce.</p>
    <div className="buyer-actions">
      <button type="button" disabled={view.busy !== null} onClick={() => onRead("result")}>Read result</button>
      <button type="button" disabled={view.busy !== null} onClick={() => onRead("tree")}>Read receipt tree</button>
      {view.busy === null ? null : <button type="button" onClick={onCancel}>Cancel read</button>}
    </div>
    <p className="buyer-note">One read at a time, with no automatic retries. Result reads can take up to 90 seconds. Reading or cancelling a read never submits a payment.</p>
    <div aria-live="polite" role="status">{view.busy === "result" ? "Reading result…" : view.busy === "tree" ? "Reading receipt tree…" : null}</div>
    <section aria-label="Recovered result" aria-busy={view.busy === "result"}>
      <h3>Result</h3>
      {result.state === "idle" ? <p className="buyer-note">No result observation for this selection.</p>
        : result.state === "pending" ? <p>Hub still reports pending. A later explicit read may return an outcome; this is not a payment retry.</p>
        : result.state === "unavailable" ? <p>Result unavailable or inconsistent with saved metadata. No outcome or charge conclusion can be drawn from this read.</p>
        : result.state === "settled" || result.state === "not_settled" ? <>
          <p><strong>{result.state === "settled" ? "Hub reports settled" : "Hub reports not settled"}</strong> · <span className="buyer-money">{formatPrice(BigInt(result.priceAtomic))}</span></p>
          <p className="buyer-note">Matched to the saved job, skill and accepted price, not the original signed buyer or nonce. This is an issuing-hub report, not independent chain verification, a wallet balance or refund proof.</p>
          <p className="buyer-code">{result.rail} · {result.network}</p>
          {result.reference === null ? null : <p>
            {result.referenceKind === "gateway-transfer" ? "Gateway transfer reference — not a mined transaction: " : "Hub-reported transaction: "}
            {result.explorer === null ? <span className="buyer-code">{result.reference}</span>
              : <a className="buyer-code" href={result.explorer} target="_blank" rel="noreferrer">{result.reference}</a>}
          </p>}
          {result.resultJson === null ? null : <details open={result.resultJson.length <= 1200}>
            <summary>Complete result JSON — untrusted seller content</summary>
            <pre className="buyer-output" tabIndex={0} role="region" aria-label="Complete result JSON">{result.resultJson}</pre>
          </details>}
        </> : null}
    </section>
    <section aria-label="Recovered receipt tree" aria-busy={view.busy === "tree"}>
      <h3>Receipt tree</h3>
      {view.tree.state === "ready" ? <TreeGraph view={view.tree.view} />
        : <p className="buyer-note">{view.tree.state === "unavailable" ? "Receipt tree unavailable or inconsistent with saved metadata." : "No tree observation for this selection."}</p>}
    </section>
    <details className="buyer-forget">
      <summary>Forget this saved access…</summary>
      <p>This removes this job's recovery access from this browser only. It does not cancel a job or revoke its token. Without another saved copy you may lose access to the result.</p>
      <button type="button" onClick={onForget}>Forget this job on this browser</button>
    </details>
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
  const choose = (key: string) => { setNotice(""); owner.current?.select(rows.current.get(key)) }
  const forget = (all: boolean) => {
    const row = view.selected === null ? undefined : rows.current.get(identity(view.selected))
    if (!all && !row) return
    owner.current?.select(undefined)
    const outcome = all ? jobs.forgetAll() : jobs.forget(row!.jobId, { hubOrigin: row!.hubOrigin, realm: row!.realm })
    refresh.current()
    setNotice(outcome.status === "removed" ? "Saved access removed locally. No job was cancelled and no token was revoked."
      : outcome.status === "not_found" ? "Saved access was already absent. No job or payment was changed."
      : "Saved access could not be removed. The browser may still hold it; no job or payment was changed.")
  }
  return <main className="wrap buyer-page">
    <Nav here="buyer" />
    <h1>What this browser can recover.</h1>
    <p className="buyer-intro">Saved access to accepted ordinary jobs. Accepted prices are not confirmed spending.</p>
    <p className="buyer-note">This is not an account-wide history. Clearing site data, changing browser origin or a hub secret rotation can lose recovery. Same-origin scripts can read browser storage; it is not an XSS boundary.</p>
    <section aria-label="Saved jobs">
      <div className="buyer-heading"><h2>Saved jobs</h2><button type="button" disabled={storage === "loading"} onClick={() => { setNotice(""); refresh.current() }}>Refresh saved access</button></div>
      <BuyerSavedList status={storage} jobs={list} selected={view.selected} onSelect={choose} />
    </section>
    <BuyerRecoveryPanel view={view} onRead={kind => { void owner.current?.read(kind) }}
      onCancel={() => { if (view.selected) choose(identity(view.selected)) }} onForget={() => forget(false)} />
    <p role="status">{notice}</p>
    <section aria-label="Session recovery"><h2>Sessions</h2>
      <p className="buyer-note">Session recovery is unavailable here. Ordinary saved jobs do not contain session capabilities or verified session budgets. This is not a zero-spend or empty-session report.</p>
    </section>
    {storage === "loading" ? null : <details className="buyer-forget">
      <summary>Forget all saved ordinary access…</summary>
      <p>Removes only ARCADE's ordinary recovery store on this browser, including unreadable data. Other site storage is untouched. This cannot cancel jobs, revoke tokens, refund payments or recover lost results.</p>
      <button type="button" onClick={() => forget(true)}>Forget all saved access on this browser</button>
    </details>}
  </main>
}

import { useEffect, useRef, useState } from "react"
import type { ListingSummary } from "../lib/hub-decode.ts"
import type { MarketActivityData } from "../lib/market-activity.ts"
import { ago } from "../lib/format.ts"

export function MarketActivity({ initial, listings, refresh }: {
  readonly initial: MarketActivityData; readonly listings: readonly ListingSummary[]
  readonly refresh: (options: { signal: AbortSignal }) => Promise<MarketActivityData>
}) {
  const [data, setData] = useState(initial), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false)
  const pending = useRef<AbortController | null>(null), generation = useRef(0)
  useEffect(() => {
    generation.current++; setData(initial); setBusy(false); setFailed(false)
    return () => { generation.current++; pending.current?.abort(); pending.current = null }
  }, [initial, refresh])
  const reload = async () => {
    if (pending.current) return
    const controller = new AbortController(), selected = generation.current
    pending.current = controller; setBusy(true); setFailed(false)
    try {
      const next = await refresh({ signal: controller.signal })
      if (controller.signal.aborted || selected !== generation.current) return
      if (next.records === null) setFailed(true)
      else setData(next)
    } catch { if (!controller.signal.aborted && selected === generation.current) setFailed(true) }
    finally { if (selected === generation.current) { pending.current = null; setBusy(false) } }
  }
  return <section className="market-activity" aria-label="Recent marketplace activity">
    <div className="section-heading"><div><p className="page-eyebrow">Public receipts</p><h2>Recent activity</h2></div><button className="button-secondary" type="button" disabled={busy} onClick={() => { void reload() }}>{busy ? "Refreshing…" : "Refresh activity"}</button></div>
    <p className="note">Hub-recorded calls, including test traffic. These are reported receipts, not independent chain verification or a measure of customer demand.</p>
    <p className="activity-updated" role="status">{failed ? "Refresh failed. Previously loaded activity stays visible; try again. " : ""}{data.observedAtMs === null ? "Activity has not loaded. Select Refresh activity to try again." : <>Last fetched <time dateTime={new Date(data.observedAtMs).toISOString()}>{new Date(data.observedAtMs).toISOString().slice(0, 19).replace("T", " ")} UTC</time>. Updated when you refresh.</>}</p>
    {data.records === null ? null : data.records.length === 0 ? <p className="market-notice">No public receipt records were returned. This is not a claim of zero marketplace usage.</p>
      : <ol className="activity-list">{data.records.map((record, index) => {
        const title = listings.find(listing => listing.id === record.skillId && listing.seller.toLowerCase() === record.seller.toLowerCase())?.serviceName ?? record.skillId.replaceAll("-", " ")
        return <li key={`${record.skillId}:${record.createdAtMs}:${index}`}><div className="activity-job"><a href={`/skill/${encodeURIComponent(record.skillId)}`}>{title}</a><span className="note">{ago(record.createdAtMs, data.observedAtMs)}{record.canary ? " · Canary test" : record.test ? " · Test rail" : ""}{record.session ? " · Session" : ""}</span></div>
          <span className="activity-verdict"><span className={record.state === "settled" ? "settled" : record.state === "not-settled" || record.state === "refunded" ? "unsettled" : ""}>{record.state === "settled" ? "Settled" : record.state === "not-settled" ? "Not settled" : record.state === "refunded" ? "Escrow refunded" : "Outcome uncertain"}</span><span className="usdc">{record.price}</span>{record.state === "settled" ? null : <span className="note">{record.amountLabel} amount</span>}</span>
          {record.explorer === null ? null : <a className="activity-receipt" href={record.explorer} target="_blank" rel="noreferrer">Receipt ↗</a>}
        </li>
      })}</ol>}
  </section>
}

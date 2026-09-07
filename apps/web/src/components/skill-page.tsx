import { Evidence, SchemaBlock } from "./evidence.tsx"
import { IndexedEvidence } from "./graph-evidence.tsx"
import { Nav } from "./nav.tsx"
import { RailDeclaration } from "./rail-declaration.tsx"
import { EscrowRecord } from "./escrow-record.tsx"
import { ago, txLink } from "../lib/format.ts"
import type { PublicReceiptChild, PublicReceiptRow } from "../lib/hub-decode.ts"
import type { SkillPageData } from "../lib/skill-page-data.ts"

const nameMessages: Record<NonNullable<SkillPageData["nameError"]>, string> = {
  invalid_name: "Invalid listing name. Use a skill ID or an ENS name.",
  name_expired: "The hub reports this name expired. Its detail is unavailable through this name.",
  name_unavailable: "Name resolution unavailable. No listing is confirmed for this name.",
  name_mismatch: "Name and listing evidence do not match. No listing is confirmed for this name."
}
const status = (settled: boolean) => settled ? "recorded settled" : "not recorded settled"

/** Never create a link from a reference alone or restore one withheld by H4. */
function Reference({ receipt, root }: { readonly receipt: PublicReceiptRow | PublicReceiptChild; readonly root: PublicReceiptRow }) {
  const expected = txLink(receipt.settleTx, { ...root, settled: receipt.settled })
  const target = expected !== null && receipt.explorer === expected ? expected : null
  return <p className="skill-reference">Settlement reference {receipt.settleTx === undefined ? "unavailable"
    : target === null ? <code className="skill-code">{receipt.settleTx}</code>
      : <a className="skill-code" href={target} target="_blank" rel="noreferrer">{receipt.settleTx}</a>}</p>
}

function Records({ data }: { readonly data: SkillPageData }) {
  return <section aria-label="Recent public records">
    <h2>Recent public records</h2>
    <p className="skill-note">Up to 20 returned hub receipt records. This is a recent sample, not complete history or an independent balance proof.</p>
    {data.receipts === null || data.receiptsError !== null ? <p role="status">Recent records unavailable. Other listing information may still be shown.</p>
      : data.receipts.length === 0 ? <p>No recent records returned.</p>
        : <ol className="skill-records">{data.receipts.map((r, i) => <li key={i}>
          <article>
            <div className="skill-record-heading"><h3 className="skill-code">{r.skillId}</h3>
              <span className="skill-money">{r.price} {r.rail === "erc8183" ? "quoted" : "authorized"}</span></div>
            {r.rail === "erc8183" ? <EscrowRecord receipt={r} /> : <p><span className={`skill-state${r.settled ? " is-settled" : " is-unresolved"}`}>{status(r.settled)}</span>
              {r.session === true ? <span className="skill-marker">session</span> : null}
              {r.canary === true ? <span className="skill-marker">canary</span> : null}</p>}
            <p className="skill-note">{ago(r.createdAtMs, data.observedAtMs)} · {r.latencyMs} ms · {r.rail} · <span className="skill-code">{r.network}</span></p>
            {r.rail === "erc8183" ? null : <><p>{r.reason}</p><Reference receipt={r} root={r} /></>}
            <details className="skill-disclosure"><summary>Recorded amounts and descendants</summary>
              {r.rail === "erc8183" ? <p>Quoted amount <span className="skill-money">{r.price}</span>; quoted seller share {r.sellerShare}; quoted fee {r.fee}. A quote is not a transfer.</p>
                : <p>Authorized amount <span className="skill-money">{r.price}</span>; recorded seller share {r.sellerShare}; recorded fee {r.fee}.</p>}
              <p>Settlement status is a receipt observation, not a balance proof. An uncertain paid outcome is not a confirmed refund.</p>
              <h4>Flat recorded descendants</h4>
              <p>These are a flat list, not direct parent-child edges. Ancestry is not available in this public record.</p>
              {r.children.length === 0 ? <p>No descendants returned in this record.</p>
                : <ul className="skill-descendants">{r.children.map((child, childIndex) => <li key={childIndex}>
                  <span className="skill-code">{child.skillId}</span> · <span className="skill-money">{child.price}</span> · {status(child.settled)}
                  {r.rail === "erc8183" ? <p>Child payment rail and transaction evidence unavailable in this compact root record.</p> : <Reference receipt={child} root={r} />}
                </li>)}</ul>}
            </details>
          </article>
        </li>)}</ol>}
  </section>
}

/** Read-only detail surface. Props come from the separately bounded, private-field-free loader. */
export function SkillPage({ data }: { readonly data: SkillPageData }) {
  const l = data.listing
  const eligible = l !== null && data.listingError === null && data.nameError === null && l.delisted !== true && l.ensExpired !== true
  return <main className="wrap skill-page">
    <Nav here="market" />
    {data.nameError === null ? null : <p className="skill-notice" role="status">{nameMessages[data.nameError]}</p>}
    {l === null ? <header className="skill-heading"><h1>Listing unavailable</h1>
      <p>The hub could not supply this listing. You can return to the <a href="/">catalogue</a>.</p></header>
      : <>
        <header className="skill-heading">
          <p className="skill-kicker">skill specification · <span className="skill-code">{l.id}</span></p>
          <div className="skill-title"><h1>{l.serviceName}</h1><p className="skill-price">{l.price}<span>per call</span></p></div>
          <p className="skill-description">{l.description}</p>
          <p className="skill-note">Version <span className="skill-code">{l.version}</span></p>
          <p>Seller <span className="skill-code skill-address">{l.seller}</span></p>
          <RailDeclaration listing={l} />
          <p className="skill-note">Hub-reported listing declarations, not current payment availability. This page does not offer browser escrow purchases.</p>
          {data.resolvedName === null || data.nameError !== null ? null : <p>Resolved name <span className="skill-code">{data.resolvedName}</span> — correlated by the hub observation.</p>}
          {eligible ? <div className="skill-next"><a href="/chat">Open chat</a><p>Availability and payment are checked separately. This page does not authorize a purchase.</p></div>
            : <p className="skill-notice">{l.delisted === true ? "Hub reports this listing delisted. " : ""}{l.ensExpired === true ? "Hub reports its name expired. " : ""}This detail is informational; no purchase availability is asserted.</p>}
        </header>
        <section aria-label="Schemas and declared bounds"><h2>Contract &amp; bounds</h2>
          <p className="skill-note">Seller-declared schemas and limits, shown as data.</p>
          <div className="skill-schemas"><SchemaBlock title="input" schema={l.inputSchema} /><SchemaBlock title="output" schema={l.outputSchema} /></div>
          {l.bounds === undefined ? <p>Declared bounds unavailable.</p> : <SchemaBlock title="Declared bounds" schema={l.bounds} />}
        </section>
        <section aria-label="Pay-test history"><h2>Pay-test history</h2>
          <p className="skill-note">Recorded hub tests, not a current availability guarantee. References have no reported rail/network here and are not linked.</p>
          {l.payTestHistory === undefined ? <p>Pay-test history unavailable.</p>
            : l.payTestHistory.length === 0 ? <p>No recorded pay-test history returned.</p>
              : <ol className="skill-paytests">{l.payTestHistory.map((t, i) => <li key={i}>
                <span className="skill-state">{t.ok ? "passed" : "failed"}</span> {ago(t.atMs, data.observedAtMs)}
                {t.settleTx === undefined ? null : <details className="skill-disclosure"><summary>Recorded test reference</summary><code className="skill-code">{t.settleTx}</code></details>}
              </li>)}</ol>}
        </section>
        <Evidence listing={l} />
        <IndexedEvidence evidence={l.graph} />
      </>}
    <Records data={data} />
  </main>
}

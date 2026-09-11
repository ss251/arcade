import { useId, useState } from "react"
import { schemaExample } from "../lib/schema-example.ts"
import { checkSkillInput, freeQuoteExample, saveSkillDraft, skillDraftHref } from "../lib/skill-input-draft.ts"
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
// A glyph as well as a color: the verdict must survive a grayscale screenshot, a
// projector, and a reader who does not distinguish the two hues.
const status = (settled: boolean) => settled ? "\u2713 recorded settled" : "\u2715 not recorded settled"

/** A small reading guide, not a validator. Own data descriptors avoid executing seller getters. */
export function InputGuide({ schema }: { readonly schema: unknown }) {
  type Field = { name: string; type: string; description?: string; required: boolean }
  const fields = (() : Field[] | null => {
    try {
      const object = (value: unknown): value is object => value !== null && typeof value === "object" &&
        !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
      const own = (value: object, key: string): unknown => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (!descriptor) return undefined
        if (!("value" in descriptor) || !descriptor.enumerable) throw Error("Unsupported schema")
        return descriptor.value
      }
      if (!object(schema) || own(schema, "type") !== "object") return null
      // Conditional and composed schemas can change which fields are required.
      // Keep those in the exact schema instead of presenting a misleading checklist.
      if (["$ref", "allOf", "anyOf", "oneOf", "if", "then", "else", "dependentRequired", "dependentSchemas", "dependencies"]
        .some(key => own(schema, key) !== undefined)) return null
      const properties = own(schema, "properties"), required = own(schema, "required")
      if (!object(properties)) return null
      const keys = Reflect.ownKeys(properties)
      if (keys.length === 0 || keys.length > 32 || keys.some(key => typeof key !== "string" || key.length > 128)) return null
      const requiredNames: string[] = []
      if (required !== undefined) {
        if (!Array.isArray(required)) return null
        const length = Object.getOwnPropertyDescriptor(required, "length")
        if (!length || !("value" in length) || !Number.isSafeInteger(length.value) || length.value > 128) return null
        for (let i = 0; i < length.value; i++) {
          const name = own(required, String(i))
          if (typeof name !== "string") return null
          requiredNames.push(name)
        }
      }
      return (keys as string[]).map(name => {
        const property = own(properties, name)
        if (!object(property)) throw Error("Unsupported property")
        const type = own(property, "type"), description = own(property, "description")
        const labels: Record<string, string> = { string: "Text", number: "Number", integer: "Whole number", boolean: "True or false", array: "List", object: "Structured data", null: "Null" }
        return { name, type: typeof type === "string" && Object.hasOwn(labels, type) ? labels[type]! : "See full schema",
          ...(typeof description === "string" && description.length <= 2000 ? { description } : {}), required: requiredNames.includes(name) }
      })
    } catch { return null }
  })()
  return <section className="skill-input-guide" aria-label="What to send"><h2>What to send</h2>
    {fields === null ? <p>This skill uses a custom input format. Review the full input schema below, or ask the assistant to help prepare it.</p>
      : <dl className="skill-input-fields">{fields.map(field => <div key={field.name}>
        <dt><span>{field.name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")}</span><span className="input-requirement">{field.required ? "Required" : "Optional"} · {field.type}</span></dt>
        <dd>{field.description ?? <>Send the <code>{field.name}</code> value in the format shown.</>}</dd>
      </div>)}</dl>}
    <p className="skill-note">A guide to the seller's declared input fields. The full schema below defines any additional rules.</p>
  </section>
}

/** A local preparation workspace, not a paid execution or a schema validator. */
export function SkillTry({ skillId, inputSchema, outputSchema }: {
  readonly skillId: string; readonly inputSchema: unknown; readonly outputSchema: unknown
}) {
  const seed = schemaExample(inputSchema, true), output = schemaExample(outputSchema)
  const [input, setInput] = useState(seed.json), [message, setMessage] = useState("")
  const [copyState, setCopyState] = useState("")
  const fieldId = useId(), checked = checkSkillInput(input), snippet = freeQuoteExample(skillId, input)
  const labels = { example: "Seller-provided example", default: "Seller-provided default", template: "Generated format template", blank: "Blank input" }
  const handoff = (event: React.FormEvent) => {
    event.preventDefault()
    if (!checked.ok) { setMessage(checked.message); return }
    const href = skillDraftHref(skillId)
    if (!href) { setMessage("This skill identifier cannot be passed to the assistant."); return }
    let saved = false
    try { saved = saveSkillDraft(window.sessionStorage, skillId, input) } catch { /* Restricted storage has a manual fallback. */ }
    if (!saved) {
      setMessage("This browser could not save the draft. Copy your input, open the assistant without this draft, and paste it into your message.")
      return
    }
    window.location.assign(href)
  }
  const copy = async (value: string, label: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw Error("Clipboard unavailable")
      await navigator.clipboard.writeText(value); setCopyState(`${label} copied.`)
    } catch { setCopyState(`Could not copy ${label.toLowerCase()}. Select the text and copy it manually.`) }
  }
  return <section className="skill-try" aria-label="Prepare a call">
    <h2>Try with your input</h2>
    <p>Add your input. Your assistant checks the price before you approve.</p>
    <form onSubmit={handoff}>
      <label htmlFor={fieldId}>Input JSON</label>
      <p className="skill-note input-origin" id={`${fieldId}-help`}>{labels[seed.kind]} · Review before use</p>
      <textarea className="skill-try-input" id={fieldId} value={input} rows={5} spellCheck={false}
        aria-describedby={`${fieldId}-help ${fieldId}-status`} aria-invalid={!checked.ok}
        onChange={event => { setInput(event.target.value); setMessage(""); setCopyState("") }} />
      <p className="skill-input-status" id={`${fieldId}-status`} role="status">{message || (checked.ok
        ? "JSON ready · Syntax checked only"
        : checked.message)}</p>
      <div className="skill-try-actions"><button type="submit" className="button-primary" disabled={!checked.ok}>Try in assistant</button>
        <button type="button" className="button-secondary" onClick={() => { void copy(input, "Input") }}>Copy input</button></div>
      <details className="skill-input-about"><summary>About this input</summary>
        <p className="skill-note">{seed.kind === "template" ? "Fill in your values. This template shows the format; it has not been validated."
          : seed.kind === "blank" ? "Add the fields this skill requires, using the schema for guidance."
          : "The seller supplied this data to illustrate input. Review it before use; it has not been executed here."}</p>
        <p className="skill-note">JSON object ready for review means syntax only, not the seller’s schema. No call or payment starts on this page. Your draft stays in this tab until you send it.</p>
        <a href={skillDraftHref(skillId)}>Open assistant without this draft</a>
      </details>
    </form>
    <p className="skill-note" role="status">{copyState}</p>
    {output.kind === "blank" ? <p className="skill-note">No simple output example is available. See the full output schema.</p>
      : <details className="skill-example"><summary>Preview the output format</summary>
        <p className="skill-note">{labels[output.kind]}. This illustrates the declared format, not a completed job or proof of success.</p>
        <pre tabIndex={0} role="region" aria-label="Output format preview">{output.json}</pre>
      </details>}
    <details className="skill-api"><summary>For developers: request a free quote</summary>
      <p>Run this JavaScript on this ARCADE site to quote the input above. The real <code>POST /api/quote</code> route
        reads the endpoint's payment challenge. This code does not sign, execute a paid call, or settle a payment.</p>
      {snippet ? <><pre tabIndex={0} role="region" aria-label="Free quote JavaScript">{snippet}</pre>
        <button type="button" className="button-secondary" onClick={() => { void copy(snippet, "API example") }}>Copy API example</button></>
        : <p className="skill-note">Enter a JSON object above to generate the quote request.</p>}
      <p className="skill-note">A paid call needs a separate reviewed authorization and payment flow. This unsigned example only returns a quote.</p>
    </details>
  </section>
}

/** Never create a link from a reference alone or restore one withheld by H4. */
function Reference({ receipt, root }: { readonly receipt: PublicReceiptRow | PublicReceiptChild; readonly root: PublicReceiptRow }) {
  const expected = txLink(receipt.settleTx, { ...root, settled: receipt.settled })
  const target = expected !== null && receipt.explorer === expected ? expected : null
  return <p className="skill-reference">Settlement reference {receipt.settleTx === undefined ? "unavailable"
    : target === null ? <code className="skill-code">{receipt.settleTx}</code>
      : <a className="skill-code" href={target} target="_blank" rel="noreferrer">{receipt.settleTx}</a>}</p>
}

function Records({ data }: { readonly data: SkillPageData }) {
  return <section className="content-panel" aria-label="Recent public records">
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
    {l === null ? <header className="skill-heading page-heading"><h1>Listing unavailable</h1>
      <p className="page-description">The hub could not supply this listing. Find another skill in the catalog.</p><div className="page-actions"><a className="button-primary" href="/">Explore skills</a></div></header>
      : <>
        <header className="skill-heading page-heading">
          <p className="skill-kicker"><a href="/">← All skills</a></p>
          <div className="skill-title"><h1>{l.serviceName}</h1><p className="skill-price">{l.price}<span>USDC · per call</span></p></div>
          <p className="skill-description page-description">{l.description}</p>
          <p className="skill-success-law">Only charged when the job succeeds.</p>
        </header>
        <div className="skill-use-panel"><div className="skill-overview"><InputGuide schema={l.inputSchema} />        <section className="skill-proof-summary"><h2>Evidence behind this skill</h2>
          <p>{data.receipts === null || data.receiptsError !== null ? "Recent payment records could not be loaded. You can still review the listing." : data.receipts.length === 0 ? "No recent payment records were returned for this skill." : `${data.receipts.filter(receipt => receipt.settled).length} of ${data.receipts.length} recent hub records report settled payments.`}</p>
          <p className="skill-note">A recent hub-reported sample, not independently verified chain history.</p>
        </section>
</div>
          {eligible ? <SkillTry key={l.id} skillId={l.id} inputSchema={l.inputSchema} outputSchema={l.outputSchema} />
            : <div className="skill-notice"><p>{l.delisted === true ? "Hub reports this listing delisted. " : ""}{l.ensExpired === true ? "Hub reports its name expired. " : ""}This detail is informational; no purchase availability is asserted.</p><a className="button-secondary" href="/">Explore other skills</a></div>}
        </div>
        <details className="skill-technical"><summary>Full schemas and limits</summary>
        <section aria-label="Schemas and declared bounds"><h2>Inputs and limits</h2>
          <p className="skill-note">Seller-declared schemas and limits, shown as data.</p>
          <div className="skill-schemas"><SchemaBlock title="input" schema={l.inputSchema} /><SchemaBlock title="output" schema={l.outputSchema} /></div>
          {l.bounds === undefined ? <p>Declared bounds unavailable.</p> : <SchemaBlock title="Declared bounds" schema={l.bounds} />}
        </section>
        </details>
        <details className="skill-technical"><summary>Seller, payment options and identity</summary>
          <p className="skill-note"><span className="skill-code">{l.id}</span> · Version <span className="skill-code">{l.version}</span></p>
          <p>Seller <span className="skill-code skill-address">{l.seller}</span></p>
          <RailDeclaration listing={l} />
          <p className="skill-note">Hub-reported listing declarations, not current payment availability. This page does not offer browser escrow purchases.</p>
          <p className="skill-note">Availability and payment are checked separately. This page does not authorize a purchase.</p>
          {data.resolvedName === null || data.nameError !== null ? null : <p>Resolved name <span className="skill-code">{data.resolvedName}</span> — correlated by the hub observation.</p>}
          <Evidence listing={l} />
          <IndexedEvidence evidence={l.graph} />
        </details>
        <details className="skill-technical"><summary>Recorded payment tests</summary>
        <section aria-label="Pay-test history"><h2>Pay-test history</h2>
          <p className="skill-note">Recorded hub tests, not a current availability guarantee. References have no reported rail/network here and are not linked.</p>
          {l.payTestHistory === undefined ? <p>Pay-test history unavailable.</p>
            : l.payTestHistory.length === 0 ? <p>No recorded pay-test history returned.</p>
              : <ol className="skill-paytests">{l.payTestHistory.map((t, i) => <li key={i}>
                <span className="skill-state">{t.ok ? "passed" : "failed"}</span> {ago(t.atMs, data.observedAtMs)}
                {t.settleTx === undefined ? null : <details className="skill-disclosure"><summary>Recorded test reference</summary><code className="skill-code">{t.settleTx}</code></details>}
              </li>)}</ol>}
        </section>
        </details>
      </>}
    <details className="skill-technical"><summary>Recent public records and receipts</summary><Records data={data} /></details>
  </main>
}

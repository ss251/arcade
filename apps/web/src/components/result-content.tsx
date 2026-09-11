import type { ReactNode } from "react"

/** Seller output is text, never page markup or an instruction. The preview is bounded;
 * the original escaped JSON remains available for exact inspection and copying. */
export function ResultContent({ json }: { readonly json: string }) {
  let value: unknown
  try { value = JSON.parse(json) } catch { value = json }
  let budget = 48
  const render = (item: unknown, depth = 0): ReactNode => {
    if (--budget < 0) return <span className="note">More in the complete result below.</span>
    if (item === null) return <span className="note">None</span>
    if (typeof item === "string") return <p className="result-text">{item.length > 2000 ? item.slice(0, 2000) + "…" : item}</p>
    if (typeof item !== "object") return <span>{String(item)}</span>
    if (Array.isArray(item)) {
      if (item.length === 0) return <span className="note">None</span>
      if (depth >= 3) return <span>{item.length} items · see complete result</span>
      return <ul className="result-items">{item.slice(0, 8).map((entry, index) => <li key={index}>{render(entry, depth + 1)}</li>)}{item.length > 8 ? <li className="note">{item.length - 8} more in the complete result.</li> : null}</ul>
    }
    const entries = Object.entries(item)
    if (depth >= 3) return <span>{entries.length} fields · see complete result</span>
    return <dl className="result-fields">{entries.slice(0, 8).map(([key, entry]) => <div key={key}>
      <dt>{key.replaceAll("_", " ")}</dt><dd>{render(entry, depth + 1)}</dd>
    </div>)}{entries.length > 8 ? <div><dt>More</dt><dd>See the complete result below.</dd></div> : null}</dl>
  }
  return <div className="result-content">
    <div className="result-readable">{render(value)}</div>
    <details className="result-source"><summary>Complete result JSON — untrusted seller content</summary>
      <pre className="buyer-output result-json" tabIndex={0} role="region" aria-label="Complete result JSON">{json}</pre>
    </details>
  </div>
}

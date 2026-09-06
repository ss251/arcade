import type { ListingDetail } from "../lib/hub-decode.ts"

/** Pure bounded JSON text. Never call an input getter, coercion or toJSON hook. */
function schemaText(schema: unknown): string | null {
  try {
    const parts: string[] = [], ancestors = new Set<object>(), encoder = new TextEncoder()
    let bytes = 0, nodes = 0
    const refuse = (): never => { throw new Error("schema unavailable") }
    const add = (s: string) => { bytes += encoder.encode(s).byteLength; if (bytes > 65_536) refuse(); parts.push(s) }
    const quoted = (s: string) => { if (s.length > 65_536) refuse(); add(JSON.stringify(s)) }
    const walk = (value: unknown, depth: number): void => {
      if (++nodes > 8192 || depth > 16) refuse()
      if (value === null) { add("null"); return }
      if (typeof value === "string") { quoted(value); return }
      if (typeof value === "boolean") { add(value ? "true" : "false"); return }
      if (typeof value === "number" && Number.isFinite(value)) { add(JSON.stringify(value)); return }
      if (typeof value !== "object" || value === null || ancestors.has(value)) refuse()
      const obj = value as object, isArray = Array.isArray(obj)
      if (!isArray && ![Object.prototype, null].includes(Object.getPrototypeOf(obj))) refuse()
      const keys = Reflect.ownKeys(obj)
      if (keys.length > 8193 || keys.some(k => typeof k !== "string")) refuse()
      const entries: Array<readonly [string, unknown]> = []
      if (isArray) {
        const length = Object.getOwnPropertyDescriptor(obj, "length")
        if (length === undefined || !("value" in length) || !Number.isSafeInteger(length.value) || length.value > 8192 || length.value < 0) refuse()
        if (keys.length !== length!.value + 1) refuse()
        for (let i = 0; i < length!.value; i++) {
          const d = Object.getOwnPropertyDescriptor(obj, String(i))
          if (!d?.enumerable || !("value" in d)) refuse()
          entries.push([String(i), d!.value])
        }
      } else {
        for (const key of keys) {
          const d = Object.getOwnPropertyDescriptor(obj, key)
          if (!d?.enumerable || !("value" in d) || (key as string).length > 65_536) refuse()
          entries.push([key as string, d!.value])
        }
      }
      ancestors.add(obj)
      add(isArray ? "[" : "{")
      entries.forEach(([key, child], i) => {
        add(`${i === 0 ? "" : ","}\n${"  ".repeat(depth + 1)}`)
        if (!isArray) { quoted(key); add(": ") }
        walk(child, depth + 1)
      })
      if (entries.length > 0) add(`\n${"  ".repeat(depth)}`)
      add(isArray ? "]" : "}")
      ancestors.delete(obj)
    }
    walk(schema, 0)
    return parts.join("")
  } catch { return null }
}

/** Read-only native disclosure; safe text remains copyable without executing a schema. */
export function SchemaBlock({ title, schema }: { readonly title: string; readonly schema: unknown }) {
  const rendered = schemaText(schema)
  return <details className="skill-schema">
    <summary>{title}</summary>
    {rendered === null ? <p>Schema unavailable for safe display.</p>
      : <pre tabIndex={0} aria-label={`${title} JSON`}><code>{rendered}</code></pre>}
  </details>
}

/** Hub observations, not an inferred reputation, purchase gate or independent chain proof. */
export function Evidence({ listing }: { readonly listing: ListingDetail }) {
  const count = (v: number | undefined, max: number): v is number =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max
  // H4 emits these as one validated fresh bundle. Preserve that invariant even
  // when this exported pure component is rendered directly with mixed props.
  const countsAvailable = typeof listing.agentId === "string" && /^(0|[1-9][0-9]{0,77})$/.test(listing.agentId) &&
    BigInt(listing.agentId) < 1n << 256n && listing.agentVerified === true && listing.evidenceStale === false &&
    count(listing.validationPasses, 20) && count(listing.validationsRead, 20) &&
    listing.validationPasses <= listing.validationsRead && count(listing.settlementFeedback, 4096)
  return <section className="skill-evidence" aria-label="Settlement evidence">
    <h2>settlement evidence</h2>
    <p className="skill-note">Hub-reported observations. These do not establish purchase availability.</p>
    <dl className="skill-facts">
      <div><dt>ERC-8004 identity</dt><dd>{listing.agentId === undefined ? "Identity evidence unavailable"
        : <><span className="skill-code">agent #{listing.agentId}</span><br />
          {listing.agentVerified === true ? "Hub-verified seller ownership (last observation)"
            : "Announced identity; ownership unverified"}</>}</dd></div>
      <div><dt>Freshness</dt><dd>{listing.evidenceStale === true ? "Evidence is stale"
        : listing.evidenceStale === false ? "Hub did not mark this observation stale" : "Evidence freshness unavailable"}</dd></div>
      <div><dt>Validation observations</dt><dd>{!countsAvailable
        ? "Validation count unavailable" : `${listing.validationPasses} of ${listing.validationsRead} matching answered validations passed`}</dd></div>
      <div><dt>Feedback observations</dt><dd>{!countsAvailable
        ? "Feedback count unavailable" : `${listing.settlementFeedback} matching feedback records`}</dd></div>
    </dl>
    <details className="skill-disclosure"><summary>What these counts cover</summary>
      <p>Validations match the configured validator and tag among the latest 20 unique validation requests. A response 100 counts as a pass.</p>
      <p>Feedback matches the configured attester and tag, value 1 and decimals 0: unrevoked, agent-wide records, capped at 4096.</p>
      <p>This is not a tally of this skill’s payments, all finished jobs, or independently verified receipt proofs.</p>
    </details>
    {listing.registrationTx === undefined && listing.registrationUri === undefined ? null
      : <details className="skill-disclosure"><summary>Announced registration metadata</summary>
        <p>Seller announcements; the transaction and document contents are not independently verified here. Link context is unavailable.</p>
        {listing.registrationTx === undefined ? null : <p>Announced registration reference <code className="skill-code">{listing.registrationTx}</code></p>}
        {listing.registrationUri === undefined ? null : <p>Announced document path <code className="skill-code">{listing.registrationUri}</code></p>}
      </details>}
    {listing.ensName == null ? null : <div className="skill-name">
      <h3>ENS observation</h3><p className="skill-code">{listing.ensName}</p>
      <p>{listing.ensExpired === true ? "Hub reports name expired" : listing.ensExpired === false
        ? "Hub reports name not expired" : "Name expiry unavailable"}; not a current runner-liveness proof.</p>
    </div>}
  </section>
}

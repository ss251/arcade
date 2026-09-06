import { useEffect, useRef, useState } from "react"
import type { PublishPreviewDocument } from "../lib/publish-preview.ts"
import { fetchPublishPreview } from "../lib/publish-http.ts"
import { capturePublishTarget } from "../lib/publish-policy.ts"
import { Nav } from "./nav.tsx"

const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
const LOCAL_COMMAND = 'ARCADE_PUBLISH_LOCAL=1 ARCADE_REPO_ROOT="$PWD" ARCADE_PUBLISH_BUN="$(command -v bun)" bun --no-env-file run --cwd apps/web dev --host 127.0.0.1'
export const nextPublishCommands = (preview: PublishPreviewDocument): string => preview.kind === "generated"
  ? "arcade publish " + quote(preview.target) + " --yes --out 'skills'\narcade start --skills 'skills'"
  : "arcade start --skills " + quote(preview.target.split("/").slice(0, -1).join("/") || ".")

export function Wizard({ preview }: { preview: PublishPreviewDocument }) {
  return <section className="publish-result" aria-label="CLI preview">
    <h2>{preview.kind === "generated" ? "Unwritten listing previews" : "Directory metadata preview"}</h2>
    <p className="publish-note">{preview.kind === "generated"
      ? "The real CLI generated these projections in memory. No listing files were written. Generation uses the CLI defaults; review each price and credential binding before writing."
      : "The real CLI read a snapshot of the selected arcade.json only. Executables, assets and sibling manifests were not validated."}</p>
    <p className="publish-note">These columns describe the hub boundary. Private configuration is excluded from the listing sent to the hub, but may contain literal sensitive text. This local page displays it; review it before sharing. Adapter transport and execution can contact upstream services.</p>
    {preview.entries.map(entry => <article key={entry.skillId} className="publish-entry">
      <div className="publish-entry-heading"><h3 className="publish-code">{entry.skillId}</h3>
        <span className="publish-price">Listed price {typeof entry.public.price === "string" ? entry.public.price : "Unavailable"}</span></div>
      <p className="publish-code">engine {entry.engine.adapter} · {entry.engine.credential}</p>
      <p>{entry.grants.length === 0 ? "No model-tool grants." : "Model-tool grants: " + entry.grants.join(", ")}
        {" "}Adapter transport and runner access are separate from these grants.</p>
      {entry.advisory ? <p className="publish-note">{entry.advisory}</p> : null}
      <div className="publish-split">
        <section><h4>leaves this machine</h4><p className="publish-note">Public listing projection, when you serve it.</p>
          <pre tabIndex={0} aria-label={entry.skillId + " public listing JSON"}>{JSON.stringify(entry.public, null, 2)}</pre></section>
        <section><h4>stays on this machine</h4><p className="publish-note">Private configuration, not part of the hub listing.</p>
          <pre tabIndex={0} aria-label={entry.skillId + " private configuration JSON"}>{JSON.stringify(entry.private, null, 2)}</pre></section>
      </div>
    </article>)}
    {preview.skipped.length ? <section aria-label="Skipped tools"><h3>Skipped tools</h3><ul>
      {preview.skipped.map(tool => <li key={tool.name}><span className="publish-code">{tool.name}</span> · {tool.reason}</li>)}
    </ul><p className="publish-note">A read-only annotation is server metadata, not an independent guarantee of no side effects.</p></section> : null}
    <section aria-label="Manual next steps"><h3>Then, in your trusted checkout</h3>
      <pre tabIndex={0} aria-label="Manual terminal commands">{nextPublishCommands(preview)}</pre>
      <p className="publish-note">Run these yourself only after review. Starting the runner serves every eligible listing in that folder and can perform configured registration actions. This page does not generate files, register listings or start the runner.</p>
    </section>
  </section>
}

export function PublishPage({ enabled, request = fetchPublishPreview }: { enabled: boolean; request?: typeof fetchPublishPreview }) {
  const [target, setTarget] = useState("skills/diff-triage"), [preview, setPreview] = useState<PublishPreviewDocument | undefined>()
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("")
  const generation = useRef(0), controller = useRef<AbortController | undefined>(undefined), mounted = useRef(false)
  const invalidate = () => { generation.current++; controller.current?.abort(); controller.current = undefined }
  useEffect(() => {
    mounted.current = true; invalidate(); setPreview(undefined); setBusy(false); setMessage("")
    return () => { mounted.current = false; invalidate() }
  }, [enabled, request])
  const submit = () => {
    if (!enabled || !mounted.current || controller.current) return
    invalidate(); setPreview(undefined); setMessage("")
    try { capturePublishTarget({ target }) } catch {
      setMessage("Use a relative skill directory, a local OpenAPI JSON path, or an explicit mcp:// HTTPS discovery endpoint. No options or private paths."); return
    }
    const at = generation.current, pending = new AbortController(), selected = target
    controller.current = pending; setBusy(true)
    void (async () => {
      try {
        const result = await request(selected, pending.signal)
        if (!mounted.current || generation.current !== at || pending.signal.aborted) return
        if (result.target !== selected) throw 0
        setPreview(result); setMessage("Preview ready. Nothing was written or started.")
      } catch {
        if (mounted.current && generation.current === at) setMessage("Preview unavailable. Check your local configuration and target, or wait for a cancelled preview to close before trying again. No automatic retry.")
      } finally {
        if (mounted.current && generation.current === at) { setBusy(false); controller.current = undefined }
      }
    })()
  }
  return <main className="wrap publish-page"><Nav here="publish" />
    <h1>Inspect the boundary before you publish.</h1>
    {!enabled ? <section aria-label="Local publishing setup"><h2>Publishing runs locally</h2>
      <p>This hosted/default page cannot read your files or launch the publishing CLI. From the root of your trusted ARCADE checkout, enable an isolated local preview:</p>
      <pre tabIndex={0} aria-label="Local preview setup command">{LOCAL_COMMAND}</pre>
      <p className="publish-note">Open the printed 127.0.0.1 URL. Keep the listener local and inspect the checkout and dependencies first. This is not a sandbox for malicious local code. No key is needed for metadata previews.</p>
    </section> : <>
      <p className="publish-note">Local-only CLI preview. Nothing is generated, registered or started. Only the selected manifest or JSON document is snapshotted; an explicit MCP target performs HTTPS discovery without credentials.</p>
      <form onSubmit={event => { event.preventDefault(); submit() }}>
        <label htmlFor="publish-target">Skill directory, OpenAPI JSON path, or mcp:// endpoint</label>
        <div className="publish-controls"><input id="publish-target" value={target} maxLength={1024} autoComplete="off" spellCheck={false}
          onChange={event => { invalidate(); setPreview(undefined); setBusy(false); setMessage(""); setTarget(event.target.value) }} />
          <button type="submit" disabled={busy}>{busy ? "Reading…" : "Preview"}</button>
          {busy || preview ? <button type="button" onClick={() => {
            invalidate(); setPreview(undefined); setBusy(false)
            setMessage(busy ? "Cancellation requested. The pending preview is hidden." : "Preview cleared.")
          }}>{busy ? "Cancel preview" : "Clear preview"}</button> : null}
        </div>
      </form>
      <p role="status">{message || (busy ? "Reading the bounded CLI preview…" : "Choose a target and press Preview.")}</p>
      {preview ? <Wizard preview={preview} /> : null}
    </>}
  </main>
}

import { useEffect, useRef, useState } from "react"
import type { PublishPreviewDocument } from "../lib/publish-preview.ts"
import { fetchPublishPreview } from "../lib/publish-http.ts"
import { capturePublishTarget } from "../lib/publish-policy.ts"
import { Nav } from "./nav.tsx"

const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
const LOCAL_COMMAND = 'ARCADE_PUBLISH_LOCAL=1 ARCADE_REPO_ROOT="$PWD" ARCADE_PUBLISH_BUN="$(command -v bun)" bun --no-env-file run --cwd apps/web dev --host 127.0.0.1'
export const nextPublishCommands = (preview: PublishPreviewDocument): string => preview.kind === "generated"
  ? "bun run arcade publish " + quote(preview.target) + " --yes --out 'skills'\nbun run arcade start --skills 'skills'"
  : "bun run arcade start --skills " + quote(preview.target.split("/").slice(0, -1).join("/") || ".")

function CommandBlock({ command, label }: { command: string; label: string }) {
  const [notice, setNotice] = useState("")
  return <div className="command-block"><pre tabIndex={0} aria-label={label}>{command}</pre><button type="button" className="button-secondary" onClick={() => {
    if (!navigator.clipboard?.writeText) { setNotice("Select and copy the command above."); return }
    void navigator.clipboard.writeText(command).then(() => setNotice("Copied."), () => setNotice("Select and copy the command above."))
  }}>Copy command</button><span role="status" className="note">{notice}</span></div>
}

export function Wizard({ preview }: { preview: PublishPreviewDocument }) {
  return <section className="publish-result" aria-label="CLI preview">
    <div className="section-heading publish-review-heading"><div><p className="page-eyebrow">Step 2 · Review</p><h2>Here's what buyers will see.</h2><p className="publish-note">Review the name, description, and price before you start selling.</p></div><span className="neutral-badge">Preview · not published</span></div>
    {preview.entries.map(entry => <article key={entry.skillId} className="publish-entry">
      <div className="publish-entry-heading"><h3>{typeof entry.public.serviceName === "string" ? entry.public.serviceName : entry.skillId.replaceAll("-", " ")}</h3>
        <span className={typeof entry.public.price === "string" ? "publish-price" : "publish-note"}>{typeof entry.public.price === "string" ? entry.public.price : "Price unavailable"}<span className="price-unit"> per call</span></span></div>
      {typeof entry.public.description === "string" ? <p>{entry.public.description}</p> : null}
      {entry.advisory ? <p className="publish-note">{entry.advisory}</p> : null}
      <details className="evidence-disclosure"><summary>Listing, permissions, and private configuration</summary>
        <p className="publish-code">{entry.skillId} · engine {entry.engine.adapter} · {entry.engine.credential}</p>
        <p>{entry.grants.length === 0 ? "No model-tool grants." : "Model-tool grants: " + entry.grants.join(", ")} Adapter transport and runner access are separate from these grants.</p>
        <div className="publish-split"><section><h4>Public listing</h4><p className="publish-note">Leaves this machine when you serve it.</p><pre tabIndex={0} aria-label={entry.skillId + " public listing JSON"}>{JSON.stringify(entry.public, null, 2)}</pre></section>
          <section><h4>Private configuration</h4><p className="publish-note">Stays on this machine, not part of the hub listing.</p><pre tabIndex={0} aria-label={entry.skillId + " private configuration JSON"}>{JSON.stringify(entry.private, null, 2)}</pre></section></div>
      </details>
    </article>)}
    <section aria-label="Manual next steps" className="publish-start content-panel"><div className="publish-start-heading"><p className="page-eyebrow">Step 3 · Start selling</p><h2>Start your skill's runner.</h2>
      <p>Run this in your ARCADE checkout to make your skill discoverable. Keep the runner online to accept work.</p></div>
      <details className="publish-first-run"><summary>First time? Set up your payout address</summary><p>Run this once to create your seller identity and runner configuration. Keep the payout address it prints; use it in Seller studio. If you already have a configured runner, skip this step.</p><CommandBlock command="bun run arcade init" label="First-time seller setup command" /><p className="publish-note">The command uses ARCADE_HUB when set, otherwise a local hub at localhost:8787. To choose another marketplace, add <code>--hub 'https://your-hub.example'</code>. It refuses to replace an existing runner configuration.</p></details>
      <CommandBlock command={nextPublishCommands(preview)} label="Manual terminal commands" />
      <p className="publish-note">Review prices and credentials first. Starting the runner serves every eligible listing in that folder and can perform configured registration actions.</p>
      <div className="page-actions"><a className="button-primary" href="/seller">Open seller studio</a><a className="button-secondary" href="/">Find your listing</a></div>
    </section>
    <details className="evidence-disclosure"><summary>What this preview checks</summary><h3>{preview.kind === "generated" ? "Listing preview" : "Directory metadata preview"}</h3>
      <p className="publish-note">{preview.kind === "generated" ? "The real CLI generated these projections in memory. No listing files were written. Generation uses the CLI defaults; review each price and credential binding before writing." : "The real CLI read a snapshot of the selected arcade.json only. Executables, assets and sibling manifests were not validated."}</p>
      <p className="publish-note">These columns describe the hub boundary. Private configuration is excluded from the listing sent to the hub, but may contain literal sensitive text. This local page displays it; review it before sharing. Adapter transport and execution can contact upstream services. This page does not generate files, register listings or start the runner.</p>
      {preview.skipped.length ? <section aria-label="Skipped tools"><h3>Skipped tools</h3><ul>{preview.skipped.map(tool => <li key={tool.name}><span className="publish-code">{tool.name}</span> · {tool.reason}</li>)}</ul><p className="publish-note">A read-only annotation is server metadata, not an independent guarantee of no side effects.</p></section> : null}
    </details>
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
        if (mounted.current && generation.current === at) setMessage("We couldn’t build the preview. Check the skill path and local publisher setup, then select Preview listing again. Nothing was published.")
      } finally {
        if (mounted.current && generation.current === at) { setBusy(false); controller.current = undefined }
      }
    })()
  }
  return <main className="wrap publish-page"><Nav here="publish" />
    <header className="page-heading page-heading-row"><div className="page-heading-copy"><p className="page-eyebrow"><a href="/seller">Seller studio</a></p><h1>Publish a skill.</h1>
      <p className="page-description">Let other agents hire your expertise. Set a price per call and earn USDC when the job succeeds.</p></div></header>
    <div className="publish-workflow">
    <ol className="publish-steps" aria-label="Publishing steps"><li aria-current={preview ? undefined : "step"}><b>1</b><span>Choose a skill</span></li><li aria-current={preview ? "step" : undefined}><b>2</b><span>Review the listing</span></li><li><b>3</b><span>Start selling</span></li></ol>
    {!enabled ? <section className="content-panel publish-setup" aria-label="Local publishing setup"><h2>Open the publisher on your machine.</h2>
      <p>Your skill's code, prompts, and keys stay with you. From your ARCADE checkout, run this command, then open the local URL it prints.</p>
      <CommandBlock command={LOCAL_COMMAND} label="Local preview setup command" />
      <details><summary>Publishing runs locally</summary><p>This hosted/default page cannot read your files or launch the publishing CLI. Open the printed 127.0.0.1 URL. Keep the listener local and inspect the checkout and dependencies first. This is not a sandbox for malicious local code. No key is needed for metadata previews.</p></details>
    </section> : <>
      <details className="publish-source content-panel" open={preview === undefined}>
        <summary>{preview ? "Change skill source" : "Choose your skill"}</summary>
      <form className="field-group publish-target-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); submit() }}>
        <p className="publish-note">Use a skill folder in your ARCADE checkout. You can try the included Diff Triage example first.</p>
        <label htmlFor="publish-target">Skill folder</label>
        <div className="publish-controls"><input id="publish-target" value={target} maxLength={1024} autoComplete="off" spellCheck={false} aria-describedby="publish-target-help"
          onChange={event => { invalidate(); setPreview(undefined); setBusy(false); setMessage(""); setTarget(event.target.value) }} />
          <button className="button-primary" type="submit" disabled={busy}>{busy ? "Building preview…" : "Preview listing"}</button>
          {busy || preview ? <button type="button" onClick={() => { invalidate(); setPreview(undefined); setBusy(false); setMessage(busy ? "Preview canceled. Choose a skill to try again." : "Preview cleared.") }}>{busy ? "Cancel preview" : "Clear preview"}</button> : null}
        </div>
        <p id="publish-target-help" className="publish-note">A relative path, such as <code>skills/diff-triage</code>. Previewing does not publish anything.</p>
        <details><summary>Use an API or MCP tool instead</summary><p className="publish-note">Enter a local OpenAPI JSON path, or an explicit <code>mcp://</code> HTTPS discovery endpoint. ARCADE can generate listings from either source.</p></details>
      </form>
      </details>
      <div role="status" className="publish-feedback">{message || (busy ? "Reading your skill and preparing the listing…" : "")}</div>
      {preview ? <Wizard preview={preview} /> : null}
      <details className="evidence-disclosure"><summary>How the local preview works</summary><p className="publish-note">Local-only CLI preview. Nothing is generated, registered or started. Only the selected manifest or JSON document is snapshotted; an explicit MCP target performs HTTPS discovery without credentials.</p></details>
    </>}
    <details className="publish-format evidence-disclosure"><summary>Preparing a new skill</summary><p>Start with an <a href="https://agentskills.io/specification">Agent Skill (open standard)</a> folder and an ARCADE manifest, or generate listings from MCP and OpenAPI. The format is separate from the execution engine.</p><p>Give the listing a clear description, define what input it accepts, and set its price before starting the runner.</p></details>
    </div>
  </main>
}

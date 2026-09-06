// Owned native fixture: actual Chat/useChat/Confirm/runner, no real wallet/funds/model.
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { privateKeyToAccount } from "viem/accounts"
import { Chat } from "../../src/components/chat.tsx"
import type { StoredMessage } from "../../src/lib/history.ts"
import { KEY } from "../../src/lib/job-store.ts"

const root = createRoot(document.getElementById("root")!)
const account = privateKeyToAccount(`0x${"01".repeat(32)}`) // PUBLIC offline fixture, never fund.
const methods: string[] = [], signatures: string[] = []
const listeners = new Map<string, Set<() => void>>()
let revision = 0, messages: ReadonlyArray<StoredMessage> = [], initial: ReadonlyArray<StoredMessage> = []
let chain = "0x4cef52", holdSignature = false, release: (() => void) | undefined
const hub = document.documentElement.dataset.hub!
const ethereum = {
  on(event: string, handler: () => void) { const set = listeners.get(event) ?? new Set(); set.add(handler); listeners.set(event, set) },
  removeListener(event: string, handler: () => void) { listeners.get(event)?.delete(handler) },
  async request({ method, params }: { method: string; params?: ReadonlyArray<unknown> }): Promise<unknown> {
    methods.push(method)
    if (method === "eth_chainId") return chain
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [account.address]
    if (method !== "eth_signTypedData_v4") throw Error("Unexpected offline fixture RPC")
    if (holdSignature) await new Promise<void>(resolve => { release = resolve })
    const signature = await account.signTypedData(JSON.parse(params?.[1] as string))
    signatures.push(signature); return signature
  }
}
Object.defineProperty(window, "ethereum", { value: ethereum })
const changed = (next: ReadonlyArray<StoredMessage>) => { messages = next }
const render = () => flushSync(() => root.render(<StrictMode><main style={{ maxWidth: 900, margin: "auto", padding: 16 }}>
  <h1>Owned chat purchase fixture</h1><p>Offline wallet · simulated receipts · no chain payment</p>
  <Chat key={revision} id={"fixture_" + revision} initial={initial} chatLive hubUrl={hub} onChanged={changed} />
</main></StrictMode>))
const fixture = {
  async reset(mode = "normal", rail = "eip3009") {
    const response = await fetch("/fixture-control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, rail }) })
    if (!response.ok) throw Error("Fixture control failed")
    revision++; initial = []; messages = []; methods.length = 0; chain = "0x4cef52"; holdSignature = mode === "hold-signature"; release = undefined
    render()
  },
  restore() { revision++; initial = JSON.parse(JSON.stringify(messages)); render() },
  repaint: render,
  unmount: () => flushSync(() => root.render(null)),
  release: () => { release?.(); release = undefined },
  changeChain() { chain = "0x1"; for (const f of listeners.get("chainChanged") ?? []) f() },
  read() {
    const jobs = JSON.parse(localStorage.getItem(KEY) ?? "[]") as { token: string }[]
    const transcript = JSON.stringify(messages), dom = document.documentElement.outerHTML
    return { methods: [...methods], signatureCount: signatures.length, storedJobs: jobs.length,
      privateInTranscript: signatures.some(s => transcript.includes(s)) || jobs.some(j => transcript.includes(j.token)) || transcript.includes("PRIVATE_PAID_RESULT"),
      capabilityInDom: signatures.some(s => dom.includes(s)) || jobs.some(j => dom.includes(j.token)),
      toolStates: messages.flatMap(m => m.parts.flatMap(p => p !== null && typeof p === "object" && "state" in p ? [p.state] : [])),
      width: innerWidth, documentWidth: document.documentElement.scrollWidth, listenerCount: [...listeners.values()].reduce((n, s) => n + s.size, 0) }
  }
}
Object.defineProperty(window, "__chatFixture", { value: Object.freeze(fixture) })
render()

// Owned DOM fixture: the actual component, public terms, counters, no wallet or payment.
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { Confirm, type ConfirmProps } from "../../src/components/confirm.tsx"

const root = createRoot(document.getElementById("root")!)
let approved = 0, denied = 0, revision = 0
let props: ConfirmProps
const base = (): ConfirmProps => ({ skillId: "diff-triage", price: "$0.01", payTo: `0x${"3".repeat(40)}`,
  network: "eip155:5042002", ensName: "diff-triage.seller.arcade.eth",
  onApprove: () => { approved++; render() }, onDeny: () => { denied++; render() } })
const render = () => flushSync(() => root.render(<StrictMode><main style={{ maxWidth: 600, padding: 24, margin: "auto" }}>
  <h1>Owned confirmation fixture</h1><Confirm key={revision} {...props} />
  <output aria-label="Fixture counters">approved {approved}; denied {denied}</output>
</main></StrictMode>))
const fixture = Object.freeze({
  reset: () => { approved = 0; denied = 0; revision++; props = base(); render() },
  change: (next: Partial<ConfirmProps>) => { props = { ...props, ...next }; render() },
  unmount: () => flushSync(() => root.render(null)),
  read: () => ({ approved, denied, progress: document.querySelector<HTMLElement>("button.approve")?.style.getPropertyValue("--p"),
    active: document.activeElement?.getAttribute("class"), width: innerWidth, documentWidth: document.documentElement.scrollWidth })
})
Object.defineProperty(window, "__confirmFixture", { value: fixture })
fixture.reset()

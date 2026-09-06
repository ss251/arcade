// Explicit synthetic storage/HTTP fixture; no actual purchase, wallet or model.
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { Buyer } from "../../src/components/buyer.tsx"
import { KEY } from "../../src/lib/job-store.ts"

const root = createRoot(document.getElementById("root")!)
const hub = document.documentElement.dataset.hub!, token = "b".repeat(32)
const saved = ["diff-triage", "flow-check"].map((skillId, i) => ({ jobId: "job_" + String(i + 4).repeat(32),
  skillId, token, priceAtomic: "10000", createdAtMs: Date.now() - i * 60000, hubOrigin: hub, realm: "ordinary" }))
const get = Storage.prototype.getItem, set = Storage.prototype.setItem, remove = Storage.prototype.removeItem
let blockedRead = false, blockedWrite = false, walletCalls = 0, revision = 0, blockedWrites = 0
Storage.prototype.getItem = function(key) { if (blockedRead && key === KEY) throw Error("Fixture storage unavailable"); return get.call(this, key) }
Storage.prototype.setItem = function(key, value) { if (blockedWrite && key === KEY) { blockedWrites++; throw Error("Fixture write unavailable") }; return set.call(this, key, value) }
Storage.prototype.removeItem = function(key) { if (blockedWrite && key === KEY) { blockedWrites++; throw Error("Fixture remove unavailable") }; return remove.call(this, key) }
Object.defineProperty(window, "ethereum", { value: { request() { walletCalls++; throw Error("No fixture wallet authority") } } })
const render = () => flushSync(() => root.render(<StrictMode><Buyer key={revision} /></StrictMode>))
Object.defineProperty(window, "__buyerFixture", { value: Object.freeze({
  reset(mode = "ready") {
    blockedRead = false; blockedWrite = false
    localStorage.setItem(KEY, mode === "invalid" ? "INVALID_FIXTURE_DATA" : JSON.stringify(mode === "empty" ? [] : saved))
    localStorage.setItem("unrelated.fixture", "preserve")
    blockedRead = mode === "unavailable"; revision++; render()
  },
  failWrites(value: boolean) { blockedWrite = value },
  storageChanged() { dispatchEvent(new StorageEvent("storage", { key: KEY })) },
  unmount() { flushSync(() => root.render(null)) },
  read() {
    return { walletCalls, blockedWrites, count: (() => { try { return JSON.parse(get.call(localStorage, KEY) ?? "[]").length } catch { return null } })(),
      capabilityInDom: document.documentElement.outerHTML.includes(token), width: innerWidth,
      documentWidth: document.documentElement.scrollWidth, unrelatedPreserved: get.call(localStorage, "unrelated.fixture") === "preserve" }
  }
}) })
// The initial mount is passive. Seeding happens only through the explicit fixture control.
render()

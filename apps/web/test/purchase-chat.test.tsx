import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Chat } from "../src/components/chat.tsx"
afterEach(() => vi.unstubAllGlobals())
describe("actual Chat SSR and restored purchase records", () => {
  it.each(["normal_call", "constructor", "toString", "__proto__"])("never confuses the restored ID %s with a private view", toolCallId => {
    const io = vi.fn(() => { throw Error("SSR must not perform browser IO") })
    vi.stubGlobal("fetch", io)
    vi.stubGlobal("ethereum", { request: io })
    const html = renderToStaticMarkup(<Chat chatLive hubUrl="https://hub.example" onChanged={io}
      initial={[{ id: "fixture_assistant", role: "assistant", parts: [{
        type: "tool-arcade_call_skill", toolCallId, state: "output-available",
        input: { skillId: "diff-triage", maxAmountUsd: "$0.02", input: "{}" },
        approval: { id: "fixture_approval", approved: true },
        output: { awaitingSignature: true, toolCallId, skillId: "diff-triage", result: "UNVERIFIED_OUTPUT" }
      }] }]} />)
    expect(html).toContain("unverified transcript"); expect(html).not.toContain("UNVERIFIED_OUTPUT")
    expect(html).not.toContain("Hold to approve"); expect(io).not.toHaveBeenCalled()
  })
})

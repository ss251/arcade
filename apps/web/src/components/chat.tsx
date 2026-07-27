import { useState } from "react"
import { useChat } from "@ai-sdk/react"
import { MessageScroller } from "@shadcn/react/message-scroller"

/**
 * The buying agent's chat surface.
 *
 * Motion is decided by design-sauce Law 4's frequency test, whose dominant branch here is
 * "don't". Streaming text chunks arrive many times per second, so they get NO animation —
 * not a subtle one. Message arrival happens tens of times a day, so it gets opacity only,
 * 200ms, strong ease-out, reusing the `arrive` keyframe already defined in
 * `apps/hub/src/ui.ts:233` rather than inventing a second one. Nothing animates layout, and
 * no motion is stacked on `MessageScroller`, which already owns scroll anchoring and
 * auto-follow — animating a component that owns the behaviour is how you get fighting
 * scroll positions.
 *
 * Provenance (Law 3) is the layout's organising idea, same as the settlement page. The
 * model's prose is sans because it is a claim. Prices, hashes, addresses and latencies are
 * mono because they were measured. Seller-written copy arrives fenced from the tool layer
 * and is rendered as a QUOTED block — the fence scaffolding itself is stripped, because it
 * is addressed to the model and would be noise to a reader, but the fact that a stranger
 * wrote it is exactly what the block communicates.
 */

// ── message parts ───────────────────────────────────────────────────────────

/** Strip the fence wrapper for human display. The markers are addressed to the model. */
const unfence = (text: string): { body: string; quoted: boolean } => {
  const m = /<<<UNTRUSTED:[0-9a-f]+>>>\n?([\s\S]*?)\n?<<<\/UNTRUSTED:[0-9a-f]+>>>/.exec(text)
  return m === null ? { body: text, quoted: false } : { body: m[1] ?? "", quoted: true }
}

const ToolMarker = ({ name, state }: { name: string; state: string }) => (
  <div className="marker" role="status">
    <span className="marker-name">{name.replace(/^arcade_/, "")}</span>
    <span className="marker-state">{state === "output-available" ? "done" : "running"}</span>
  </div>
)

/**
 * Seller-written text, shown as a quotation rather than as the page's own voice.
 *
 * This does NOT take a semantic colour. Blue means USDC, green means settled, red means
 * not settled (Law 2); spending a fourth on "untrusted" would erode the three that carry
 * money meaning. It earns its separation from a rule and a label instead.
 */
const Quoted = ({ children }: { children: string }) => (
  <blockquote className="quoted">
    <span className="quoted-label">written by the seller</span>
    {children}
  </blockquote>
)

const TextPart = ({ text }: { text: string }) => {
  const { body, quoted } = unfence(text)
  return quoted ? <Quoted>{body}</Quoted> : <p className="prose">{body}</p>
}

// ── the chat ────────────────────────────────────────────────────────────────

export const Chat = () => {
  const { messages, sendMessage, status, error } = useChat()
  const [input, setInput] = useState("")

  const busy = status === "submitted" || status === "streaming"

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (text === "" || busy) return
    setInput("")
    void sendMessage({ text })
  }

  return (
    <div className="chat">
      <MessageScroller.Provider autoScroll>
        <MessageScroller.Root className="scroller">
          <MessageScroller.Viewport className="viewport" aria-label="Conversation">
            <MessageScroller.Content className="thread">
              {messages.length === 0 ? <Empty /> : null}
              {messages.map((m) => (
                <MessageScroller.Item key={m.id} messageId={m.id}>
                  <article className={`msg msg-${m.role}`}>
                    <span className="who">{m.role === "user" ? "you" : "arcade"}</span>
                    <div className="body">
                      {m.parts.map((part, i) => {
                        if (part.type === "text") {
                          return <TextPart key={i} text={part.text} />
                        }
                        if (part.type.startsWith("tool-")) {
                          const p = part as { type: string; state?: string }
                          return (
                            <ToolMarker
                              key={i}
                              name={p.type.slice("tool-".length)}
                              state={p.state ?? ""}
                            />
                          )
                        }
                        return null
                      })}
                    </div>
                  </article>
                </MessageScroller.Item>
              ))}
            </MessageScroller.Content>
          </MessageScroller.Viewport>
          <MessageScroller.Button className="to-latest" direction="end">
            latest
          </MessageScroller.Button>
        </MessageScroller.Root>
      </MessageScroller.Provider>

      {error !== undefined ? (
        <p className="chat-error" role="alert">
          {error.message}
        </p>
      ) : null}

      <form className="composer" onSubmit={submit}>
        <input
          className="prompt"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What do you need bought?"
          aria-label="Message"
          autoComplete="off"
        />
        <button className="send" type="submit" disabled={busy || input.trim() === ""}>
          {busy ? "…" : "send"}
        </button>
      </form>
    </div>
  )
}

/**
 * The empty state is the product's law plus one real action (Law 9) — not a tour. The
 * suggestions are real prompts, and the sentence states what is free, because "does this
 * cost me anything to look" is the first question a visitor actually has.
 */
const Empty = () => (
  <div className="empty-state">
    <p className="law">
      Ask for what you need. Listing, describing and quoting are <b>free</b> and sign
      nothing. A purchase is signed by your own wallet, in your browser.
    </p>
    <p className="note">try: “what’s for sale?” · “what would a flow check cost?”</p>
  </div>
)

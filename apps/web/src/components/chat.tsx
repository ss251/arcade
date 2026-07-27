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

/**
 * Prices, rendered from the TOOL'S OUTPUT rather than from the model's sentence about it.
 *
 * The figure exists twice on every turn: once in `part.output`, computed by the hub and
 * already formatted, and once in whatever the model chose to say about it. Rendering the
 * second is what made the model's arithmetic load-bearing — a small model writing "about
 * half a cent" for $0.0005 would be uncatchable, because the trustworthy copy was thrown
 * away one layer earlier. Rendering the first makes the model's rounding cosmetic.
 *
 * It also restores `ui.ts`'s law on this surface. Mono is what was MEASURED, sans is what
 * was CLAIMED — the settlement page has kept that distinction in every row it has rendered,
 * and a chat that prints every figure inside a sentence collapses it, putting hub-computed
 * numbers in the claimed voice. Here the typography does the arguing: the price is mono and
 * carries the USDC colour because the hub computed it; the prose around it stays sans.
 *
 * Scoped to listings and quotes, where a price is the whole point. Receipts are deliberately
 * NOT mirrored here — they already live on the hub page, and a second home for them would be
 * the second copy this codebase keeps deleting.
 */
const Listings = ({ skills }: { skills: ReadonlyArray<{ id: string; price: string }> }) => (
  <div className="tool-out">
    {skills.map((s) => (
      <div className="tool-row" key={s.id}>
        <span className="tool-id">{s.id}</span>
        <span className="usdc">{s.price}</span>
      </div>
    ))}
  </div>
)

const Quote = ({ skillId, price }: { skillId: string; price: string }) => (
  <div className="tool-out">
    <div className="tool-row">
      <span className="tool-id">{skillId}</span>
      <span className="usdc">{price}</span>
    </div>
    <p className="tool-note">quoted from the endpoint’s own payment challenge · signs nothing</p>
  </div>
)

/** Read the structured half, defensively — a shape we do not recognise renders nothing. */
const ToolOutput = ({ name, output }: { name: string; output: unknown }) => {
  if (output === null || typeof output !== "object") return null
  const o = output as Record<string, unknown>

  if (name === "arcade_list_skills" && Array.isArray(o["skills"])) {
    const skills = (o["skills"] as ReadonlyArray<Record<string, unknown>>)
      .filter((s) => typeof s["id"] === "string" && typeof s["price"] === "string")
      .map((s) => ({ id: s["id"] as string, price: s["price"] as string }))
    return skills.length === 0 ? null : <Listings skills={skills} />
  }

  if (name === "arcade_quote" && typeof o["price"] === "string" && typeof o["skillId"] === "string") {
    return <Quote skillId={o["skillId"] as string} price={o["price"] as string} />
  }

  return null
}

const TextPart = ({ text }: { text: string }) => {
  const { body, quoted } = unfence(text)
  return quoted ? <Quoted>{body}</Quoted> : <p className="prose">{body}</p>
}

// ── the thread ──────────────────────────────────────────────────────────────

/**
 * Rendering is a pure function of the transcript, deliberately separated from `useChat`.
 *
 * Transport and presentation are different failure modes and only one of them can be
 * checked cheaply: given `UIMessage[]` this renders to static markup with no DOM, no
 * hooks and no network, so `@shadcn/helpers`' scripted conversations can drive the real
 * render path in a plain node test. What that does NOT cover is streaming, scroll
 * anchoring and re-entry, which need a live DOM — worth stating, because "we tested the
 * chat" is a sentence that would later be read as covering both.
 */
export const Thread = ({ messages }: { messages: ReadonlyArray<UIMessageLike> }) => (
  <>
    {messages.map((m) => (
      <MessageScroller.Item key={m.id} messageId={m.id}>
        <article className={`msg msg-${m.role}`}>
          <span className="who">{m.role === "user" ? "you" : "arcade"}</span>
          <div className="body">
            {m.parts.map((part, i) => {
              if (part.type === "text") {
                return <TextPart key={i} text={part.text ?? ""} />
              }
              if (part.type.startsWith("tool-")) {
                const name = part.type.slice("tool-".length)
                return (
                  <div key={i}>
                    <ToolMarker name={name} state={part.state ?? ""} />
                    <ToolOutput name={name} output={part.output} />
                  </div>
                )
              }
              return null
            })}
          </div>
        </article>
      </MessageScroller.Item>
    ))}
  </>
)

/** The subset of `UIMessage` this renders. Structural, so scripted fixtures satisfy it. */
export interface UIMessageLike {
  readonly id: string
  readonly role: string
  readonly parts: ReadonlyArray<{
    readonly type: string
    readonly text?: string | undefined
    readonly state?: string | undefined
    /** The tool's structured result. THE authoritative copy of every figure. */
    readonly output?: unknown
  }>
}

// ── the chat ────────────────────────────────────────────────────────────────

export interface ChatProps {
  /** Whether this deployment can actually answer. Derived server-side, never assumed. */
  readonly chatLive: boolean
  readonly hubUrl: string
}

export const Chat = ({ chatLive, hubUrl }: ChatProps) => {
  const { messages, sendMessage, status, error } = useChat()
  const [input, setInput] = useState("")

  const busy = status === "submitted" || status === "streaming"

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (text === "" || busy || !chatLive) return
    setInput("")
    void sendMessage({ text })
  }

  return (
    <div className="chat">
      <MessageScroller.Provider autoScroll>
        <MessageScroller.Root className="scroller">
          <MessageScroller.Viewport className="viewport" aria-label="Conversation">
            <MessageScroller.Content className="thread">
              {messages.length === 0 ? <Empty chatLive={chatLive} hubUrl={hubUrl} /> : null}
              <Thread messages={messages as ReadonlyArray<UIMessageLike>} />
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
          placeholder={chatLive ? "What do you need bought?" : "The chat is not live on this deployment"}
          aria-label="Message"
          autoComplete="off"
          disabled={!chatLive}
        />
        <button className="send" type="submit" disabled={!chatLive || busy || input.trim() === ""}>
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
export const Empty = ({ chatLive, hubUrl }: ChatProps) =>
  chatLive ? (
    <div className="empty-state">
      <p className="law">
        Ask for what you need. Listing, describing and quoting are <b>free</b> and sign
        nothing. A purchase is signed by your own wallet, in your browser.
      </p>
      <p className="note">try: “what’s for sale?” · “what would a flow check cost?”</p>
    </div>
  ) : (
    // No key on this deployment, so do not invite what the server has already declined to
    // do. Say what is true and send the visitor somewhere that works — the settlement page
    // is the artifact worth reaching, and it is live.
    <div className="empty-state">
      <p className="law">
        The chat is <b>not live</b> on this deployment. The marketplace it reads from is:
        every listing, price and settled receipt is on the{" "}
        <a href={hubUrl} target="_blank" rel="noreferrer">
          hub
        </a>
        , and each receipt links to its transaction on Arc.
      </p>
      <p className="note">
        Listing, describing and quoting are free and sign nothing. A purchase is signed by
        your own wallet, in your browser — ARCADE never holds funds.
      </p>
    </div>
  )

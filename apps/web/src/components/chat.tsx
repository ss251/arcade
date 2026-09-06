import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useChat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai"
import { MessageScroller } from "@shadcn/react/message-scroller"
import { Streamdown } from "streamdown"
import { COMMANDS, matchCommands, parseCommand, type Command } from "../lib/commands.ts"
import type { StoredMessage } from "../lib/history.ts"
import { ArchivedPurchase, LivePurchaseView, PendingPurchase, type PurchaseDecision } from "./purchase.tsx"
import { capturePurchasePart, createPurchaseConversation } from "../lib/purchase-conversation.ts"
import type { PurchaseView } from "../lib/purchase-run.ts"

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

/**
 * What each tool is doing, in the product's words rather than its function name.
 *
 * The identifier stays on screen because it is the machine's own name for the act and this
 * page's provenance law puts machine truth in mono. The gloss is what makes the row legible
 * to someone who has never read this codebase — which is every judge and every visitor.
 */
const DOING: Record<string, string> = {
  list_skills: "reading the catalogue",
  describe_skill: "reading the listing",
  quote: "asking the endpoint its price",
  receipts: "reading the settlement feed",
  budget: "checking the spending limit",
  call_skill: "preparing a purchase"
}

/**
 * A tool call as a status row.
 *
 * `output-error` used to fall through to "running", so a tool that FAILED sat on screen
 * claiming to still be working — the same shape as every other bug this repo has found: a
 * signal that cannot be told apart from a different outcome. The three states are now
 * distinct, and the failed one says so.
 *
 * Motion follows Law 4's frequency test. Tool calls happen several times per message, so the
 * running state gets one low-amplitude opacity pulse on a 2px dot and nothing else — no
 * spinner, no layout movement, and it stops the moment the state resolves. `prefers-reduced-
 * motion` drops the pulse and keeps the dot, which is the state, not the decoration.
 */
const ToolMarker = ({ name, state }: { name: string; state: string }) => {
  const short = name.replace(/^arcade_/, "")
  const done = state === "output-available"
  const failed = state === "output-error"
  return (
    <div className={`marker${done ? " is-done" : failed ? " is-failed" : " is-running"}`} role="status">
      <span className="marker-dot" aria-hidden="true" />
      <span className="marker-name">{short}</span>
      <span className="marker-doing">{DOING[short] ?? ""}</span>
      <span className="marker-state">{failed ? "failed" : done ? "done" : "running"}</span>
    </div>
  )
}

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

/**
 * The model's prose is markdown; a stranger's text is not. That asymmetry is deliberate.
 *
 * The model emits markdown — headings, lists, emphasis, fenced code — and rendering it as
 * plain text put the raw syntax on screen. `Streamdown` is the renderer behind shadcn's AI
 * `Response` component, and the reason it beats a plain markdown library here is `remend`:
 * it repairs INCOMPLETE markdown mid-stream, so a half-written `**bold` or an unterminated
 * code fence renders as intended text rather than flashing its own syntax on every token.
 * A chat that strobes asterisks while streaming is the visible cost of not having this.
 *
 * Its Tailwind classes are inert in this app — there is no Tailwind here — which is the
 * useful outcome, not a compromise: it yields clean semantic HTML that `styles.css` dresses
 * with the same tokens as every other surface, so the chat cannot drift from the hub's
 * design system the way an imported component library would make it.
 *
 * **Seller-authored text stays literal.** It arrives fenced because a stranger wrote it, and
 * markdown is a presentation grammar: rendering it would hand that stranger control of links,
 * images and emphasis on our surface — a listing could render an anchor reading "settled on
 * Arc" pointing anywhere. Fencing exists to stop the MODEL from obeying seller text; showing
 * it verbatim is the same argument aimed at the human. The quoted block is the one place on
 * this page where raw characters are the correct output.
 */
const TextPart = ({ text }: { text: string }) => {
  const { body, quoted } = unfence(text)
  if (quoted) return <Quoted>{body}</Quoted>
  return (
    <div className="prose">
      <Streamdown parseIncompleteMarkdown controls={false}>
        {body}
      </Streamdown>
    </div>
  )
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
export const Thread = ({
  messages,
  renderPurchase
}: {
  messages: ReadonlyArray<UIMessageLike>
  /** Only the live Chat supplies an owner-backed renderer. Default is wholly passive. */
  renderPurchase?: (part: UIMessageLike["parts"][number]) => ReactNode
}) => {
  /*
   * The newest USER turn is the scroll anchor.
   *
   * `MessageScrollerItem`'s `scrollAnchor` defaults to false, so every item rendered
   * `data-scroll-anchor="false"` and `autoScroll` had nothing to follow — the transcript
   * grew off the bottom of the viewport and never moved. `autoScroll` was set the whole
   * time, which is why this looked like a broken library rather than a missing prop: the
   * feature was enabled and inert.
   *
   * Anchoring the last user message rather than the last message is the deliberate part.
   * It pins the question near the top and lets the answer stream downward beneath it —
   * what `scrollPreviousItemPeek` exists for — so a long reply reads from its beginning
   * instead of dragging the reader along by the final line.
   */
  const anchorId = [...messages].reverse().find((m) => m.role === "user")?.id
  return (
  <>
    {messages.map((m) => (
      <MessageScroller.Item key={m.id} messageId={m.id} scrollAnchor={m.id === anchorId}>
        <article className={`msg msg-${m.role}`}>
          <span className="who">{m.role === "user" ? "you" : "arcade"}</span>
          <div className="body">
            {m.parts.map((part, i) => {
              if (part.type === "text") {
                return <TextPart key={i} text={part.text ?? ""} />
              }
              if (part.type.startsWith("tool-")) {
                const name = part.type.slice("tool-".length)

                if (name === "arcade_call_skill") {
                  return <div key={i}>{m.role === "assistant" && renderPurchase
                    ? renderPurchase(part) : <ArchivedPurchase />}</div>
                }
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
}

/** The subset of `UIMessage` this renders. Structural, so scripted fixtures satisfy it. */
export interface UIMessageLike {
  readonly id: string
  readonly role: string
  readonly parts: ReadonlyArray<{
    readonly type: string
    readonly text?: string | undefined
    readonly state?: string | undefined
    readonly toolCallId?: string | undefined
    /** Structured tool claims, not private payment authority or verified settlement. */
    readonly output?: unknown
    /** Original arguments include actual input, skill and price ceiling. */
    readonly input?: unknown
    /** SDK retains approval on output states too. Flags alone cannot authorize payment. */
    readonly approval?: { readonly id: string; readonly approved?: boolean | undefined }
  }>
}

// ── the chat ────────────────────────────────────────────────────────────────

export interface ChatProps {
  /** Whether this deployment can actually answer. Derived server-side, never assumed. */
  readonly chatLive: boolean
  readonly hubUrl: string
  /** Identity of this conversation. Switching it REMOUNTS the chat — see `index.tsx`. */
  readonly id?: string | undefined
  readonly initial?: ReadonlyArray<StoredMessage> | undefined
  /** Called with the settled transcript, for the caller to persist. */
  readonly onChanged?: ((messages: ReadonlyArray<StoredMessage>) => void) | undefined
}

export const Chat = ({ chatLive, hubUrl, id, initial, onChanged }: ChatProps) => {
  // Spread rather than assigned: `exactOptionalPropertyTypes` distinguishes an absent
  // property from one explicitly set to undefined, and `ChatInit` accepts only the former.
  const { messages, sendMessage, status, error, addToolApprovalResponse } = useChat({
    ...(id === undefined ? {} : { id }),
    ...(initial === undefined ? {} : { messages: initial as never }),
    /*
     * Answering an approval records it LOCALLY. Without this the decision never travels:
     * the card vanished, the transcript said "approved", and the tool was never executed —
     * a purchase that reported consent and did nothing, which is the most expensive version
     * of this repo's recurring bug, because the visitor believes they bought something.
     *
     * `lastAssistantMessageIsCompleteWithApprovalResponses` fires exactly when every
     * pending approval on the last assistant message has an answer, so a turn holding two
     * requests waits for both rather than resuming half-decided.
     */
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses
  })
  type Owner = ReturnType<typeof createPurchaseConversation>
  const ownerRef = useRef<{ id: string | undefined; owner: Owner } | undefined>(undefined)
  const [owner, setOwner] = useState<Owner>()
  const [purchaseViews, setPurchaseViews] = useState<Record<string, Readonly<PurchaseView>>>({})
  const latest = useRef({ messages, addToolApprovalResponse })
  latest.current = { messages, addToolApprovalResponse }
  // Setup/cleanup/setup under StrictMode leaves one live owner, never a restored permit.
  useEffect(() => {
    const next = createPurchaseConversation(initial ?? [], (key, view) => {
      if (ownerRef.current?.owner === next) setPurchaseViews(old => ({ ...old, [key]: view }))
    })
    ownerRef.current = { id, owner: next }; setOwner(next); setPurchaseViews({})
    return () => { next.close(); if (ownerRef.current?.owner === next) ownerRef.current = undefined }
  }, [id])
  useEffect(() => {
    const active = ownerRef.current
    if (!active || active.id !== id) return
    for (const message of messages) if (message.role === "assistant") {
      for (const part of message.parts) void active.owner.receive(part)
    }
  }, [messages, id])
  useEffect(() => { if (error !== undefined) ownerRef.current?.owner.cancelPending() }, [error])
  const decide = useCallback<PurchaseDecision>((part, approved, context, wallet) => {
    const active = ownerRef.current, captured = capturePurchasePart(part)
    if (!active || active.id !== id || !captured || !latest.current.messages.some(m => m.role === "assistant" &&
      m.parts.some(p => {
        const current = capturePurchasePart(p)
        return current?.state === "approval-requested" && JSON.stringify(current.binding) === JSON.stringify(captured.binding)
      }))) return false
    if (!(approved ? active.owner.approve(part, context, wallet) : active.owner.deny(part))) return false
    const key = captured.binding.toolCallId
    setPurchaseViews(old => ({ ...old, [key]: { phase: approved ? "checking" : "refused", message: approved
      ? "Confirmation recorded. Waiting for tool validation."
      : "Purchase declined in this conversation. No new authorization was requested by this decision." } }))
    try {
      void Promise.resolve(latest.current.addToolApprovalResponse({ id: captured.binding.approvalId, approved }))
        .catch(() => active.owner.discard(key))
    } catch { active.owner.discard(key); return false }
    return true
  }, [id])
  const [input, setInput] = useState("")
  // Which row the arrow keys are on. Reset whenever the candidate list changes.
  const [cursor, setCursor] = useState(0)

  const busy = status === "submitted" || status === "streaming"
  const candidates = matchCommands(input)
  const open = candidates.length > 0

  // Persist after every settled change. Streaming writes would rewrite the row on every
  // token for no benefit — the transcript is only worth storing once it has stopped moving.
  useEffect(() => {
    if (busy) return
    onChanged?.(messages as ReadonlyArray<StoredMessage>)
  }, [messages, busy, onChanged])

  useEffect(() => setCursor(0), [input])

  const send = (text: string) => {
    const trimmed = text.trim()
    if (trimmed === "" || busy || !chatLive) return
    setInput("")
    // A command becomes the English it stands for, then travels the ordinary path. See
    // `lib/commands.ts` for why there is no second route to the tools.
    const parsed = parseCommand(trimmed)
    void sendMessage({ text: parsed === undefined ? trimmed : parsed.command.expand(parsed.arg) })
  }

  const complete = (c: Command) => {
    // Commands taking an argument complete to `/name ` and wait; the rest are ready to send.
    setInput(c.arg === undefined ? `/${c.name}` : `/${c.name} `)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setCursor((i) => (i + 1) % candidates.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setCursor((i) => (i - 1 + candidates.length) % candidates.length)
    } else if (e.key === "Tab" || (e.key === "Enter" && candidates.length > 0)) {
      const picked = candidates[cursor]
      if (picked === undefined) return
      // Enter on a complete, argument-less command sends it. Otherwise completing is the
      // more useful default — Enter should never fire `/buy` with no skill named.
      if (e.key === "Enter" && picked.arg === undefined && input === `/${picked.name}`) return
      e.preventDefault()
      complete(picked)
    } else if (e.key === "Escape") {
      e.preventDefault()
      setInput("")
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    send(input)
  }

  return (
    <div className="chat">
      {/*
        `last-anchor` so REOPENING a stored conversation lands on the final exchange from
        its start, rather than at the very bottom of a long reply with no idea what was
        asked. Same reasoning as the anchor choice itself.
      */}
      <MessageScroller.Provider autoScroll defaultScrollPosition="last-anchor">
        <MessageScroller.Root className="scroller">
          <MessageScroller.Viewport className="viewport" aria-label="Conversation">
            <MessageScroller.Content className="thread">
              {messages.length === 0 ? <Empty chatLive={chatLive} hubUrl={hubUrl} /> : null}
              <Thread
                messages={messages as ReadonlyArray<UIMessageLike>}
                renderPurchase={part => {
                  const captured = capturePurchasePart(part), key = part.toolCallId
                  // A malformed/replaced SDK part still gets its private progress,
                  // but prototype names can never be mistaken for stored views.
                  const view = key === undefined || !Object.hasOwn(purchaseViews, key) ? undefined : purchaseViews[key]
                  if (view) return <LivePurchaseView view={view} />
                  if (owner && ownerRef.current?.owner === owner && ownerRef.current.id === id && owner.canConfirm(part)) {
                    return <PendingPurchase key={JSON.stringify(captured?.binding)} part={part} onDecision={decide} />
                  }
                  return <ArchivedPurchase />
                }}
              />
            </MessageScroller.Content>
          </MessageScroller.Viewport>
          <MessageScroller.Button className="to-latest" direction="end">
            latest
          </MessageScroller.Button>
        </MessageScroller.Root>
      </MessageScroller.Provider>

      {error !== undefined ? (
        <p className="chat-error" role="alert">
          The chat request did not complete. Check any pending purchase before retrying.
        </p>
      ) : null}

      <form className="composer" onSubmit={submit}>
        {/*
          The command menu. Present only while a leading slash is being typed, which is the
          entire reason it can sit above the composer without being chrome the rest of the
          time — Law 10, minimal at rest.
        */}
        {open ? (
          <ul className="slash" role="listbox" aria-label="Commands">
            {candidates.map((c, i) => (
              <li key={c.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  className={`slash-row${i === cursor ? " is-on" : ""}`}
                  // `onMouseDown` rather than `onClick`: the input must not blur first, or
                  // the menu unmounts before the click lands.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    complete(c)
                  }}
                  onMouseEnter={() => setCursor(i)}
                >
                  <span className="slash-name">
                    /{c.name}
                    {c.arg === undefined ? "" : ` ${c.arg}`}
                  </span>
                  <span className="slash-hint">{c.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          className="prompt"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            chatLive ? "What do you need bought?  ( / for commands )" : "The chat is not live on this deployment"
          }
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
      {/*
        The empty state teaches the one mechanic worth knowing, with the real commands
        rather than a description of them — Law 9's "empty state plus one real action".
      */}
      <ul className="empty-cmds">
        {COMMANDS.map((c) => (
          <li key={c.name}>
            <span className="slash-name">
              /{c.name}
              {c.arg === undefined ? "" : ` ${c.arg}`}
            </span>
            <span className="slash-hint">{c.hint}</span>
          </li>
        ))}
      </ul>
      <p className="note">or just ask — type / for commands</p>
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

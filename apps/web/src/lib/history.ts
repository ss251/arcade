/**
 * Past conversations, stored in the visitor's browser and nowhere else.
 *
 * ## Why localStorage is the right answer here, not the lazy one
 *
 * A server-side history would be a new place this product holds something. ARCADE's whole
 * argument is that it custodies nothing — not funds, not keys, not seller code — and a
 * conversation transcript is not a small exception to that: it records what a buyer went
 * looking for, what they were quoted and what they decided not to buy. That is commercially
 * sensitive in exactly the way `docs/threat-model.md`'s T-PRIV entries are about, and the
 * receipts feed is already carefully "evidence that payment happened, not a record of who
 * bought what".
 *
 * Keeping transcripts in the browser means the honest sentence — "your conversations never
 * leave this browser" — needs no infrastructure to be true. The cost is real and worth
 * naming: history does not follow you to another device, and clearing site data loses it.
 * For a marketplace where the wallet is already per-browser, that is the same boundary the
 * money lives on rather than a new one.
 *
 * ## Failures are silent by design
 *
 * Private-mode Safari throws on `setItem`, and storage can be full or disabled. None of that
 * should break a conversation in progress, so every operation degrades to "no history" and
 * the chat keeps working. A sidebar that vanishes is a missing convenience; a chat that
 * throws mid-purchase is a broken product.
 */

const KEY = "arcade.conversations.v1"
const MAX = 40

export interface StoredMessage {
  readonly id: string
  readonly role: string
  readonly parts: ReadonlyArray<unknown>
}

export interface Conversation {
  readonly id: string
  /** First line of the opening user message. Derived on write, so the list needs no parsing. */
  readonly title: string
  readonly updatedAtMs: number
  readonly messages: ReadonlyArray<StoredMessage>
}

const read = (): ReadonlyArray<Conversation> => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as ReadonlyArray<Conversation>) : []
  } catch {
    return []
  }
}

const write = (rows: ReadonlyArray<Conversation>): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX)))
  } catch {
    /* Storage unavailable or full. History is a convenience; the chat is not. */
  }
}

/** The first user message, trimmed to something that fits a sidebar row. */
export const titleOf = (messages: ReadonlyArray<StoredMessage>): string => {
  const first = messages.find((m) => m.role === "user")
  if (first === undefined) return "new conversation"
  const text = first.parts
    .map((p) => (p as { type?: string; text?: string }))
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join(" ")
    .trim()
  if (text === "") return "new conversation"
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

export const list = (): ReadonlyArray<Conversation> =>
  [...read()].sort((a, b) => b.updatedAtMs - a.updatedAtMs)

export const get = (id: string): Conversation | undefined =>
  read().find((c) => c.id === id)

/**
 * Save, or delete when a conversation has become empty.
 *
 * An empty conversation is a row that says nothing and restores to nothing, so "new chat"
 * pressed twice would leave a trail of blanks. Writing nothing is the correct save for it.
 */
export const save = (id: string, messages: ReadonlyArray<StoredMessage>): void => {
  const rest = read().filter((c) => c.id !== id)
  if (messages.length === 0) {
    write(rest)
    return
  }
  write([
    { id, title: titleOf(messages), updatedAtMs: Date.now(), messages },
    ...rest
  ])
}

export const remove = (id: string): void => write(read().filter((c) => c.id !== id))

/** Coarse and unitless on purpose — an exact timestamp is noise in a sidebar row. */
export const ago = (ms: number, now: number = Date.now()): string => {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d === 1 ? "yesterday" : `${d}d ago`
}

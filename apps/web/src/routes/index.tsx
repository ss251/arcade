import { useEffect, useState, useCallback } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { Chat } from "~/components/chat.tsx"
import { Sidebar } from "~/components/sidebar.tsx"
import * as history from "~/lib/history.ts"
import { DEFAULT_HUB } from "~/preflight.ts"
import { DEFAULT_MODEL, parseModel } from "~/lib/model.ts"

/**
 * What this deployment can actually do, read on the server.
 *
 * `createServerFn` rather than reading `process.env` in the loader: TanStack Start's
 * loaders run on the server AND the client, so a loader reading `ANTHROPIC_API_KEY` would
 * report the chat live during SSR and dead the moment the page hydrated — the flag would
 * flip under the visitor.
 *
 * The page derives its invitation from this instead of asserting one. Without a key,
 * `/api/chat` returns a 503, and a page that still says "Ask for what you need" and prints
 * two suggested prompts is promising something the server has already declined to do. An
 * empty catalogue is the discovery guarantee working and reads as such; a chat that answers
 * every message with an error just reads as broken.
 */
const siteFacts = createServerFn({ method: "GET" }).handler(() => ({
  chatLive: (() => {
    const c = parseModel(process.env["ARCADE_MODEL"] ?? DEFAULT_MODEL)
    return c !== null && (process.env[c.keyVar] ?? "") !== ""
  })(),
  hubUrl: process.env["ARCADE_HUB"] ?? DEFAULT_HUB
}))

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => await siteFacts()
})

/**
 * The conversation list, and the id of the one on screen.
 *
 * ## Reading storage in an effect, not during render
 *
 * `localStorage` does not exist during SSR, and this page is server-rendered. Reading it in
 * an effect means the first paint is the empty-history one on both sides, so hydration
 * matches; the list arrives a frame later. Reading it in a `useState` initialiser would
 * throw on the server, and guarding that with `typeof window` would produce markup the
 * client then contradicts — a hydration mismatch, which React resolves by silently
 * re-rendering and which shows up as a flicker nobody can reproduce on demand.
 *
 * ## Switching conversations REMOUNTS the chat
 *
 * `useChat` seeds itself from `messages` at construction, so handing it a new array does not
 * reload a conversation. The `key` does: React discards the old component and builds a new
 * one around the stored transcript. This is the supported way to do it, and the reason
 * `currentId` lives here rather than inside `Chat`.
 */
const newId = (): string => `c_${Math.random().toString(36).slice(2, 10)}`

function Home() {
  const { chatLive, hubUrl } = Route.useLoaderData()
  const [conversations, setConversations] = useState<ReadonlyArray<history.Conversation>>([])
  const [currentId, setCurrentId] = useState(newId)
  const [initial, setInitial] = useState<ReadonlyArray<history.StoredMessage> | undefined>(undefined)
  const [sideOpen, setSideOpen] = useState(false)

  useEffect(() => setConversations(history.list()), [])

  const persist = useCallback(
    (messages: ReadonlyArray<history.StoredMessage>) => {
      history.save(currentId, messages)
      setConversations(history.list())
    },
    [currentId]
  )

  const openConversation = (id: string) => {
    const c = history.get(id)
    if (c === undefined) return
    setInitial(c.messages)
    setCurrentId(id)
  }

  const startNew = () => {
    setInitial(undefined)
    setCurrentId(newId())
  }

  const deleteConversation = (id: string) => {
    history.remove(id)
    setConversations(history.list())
    if (id === currentId) startNew()
  }

  return (
    <div className={`shell${sideOpen ? " side-open" : ""}`}>
      <Sidebar
        conversations={conversations}
        currentId={currentId}
        onOpen={openConversation}
        onNew={startNew}
        onDelete={deleteConversation}
        open={sideOpen}
        onToggle={() => setSideOpen((v) => !v)}
      />
      <main className="wrap">
        <header className="top">
          <span className="mark">ARCADE</span>
          <span className="meta">
            {/*
              The settlement page is the artifact the whole pitch rests on, and it lives on a
              different host. A visitor who lands here must have a way to reach it — the
              recorded decision is that the hub's origin is canonical and the chat links out
              to it, never the reverse.
            */}
            <a href={hubUrl} target="_blank" rel="noreferrer">
              settlement receipts ↗
            </a>
            <br />
            your wallet, your signature
          </span>
        </header>
        <Chat
          key={currentId}
          id={currentId}
          initial={initial}
          onChanged={persist}
          chatLive={chatLive}
          hubUrl={hubUrl}
        />
      </main>
    </div>
  )
}

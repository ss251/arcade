import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { Chat } from "~/components/chat.tsx"
import { DEFAULT_HUB } from "~/preflight.ts"

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
  chatLive: (process.env["ANTHROPIC_API_KEY"] ?? "") !== "",
  hubUrl: process.env["ARCADE_HUB"] ?? DEFAULT_HUB
}))

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => await siteFacts()
})

function Home() {
  const { chatLive, hubUrl } = Route.useLoaderData()
  return (
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
      <Chat chatLive={chatLive} hubUrl={hubUrl} />
    </main>
  )
}

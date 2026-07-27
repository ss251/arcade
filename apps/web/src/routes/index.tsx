import { createFileRoute } from "@tanstack/react-router"
import { Chat } from "~/components/chat.tsx"

export const Route = createFileRoute("/")({
  component: Home
})

function Home() {
  return (
    <main className="wrap">
      <header className="top">
        <span className="mark">ARCADE</span>
        <span className="meta">
          buy a skill
          <br />
          your wallet, your signature
        </span>
      </header>
      <Chat />
    </main>
  )
}

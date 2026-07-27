import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: Home
})

function Home() {
  return (
    <main className="wrap">
      <header className="top">
        <span className="mark">ARCADE</span>
      </header>
      <p className="law">Scaffold up.</p>
    </main>
  )
}

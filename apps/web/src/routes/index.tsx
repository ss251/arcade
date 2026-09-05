import { createFileRoute } from "@tanstack/react-router"
import { Nav } from "~/components/nav.tsx"

export const Route = createFileRoute("/")({ component: Market })

// H6 supplies the marketplace; this increment only establishes its route shell.
function Market() {
  return <main className="wrap"><Nav here="market" /></main>
}

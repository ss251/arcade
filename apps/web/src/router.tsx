import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

/**
 * The router entry. Start calls `getRouter()` on this module by name — exporting it under
 * any other name fails at request time with `getRouter is not a function`, not at build.
 */
export const getRouter = () =>
  createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultNotFoundComponent: () => (
      <main className="wrap">
        <header className="top">
          <span className="mark">ARCADE</span>
        </header>
        <p className="law">No such page.</p>
      </main>
    )
  })

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

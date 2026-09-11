import { createRouter } from "@tanstack/react-router"
import { RouteState } from "./components/route-state.tsx"
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
    defaultPendingMs: 250,
    defaultPendingComponent: () => <RouteState kind="loading" />,
    defaultErrorComponent: () => <RouteState kind="error" />,
    defaultNotFoundComponent: () => <RouteState kind="missing" />
  })

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

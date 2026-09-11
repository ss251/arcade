import { useRouterState } from "@tanstack/react-router"
import { Nav, type NavHere } from "./nav.tsx"

/** Read-only route recovery: never render exception text, and never retry a payment. */
export function RouteState({ kind }: { kind: "loading" | "error" | "missing" }) {
  const { pathname: path, searchStr } = useRouterState({ select: state => state.location })
  const retryPath = (() => {
    if (!/^\/(?![\/\\])/.test(path) || /[\\?#\u0000-\u0020\u007f]/.test(path)) return "/"
    const query = typeof searchStr === "string" && /^\?[^#\\\u0000-\u001f\u007f]*$/.test(searchStr) ? searchStr : ""
    try {
      const target = new URL(path + query, "https://arcade.invalid")
      return target.origin === "https://arcade.invalid" && /^\/(?![\/\\])/.test(target.pathname) ? target.pathname + target.search : "/"
    } catch { return "/" }
  })()
  const here: NavHere = path === "/chat" ? "chat" : path === "/buyer" ? "buyer" : path === "/publish" ? "publish" : path === "/seller" ? "seller" : "market"
  const title = kind === "missing" ? "Let's find the right place." : kind === "error" ? "Let's try that again." : here === "seller" ? "Opening your studio…" : here === "chat" ? "Opening your assistant…" : "Getting things ready…"
  return <main className="wrap route-state"><Nav here={here} /><section className="page-heading" aria-live="polite" aria-busy={kind === "loading"}>
    <h1>{title}</h1><p className="page-description">{kind === "missing" ? "We couldn't find that page. Explore the marketplace to find a skill for your next job." : kind === "error" ? "This page couldn't load. Try again, or return to the marketplace. Open My jobs to check your saved results." : "We're loading the latest information."}</p>
    {kind === "loading" ? <div className="loading-placeholder" aria-hidden="true"><i /><i /><i /></div> : <div className="page-actions">{kind === "error" ? <a className="button-primary" href={retryPath}>Try again</a> : null}<a className={kind === "missing" ? "button-primary" : "button-secondary"} href="/">Explore skills</a><a className="button-secondary" href="/buyer">My jobs</a></div>}
  </section></main>
}

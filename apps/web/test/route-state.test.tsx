import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { RouteState } from "../src/components/route-state.tsx"
const state = vi.hoisted(() => ({ pathname: "/seller", searchStr: "" }))
vi.mock("@tanstack/react-router", () => ({ useRouterState: ({ select }: { select: (value: unknown) => unknown }) => select({ location: state }) }))
describe("route recovery", () => {
  beforeEach(() => { state.pathname = "/seller"; state.searchStr = "" })
  it.each([
    ["/seller", "?address=0x1111111111111111111111111111111111111111"],
    ["/chat", "?skill=diff-triage&draft=%7B%22diff%22%3A%22a%26b%22%7D"]
  ])("preserves encoded read context while retrying %s", (pathname, searchStr) => {
    state.pathname = pathname; state.searchStr = searchStr
    const html = renderToStaticMarkup(<RouteState kind="error" />)
    expect(html).toContain(`href="${(pathname + searchStr).replaceAll("&", "&amp;")}">Try again`)
  })
  it.each(["//outside.example/path", "?x=y#fragment", "?x=\\outside.example", "?x=\nsecret"])("drops malformed search %s without widening navigation", searchStr => {
    state.pathname = "/buyer"; state.searchStr = searchStr
    expect(renderToStaticMarkup(<RouteState kind="error" />)).toContain('href="/buyer">Try again')
  })
  it("keeps orientation and an honest loading state without interactive placeholders", () => {
    state.pathname = "/seller"
    const html = renderToStaticMarkup(<RouteState kind="loading" />)
    expect(html).toContain("Opening your studio")
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('aria-current="page"')
    expect(html).not.toContain("Try again")
    expect(html).toContain('class="loading-placeholder" aria-hidden="true"')
  })
  it("offers read-only navigation after an error without exposing exception data", () => {
    state.pathname = "/skill/diff-triage"
    const html = renderToStaticMarkup(<RouteState kind="error" />)
    expect(html).toContain('href="/skill/diff-triage">Try again')
    expect(html).toContain('href="/buyer">My jobs')
    expect(html).not.toContain("<form")
  })
  it.each(["//external.example", "/\\external.example", "/\n/external.example", "/buyer\\path", "https://external.example", "/.//external.example", "/%2e//external.example"])("never makes an unsafe retry link from %s", pathname => {
    state.pathname = pathname
    const html = renderToStaticMarkup(<RouteState kind="error" />)
    expect(html).toContain('href="/">Try again')
  })
  it("makes the marketplace the next action for an unknown route", () => {
    state.pathname = "/unknown"
    const html = renderToStaticMarkup(<RouteState kind="missing" />)
    expect(html).toContain('class="button-primary" href="/">Explore skills')
    expect(html).not.toContain("Try again")
  })
})

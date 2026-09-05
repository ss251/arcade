import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Nav, type NavHere } from "../src/components/nav.tsx"

const destinations = [["market", "/"], ["chat", "/chat"], ["seller", "/seller"], ["buyer", "/buyer"], ["publish", "/publish"]] as const
describe("H5 navigation and preserved chat route", () => {
  it.each(destinations)("marks only %s as the current section and lists each destination once", (here, current) => {
    const html = renderToStaticMarkup(<Nav here={here as NavHere} />)
    const nav = /<nav\b[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1]
    expect(nav).toBeDefined()
    const anchors = [...nav!.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    expect(anchors).toHaveLength(5)
    for (const [, path] of destinations) expect(anchors.filter(a => a[1]!.includes(`href="${path}"`))).toHaveLength(1)
    const selected = anchors.filter(a => a[1]!.includes('aria-current="page"'))
    expect(selected).toHaveLength(1); expect(selected[0]![1]).toContain(`href="${current}"`)
    expect(html).toContain('aria-label="Sections"')
    expect(anchors.every(a => !a[1]!.includes("tabindex=\"-1\""))).toBe(true)
  })
  it("keeps the home wordmark separate from the five-item navigation", () => {
    const html = renderToStaticMarkup(<Nav here="chat" />)
    const outside = html.replace(/<nav\b[\s\S]*?<\/nav>/, "")
    expect(outside).toMatch(/<a\b[^>]*href="\/"[^>]*aria-label="ARCADE home"[^>]*>ARCADE<\/a>/)
    expect(html).not.toContain("<button"); expect(html).not.toContain("<script")
  })
  it("preserves the original chat loader, history, sidebar and Chat wiring byte-for-byte outside route/header edits", () => {
    const source = readFileSync(new URL("../src/routes/chat.tsx", import.meta.url), "utf8")
      .replace('import { Nav } from "~/components/nav.tsx"\n', "")
      .replace('createFileRoute("/chat")', 'createFileRoute("/")')
    const prefix = source.slice(0, source.indexOf('        <Nav here="chat" />'))
    const suffix = source.slice(source.indexOf('        <Chat\n'))
    const hash = (s: string) => createHash("sha256").update(s).digest("hex")
    expect(hash(prefix)).toBe("66b76c2afa62492d128759da4d528ad8246369b733f65e8e7a1b5ff63827dfc9")
    expect(hash(suffix)).toBe("33ecbcca7ce4e49bf6aa0868402a07fe88c7f1025c8351c02a12ba407f9fb1d1")
  })
  it("gives nav links a visible neutral focus state without spending settlement or money colors", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(css).toMatch(/\.nav a:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ink\)/)
    expect(css).toMatch(/\.nav nav\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(css).toMatch(/\.shell > \.wrap\s*\{[^}]*padding-left:\s*max\(70px,/)
  })
})

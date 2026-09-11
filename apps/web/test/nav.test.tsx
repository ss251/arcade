import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Nav, type NavHere } from "../src/components/nav.tsx"

const destinations = [["market", "/"], ["chat", "/chat"], ["seller", "/seller"], ["buyer", "/buyer"]] as const
describe("H5 navigation and preserved chat route", () => {
  it.each(destinations)("marks only %s as the current section and lists each destination once", (here, current) => {
    const html = renderToStaticMarkup(<Nav here={here as NavHere} />)
    const nav = /<nav\b[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1]
    expect(nav).toBeDefined()
    const anchors = [...nav!.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    expect(anchors).toHaveLength(4)
    for (const [, path] of destinations) expect(anchors.filter(a => a[1]!.includes(`href="${path}"`))).toHaveLength(1)
    const selected = anchors.filter(a => a[1]!.includes('aria-current="page"'))
    expect(selected).toHaveLength(1); expect(selected[0]![1]).toContain(`href="${current}"`)
    expect(html).toContain('aria-label="Sections"')
    expect(anchors.every(a => !a[1]!.includes("tabindex=\"-1\""))).toBe(true)
  })
  it("groups publishing within Seller studio while preserving a working parent link", () => {
    const html = renderToStaticMarkup(<Nav here="publish" />)
    expect(html).toContain('href="/seller" class="nav-item is-here" aria-current="location"')
    expect(html).toContain("Seller studio")
    expect(html).not.toContain('href="/publish"')
  })
  it("keeps the home wordmark separate from the four-section product navigation", () => {
    const html = renderToStaticMarkup(<Nav here="chat" />)
    const outside = html.replace(/<nav\b[\s\S]*?<\/nav>/, "")
    expect(outside).toMatch(/<a\b[^>]*href="\/"[^>]*aria-label="ARCADE home"[^>]*><span class="arcade-wordmark"[\s\S]*?<\/span><span class="visually-hidden">ARCADE<\/span><\/a>/)
    expect(html).not.toContain("<button"); expect(html).not.toContain("<script")
  })
  it("pins the reviewed chat route and history composition", () => {
    const source = readFileSync(new URL("../src/routes/chat.tsx", import.meta.url), "utf8")
      .replace('import { Nav } from "~/components/nav.tsx"\n', "")
      .replace('createFileRoute("/chat")', 'createFileRoute("/")')
    const prefix = source.slice(0, source.indexOf('        <Nav here="chat" />'))
    const suffix = source.slice(source.indexOf('        <Chat\n'))
    const hash = (s: string) => createHash("sha256").update(s).digest("hex")
    // Re-pinned 2026-09-09 for the journey overhaul: bounded skill-context search,
    // sidebar moved into the toolbar, and selectedSkill plus a one-shot input draft passed as editable context.
    // Existing history callbacks remain; browser proof checks no automatic send/pay.
    expect(hash(prefix)).toBe("0351d29f39179c30b77969e32cf5e1373aef8205a3dc9bbdef9ce78c4403a789")
    expect(hash(suffix)).toBe("c000134c9b92e1803deee35f7605388d8d620fe7ab0b67499234d0d6e5abb127")
  })
  it("gives nav links a visible neutral focus state without spending settlement or money colors", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
    expect(css).toMatch(/:where\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible\s*\{[^}]*outline:\s*1\.5px solid var\(--focus-ring\)/)
    expect(css).toMatch(/\.nav nav\s*\{[^}]*flex-wrap:\s*wrap/)
    // Enlarged text must not force the chat viewport underneath the sticky navigation.
    expect(css).toMatch(/\.chat-wrap\s*\{[^}]*height:\s*100dvh;[^}]*min-height:\s*min\(36rem,\s*100dvh\)/)
  })
})

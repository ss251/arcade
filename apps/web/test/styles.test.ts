import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * The stylesheet parses. Cheap, and it has already earned its place.
 *
 * A single missing `}` does not fail the build, the typechecker, or any of the other 477
 * tests — CSS has no compiler here. What it does is make one rule swallow everything that
 * follows it, so the page renders with most of its design silently absent: max-width gone,
 * the composer unstyled, buttons reduced to full-width grey bars. It looks like a broken
 * app and reads like a broken app, and nothing in the repo says a word about it.
 *
 * That happened while DELETING a block: the edit removed the rules and took the closing
 * brace of `.viewport` with them, and `.thread` onward became part of `.viewport`. The only
 * thing that caught it was a human looking at the screen — which is Law 11 working, but it
 * is not a gate, and the next person to delete a CSS block will not have someone watching.
 *
 * Braces inside comments are stripped first, because this file's comments discuss CSS.
 */

const CSS = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, "")

describe("styles.css is structurally sound", () => {
  it("has balanced braces", () => {
    const open = (withoutComments.match(/\{/g) ?? []).length
    const close = (withoutComments.match(/\}/g) ?? []).length
    expect(
      close,
      `unbalanced braces: ${open} "{" vs ${close} "}" — one missing brace makes a rule ` +
        "swallow the rest of the file, and every other check in this repo stays green"
    ).toBe(open)
  })

  it("never nests a bare rule inside another, which is what an unclosed brace looks like", () => {
    // Walk the depth. Top-level at-rules (@media, @supports, @keyframes) legitimately reach
    // depth 2; anything deeper in this flat stylesheet means a brace was left open.
    let depth = 0
    let max = 0
    for (const ch of withoutComments) {
      if (ch === "{") max = Math.max(max, ++depth)
      else if (ch === "}") depth--
      expect(depth, "a closing brace with nothing open — the file is malformed").toBeGreaterThanOrEqual(0)
    }
    expect(depth, "the file ends with an unclosed rule").toBe(0)
    expect(max, "nesting deeper than an at-rule block means an unclosed brace").toBeLessThanOrEqual(2)
  })

  it("keeps the scrollbar native — styling it opts macOS out of overlay scrollbars", () => {
    // The regression: `scrollbar-width` / `scrollbar-color` / `::-webkit-scrollbar` all
    // switch Chrome to a CLASSIC scrollbar that permanently reserves its gutter. The CSS
    // written to stop a bar being always-visible is what made one always-visible.
    expect(withoutComments).not.toMatch(/scrollbar-width\s*:/)
    expect(withoutComments).not.toMatch(/scrollbar-color\s*:/)
    expect(withoutComments).not.toMatch(/::-webkit-scrollbar/)
  })
})

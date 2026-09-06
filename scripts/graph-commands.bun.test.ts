import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const root = new URL("../", import.meta.url)
const expected = {
  "subgraph:splitters": "bun --no-env-file scripts/graph-splitters.ts",
  "subgraph:manifest": "bun --no-env-file run --cwd subgraph manifest",
  "subgraph:build": "bun --no-env-file run --cwd subgraph build",
  "subgraph:deploy": "bun --no-env-file scripts/graph-deploy.ts",
} as const

describe("G6 explicit operator commands", () => {
  for (const [name, command] of Object.entries(expected)) {
    test(`no-dotenv ${name} uses the bounded local command`, () => {
      const manifest: { scripts: Record<string, string> } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"))
      expect(manifest.scripts[name]).toBe(command)
    })
  }
})

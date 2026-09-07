import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

type Element = { id: string; type: string; x: number; y: number; width: number; height: number; text?: string; containerId?: string; boundElements: { id: string }[] }
function scene(seed: string, dark = false): Element[] {
  return JSON.parse(execFileSync("python3", ["-c", "import runpy,json; d=runpy.run_path('scripts/diagram.py'); print(json.dumps(d['build']()))", ...(dark ? ["--dark"] : [])], {
    cwd: resolve(import.meta.dir, ".."), encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PYTHONHASHSEED: seed, PYTHONDONTWRITEBYTECODE: "1" }
  })) as Element[]
}

test("diagram seeds and geometry are identical across independent Python hash seeds", () => {
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
  expect(hash(scene("1"))).toBe(hash(scene("2")))
})
test("light and dark scenes share every label, coordinate and binding", () => {
  const geometry = (elements: Element[]) => elements.map(({ id, type, x, y, width, height, text, containerId, boundElements }) => ({ id, type, x, y, width, height, text, containerId, boundElements }))
  expect(geometry(scene("1"))).toEqual(geometry(scene("2", true)))
})
test("all container labels fit and every binding is bidirectional", () => {
  const elements = scene("1")
  expect(new Set(elements.map(e => e.id)).size).toBe(elements.length)
  for (const label of elements.filter(e => e.containerId)) {
    const parent = elements.find(e => e.id === label.containerId)!
    expect(parent.boundElements.map(e => e.id)).toContain(label.id)
    if (parent.type === "rectangle") {
      expect(label.width).toBeLessThanOrEqual(parent.width - 16)
      expect(label.height).toBeLessThanOrEqual(parent.height - 12)
    }
  }
})
test("diagram labels retain live limits and avoid the inherited universal refund claim", () => {
  const text = scene("1").map(e => e.text ?? "").join("\n")
  for (const limit of ["offline only", "deployment blocked", "re-point pending", "NOT RUN", "Unknown settlement is not a refund", "does not reverse paid children"]) expect(text).toContain(limit)
  expect(text).not.toContain("That is the refund")
})
test("checked-in scenes and Mermaid companion are derived from the current generator", () => {
  for (const dark of [false, true]) {
    const saved = JSON.parse(readFileSync(resolve(import.meta.dir, `../docs/architecture${dark ? "-dark" : ""}.excalidraw`), "utf8"))
    expect(saved.elements).toEqual(scene("3", dark))
  }
  const mermaid = execFileSync("python3", ["-c", "import runpy; d=runpy.run_path('scripts/diagram.py'); print(d['mermaid_source'](),end='')"], {
    cwd: resolve(import.meta.dir, ".."), encoding: "utf8", timeout: 5000, maxBuffer: 65536,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PYTHONDONTWRITEBYTECODE: "1" }
  })
  expect(readFileSync(resolve(import.meta.dir, "../docs/architecture.mmd"), "utf8")).toBe(mermaid)
  expect(mermaid).toContain('n_graph["')
  expect(mermaid).not.toMatch(/^  graph\[/m)
})
test("bound labels are centered on negative-direction arrows", () => {
  const elements = scene("1")
  const arrow = elements.find(e => e.id === "f1")!
  const label = elements.find(e => e.containerId === "f1")!
  expect(label.x + label.width / 2).toBe(arrow.x - arrow.width / 2)
})

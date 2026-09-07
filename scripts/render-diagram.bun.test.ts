import { expect, test } from "bun:test"
import { readFileSync, readdirSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { execFileSync } from "node:child_process"
import { renderInputs, startDiagramRenderer, validateRender, type RenderInput } from "./render-diagram.ts"

const inputs: RenderInput[] = ["architecture", "architecture-dark", "architecture-flow", "escrow-flow", "delegate-flow"].map(name => ({ name, kind: "mermaid", source: "graph LR\n A-->B" }))
// Deliberately only an IHDR transport fixture, NOT a valid decoded image.
const header = () => {
  const png = Buffer.alloc(33)
  Buffer.from("89504e470d0a1a0a", "hex").copy(png)
  png.write("IHDR", 12); png.writeUInt32BE(2000, 16); png.writeUInt32BE(1000, 20)
  return { svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', png: "data:image/png;base64," + png.toString("base64") }
}
test("bounded transport checks reject wrong shapes, headers and dimensions", () => {
  expect(validateRender(header()).width).toBe(2000)
  for (const value of [null, [], {}, { ...header(), extra: true }, { ...header(), svg: "not svg" }, { ...header(), png: "data:image/png;base64,YQ==" }]) expect(() => validateRender(value)).toThrow()
  const bad = Buffer.from(header().png.split(",")[1]!, "base64"); bad.writeUInt32BE(99999, 20)
  expect(() => validateRender({ ...header(), png: "data:image/png;base64," + bad.toString("base64") })).toThrow("render_dimensions_invalid")
})
test("owned page refuses cross-origin/missing-token writes, traversal and replacement", async () => {
  const renderer = startDiagramRenderer('<html><head><base href="https://gstack-render.localhost/"></head><body><script>const fake="</body>";</script></body></html>', inputs, 5000)
  try {
    const page = await fetch(renderer.url), html = await page.text()
    expect(page.headers.get("content-security-policy")).toContain("connect-src 'self'")
    expect(html).not.toContain('base href="https://')
    expect(html).toContain('<script>const fake="</body>";</script><section')
    const token = html.match(/'x-render-token':'([a-f0-9]+)'/)![1]!
    const headers = { origin: renderer.url, "x-render-token": token, "content-type": "application/json" }
    expect(await (await fetch(renderer.url + "/inputs")).json()).toEqual(inputs)
    expect((await fetch(renderer.url + "/result/architecture", { method: "POST", body: JSON.stringify(header()) })).status).toBe(403)
    expect((await fetch(renderer.url + "/result/architecture", { method: "POST", headers: { ...headers, origin: "https://example.invalid" }, body: JSON.stringify(header()) })).status).toBe(403)
    expect((await fetch(renderer.url + "/result/unknown", { method: "POST", headers, body: JSON.stringify(header()) })).status).toBe(409)
    expect((await fetch(renderer.url + "/result/%2e%2e%2fescape", { method: "POST", headers, body: JSON.stringify(header()) })).status).toBe(409)
    expect(readdirSync(renderer.out)).toEqual([])
    expect((await fetch(renderer.url + "/result/architecture", { method: "POST", headers, body: JSON.stringify(header()) })).status).toBe(200)
    const before = readFileSync(join(renderer.out, "architecture.png"))
    expect((await fetch(renderer.url + "/result/architecture", { method: "POST", headers, body: JSON.stringify(header()) })).status).toBe(409)
    expect(readFileSync(join(renderer.out, "architecture.png"))).toEqual(before)
    expect((await fetch(renderer.url + "/finish", { method: "POST", headers })).status).toBe(200)
    expect(JSON.parse(readFileSync(join(renderer.out, "manifest.json"), "utf8")).complete).toBe(false)
  } finally { renderer.stop(); rmSync(renderer.out, { recursive: true, force: true }) }
})
test("checked-in inputs include both palettes, overview and two actual J12 flows", () => {
  const actual = renderInputs(resolve(import.meta.dir, ".."))
  expect(actual.map(i => i.name)).toEqual(inputs.map(i => i.name))
  expect(actual[3]!.source).toContain("Retain journal and reconcile")
  expect(actual[4]!.source).toContain("Separate owner-approved per-chain delegate grant")
})
test("invalid session inputs and unbounded deadlines refuse before allocation", () => {
  expect(() => startDiagramRenderer("", inputs.slice(1))).toThrow("render_inputs_invalid")
  expect(() => startDiagramRenderer("", inputs, 0)).toThrow("render_deadline_invalid")
  expect(() => startDiagramRenderer("", inputs, 600001)).toThrow("render_deadline_invalid")
})
test("native import is inert without a browser or shell PATH", () => {
  expect(execFileSync(process.execPath, ["--no-env-file", "-e", `await import(${JSON.stringify(resolve(import.meta.dir, "render-diagram.ts"))})`], { encoding: "utf8", timeout: 2000, env: { PATH: "" } })).toBe("")
})

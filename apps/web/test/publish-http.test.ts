import { expect, it, vi } from "vitest"
import { readPublishBytes, fetchPublishPreview } from "../src/lib/publish-http.ts"
import { handlePublishRequest } from "../src/lib/publish-route.server.ts"
import { PublishFailed, parsePreview } from "../src/lib/publish-preview.ts"
import { createPublishPreview } from "../../../packages/runner/src/publish-preview.ts"
import { SkillManifest } from "../../../packages/core/src/manifest.ts"
import { Schema } from "effect"
import { readFileSync } from "node:fs"

const manifest = Schema.decodeUnknownSync(SkillManifest)(JSON.parse(readFileSync(new URL("../../../skills/diff-triage/arcade.json", import.meta.url), "utf8")))
const raw = createPublishPreview("skills/diff-triage", manifest), doc = parsePreview(JSON.stringify(raw))
const bytes = (text: string) => new TextEncoder().encode(text)
const env = { ARCADE_PUBLISH_LOCAL: "1" }
const req = (body = JSON.stringify({ target: "skills/diff-triage" }), headers: Record<string, string> = {}) =>
  new Request("http://127.0.0.1:3000/api/publish-preview", { method: "POST", body,
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json", ...headers } })

it("bounds stream bytes and copies chunks before a producer can mutate them", async () => {
  const chunk = bytes("hello")
  let producer!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start(c) { producer = c; c.enqueue(chunk) } })
  const read = readPublishBytes(body, new AbortController().signal, 5, 100)
  await Promise.resolve(); chunk.fill(120); producer.close()
  expect(new TextDecoder().decode(await read)).toBe("hello")
  await expect(readPublishBytes(new Response("oversized").body, new AbortController().signal, 3, 100)).rejects.toEqual(new PublishFailed())
})
it("refuses empty-chunk storms and times out an unfinished body without waiting for cancellation", async () => {
  const storm = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array()) } })
  await expect(readPublishBytes(storm, new AbortController().signal, 20, 100)).rejects.toEqual(new PublishFailed())
  const cancel = vi.fn(() => new Promise<void>(() => {}))
  await expect(readPublishBytes(new ReadableStream({ cancel }), new AbortController().signal, 20, 20)).rejects.toEqual(new PublishFailed())
  expect(cancel).toHaveBeenCalledOnce()
})
it("pre-abort refuses before acquiring a reader and late chunks cannot succeed after abort", async () => {
  const controller = new AbortController(); controller.abort()
  const body = new Response("data").body!, get = vi.spyOn(body, "getReader")
  await expect(readPublishBytes(body, controller.signal, 20, 100)).rejects.toEqual(new PublishFailed())
  expect(get).not.toHaveBeenCalled()
  const active = new AbortController(), late = new ReadableStream<Uint8Array>()
  const result = readPublishBytes(late, active.signal, 20, 100)
  active.abort("PRIVATE_REASON")
  await expect(result).rejects.toEqual(new PublishFailed())
})
it("the route refuses authority before reading or invoking the runtime", async () => {
  const run = vi.fn(async () => doc), request = req(), read = vi.spyOn(request.body!, "getReader")
  const response = await handlePublishRequest(request, run, {})
  expect(response.status).toBe(403); expect(read).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled()
  const external = await handlePublishRequest(req(undefined, { origin: "https://external.example" }), run, env)
  expect(external.status).toBe(403); expect(run).not.toHaveBeenCalled()
})
it.each([
  ["{}", {}], ['{"target":"../private"}', {}], ['{"target":"x","extra":1}', {}],
  ["x".repeat(4097), {}], ["{}", { "content-type": "text/plain" }],
  ["{}", { "content-encoding": "gzip" }], ["{}", { "content-length": "1" }],
  ["{}", { "content-length": "+2" }], ["{}", { "content-length": "4097" }]
] as const)("route rejects bounded-input violations with zero runtime calls %#", async (body, headers) => {
  const run = vi.fn(async () => doc), response = await handlePublishRequest(req(body, headers), run, env)
  expect(response.status).toBe(400); expect(run).not.toHaveBeenCalled()
  expect(await response.text()).toBe('{"error":"invalid_preview_request"}')
})
it("returns actual canonical CLI JSON once, no-store, and never raw runtime diagnostics", async () => {
  const run = vi.fn(async (_input: unknown) => doc), request = req(), response = await handlePublishRequest(request, run, env)
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store")
  expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  expect(await response.json()).toEqual(raw)
  expect(run).toHaveBeenCalledOnce(); expect(run.mock.calls[0]?.[0]).toEqual({ target: "skills/diff-triage" })
  const failed = await handlePublishRequest(req(), async () => { throw Error("PRIVATE_RUNTIME_DIAGNOSTIC") }, env)
  expect(failed.status).toBe(502); expect(await failed.text()).toBe('{"error":"preview_failed"}')
})
it("client uses one fixed same-origin POST and validates its exact result target", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(raw))
  expect(await fetchPublishPreview("skills/diff-triage", new AbortController().signal, fetcher)).toEqual(doc)
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/publish-preview")
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "POST", credentials: "omit", redirect: "error",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "skills/diff-triage" }) })
  await expect(fetchPublishPreview("skills/other", new AbortController().signal, fetcher)).rejects.toEqual(new PublishFailed())
})
it("client never retries/refers to raw HTTP errors and cancels a late fetch response after abort", async () => {
  const errors = vi.fn(async () => new Response("PRIVATE_RESPONSE", { status: 500 }))
  await expect(fetchPublishPreview("skills/diff-triage", new AbortController().signal, errors)).rejects.toEqual(new PublishFailed())
  expect(errors).toHaveBeenCalledOnce()
  const controller = new AbortController(), cancel = vi.fn()
  let release!: (response: Response) => void
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve }))
  const result = fetchPublishPreview("skills/diff-triage", controller.signal, fetcher)
  controller.abort("PRIVATE_ABORT")
  await expect(result).rejects.toEqual(new PublishFailed())
  release(new Response(new ReadableStream({ cancel })))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(cancel).toHaveBeenCalledOnce(); expect(fetcher).toHaveBeenCalledOnce()
})

it.each(["length", "type", "oversize", "redirect", "malformed"])("client refuses %s response without retry", async mode => {
  const response = mode === "oversize" ? new Response("x".repeat(1048577), { headers: { "content-type": "application/json" } })
    : mode === "malformed" ? new Response("PRIVATE_NOT_JSON", { headers: { "content-type": "application/json" } }) : Response.json(raw)
  if (mode === "length") response.headers.set("content-length", "2")
  if (mode === "type") response.headers.set("content-type", "text/html")
  if (mode === "redirect") Object.defineProperty(response, "redirected", { value: true })
  const fetcher = vi.fn(async () => response)
  await expect(fetchPublishPreview("skills/diff-triage", new AbortController().signal, fetcher)).rejects.toEqual(new PublishFailed())
  expect(fetcher).toHaveBeenCalledOnce()
})
it("client total deadline refuses an uncooperative fetch and cancels its eventual response", async () => {
  vi.useFakeTimers()
  try {
    let release!: (response: Response) => void
    const cancel = vi.fn(), fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve }))
    const checked = expect(fetchPublishPreview("skills/diff-triage", new AbortController().signal, fetcher)).rejects.toEqual(new PublishFailed())
    await vi.advanceTimersByTimeAsync(42001); await checked
    release(new Response(new ReadableStream({ cancel })))
    await Promise.resolve(); await Promise.resolve()
    expect(cancel).toHaveBeenCalledOnce(); expect(fetcher).toHaveBeenCalledOnce()
  } finally { vi.useRealTimers() }
})
it("aborting an incoming body never reaches the runtime", async () => {
  const controller = new AbortController(), run = vi.fn(async () => doc)
  const request = new Request("http://127.0.0.1:3000/api/publish-preview", Object.assign({ method: "POST",
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json" },
    body: new ReadableStream<Uint8Array>(), signal: controller.signal }, { duplex: "half" }))
  const result = handlePublishRequest(request, run, env); controller.abort()
  expect((await result).status).toBe(400); expect(run).not.toHaveBeenCalled()
})

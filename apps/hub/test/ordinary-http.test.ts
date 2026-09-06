import { describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { readOrdinaryBody, ordinaryReadScope } from "../src/ordinary-http.ts"

const req = (body: BodyInit | null, headers: Record<string, string> = {}, signal?: AbortSignal) => new Request("https://hub.example/x/a/demo", {
  method: "POST", body, headers, ...(signal === undefined ? {} : { signal }), duplex: "half" } as RequestInit)
describe("bounded ordinary body", () => {
  it("preserves legacy text content type and empty input, and exact JSON bytes", async () => {
    expect(await readOrdinaryBody(req(null))).toBe("")
    expect(await readOrdinaryBody(req(' { "x":"é" } '))).toBe(' { "x":"é" } ')
    expect(await readOrdinaryBody(req("x".repeat(131072)))).toHaveLength(131072)
  })
  it.each(["-1", "01", "131073", "1e3", "999999999999999999999999"])("rejects declared length %s before reading", async length => {
    const pull = vi.fn(), stream = new ReadableStream<Uint8Array>({ pull })
    await expect(readOrdinaryBody(req(stream, { "content-length": length }))).rejects.toThrow("Ordinary input invalid")
  })
  it("rejects actual overflow, mismatch and malformed UTF8", async () => {
    for (const request of [req("x".repeat(131073)), req("xx", { "content-length": "1" }), req(new Uint8Array([0xc3]))]) {
      await expect(readOrdinaryBody(request)).rejects.toThrow("Ordinary input invalid")
    }
  })
  it("stops a pending body on abort and never accepts late bytes", async () => {
    const abort = new AbortController(), cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const work = readOrdinaryBody(req(stream, {}, abort.signal)); abort.abort()
    await expect(work).rejects.toThrow("Ordinary input invalid"); expect(cancel).toHaveBeenCalledOnce()
  })
  it("bounds an uncooperative body and clears timeout/listener after refusal", async () => {
    vi.useFakeTimers()
    try {
      const stream = new ReadableStream<Uint8Array>({ cancel: () => new Promise<void>(() => {}) })
      const work = readOrdinaryBody(req(stream)), result = expect(work).rejects.toThrow("Ordinary input invalid")
      await vi.advanceTimersByTimeAsync(5001); await result; expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
  it("refuses a finite run of empty chunks before consuming an arbitrary fast stream", async () => {
    let pulls = 0
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ pull(controller) {
      pulls++
      if (pulls <= 64) controller.enqueue(new Uint8Array())
      else { controller.enqueue(new TextEncoder().encode("{}")); controller.close() }
    }, cancel })
    await expect(readOrdinaryBody(req(stream))).rejects.toThrow("Ordinary input invalid")
    expect(pulls).toBeLessThanOrEqual(34); expect(cancel).toHaveBeenCalledOnce()
  })
})
describe("ordinary retrieval scope", () => {
  it("propagates cancellation to pending Effects and refuses subsequent reads", async () => {
    const abort = new AbortController(), scope = ordinaryReadScope(abort.signal), cleanup = vi.fn()
    try {
      const effect = Effect.async<number>(() => Effect.sync(cleanup))
      const result = scope.read(signal => Effect.runPromise(effect, { signal }))
      abort.abort(); await expect(result).rejects.toThrow("Ordinary read unavailable")
      expect(cleanup).toHaveBeenCalledOnce()
      const later = vi.fn(); await expect(scope.read(later)).rejects.toThrow("Ordinary read unavailable"); expect(later).not.toHaveBeenCalled()
    } finally { scope.close() }
  })
  it("cancels sleep, releases listeners/timers and stops uncooperative reads finitely", async () => {
    vi.useFakeTimers()
    const abort = new AbortController(), scope = ordinaryReadScope(abort.signal)
    try {
      const result = expect(scope.read(() => new Promise<never>(() => {}))).rejects.toThrow("Ordinary read unavailable")
      await vi.advanceTimersByTimeAsync(120001); await result
      expect(vi.getTimerCount()).toBe(0)
    } finally { scope.close(); vi.useRealTimers() }
  })
  it("checks abort after a resolved read before releasing its value", async () => {
    const abort = new AbortController(), scope = ordinaryReadScope(abort.signal)
    try { await expect(scope.read(async () => { abort.abort(); return "PRIVATE" })).rejects.toThrow("Ordinary read unavailable") }
    finally { scope.close() }
  })
  it("removes each completed-read abort waiter before beginning another read", async () => {
    const abort = new AbortController(), scope = ordinaryReadScope(abort.signal)
    let remove: ReturnType<typeof vi.spyOn> | undefined
    try {
      await scope.read(async signal => { remove = vi.spyOn(signal, "removeEventListener"); return 1 })
      expect(remove).toHaveBeenCalledTimes(1)
      for (let i = 0; i < 20; i++) await scope.read(async () => i)
      expect(remove).toHaveBeenCalledTimes(21)
    } finally { scope.close(); remove?.mockRestore() }
  })
  it("interrupts the polling timer and removes the caller listener when closed", async () => {
    vi.useFakeTimers()
    const abort = new AbortController(), remove = vi.spyOn(abort.signal, "removeEventListener"), scope = ordinaryReadScope(abort.signal)
    try {
      const sleep = expect(scope.read(signal => Effect.runPromise(Effect.sleep(300), { signal }))).rejects.toThrow("Ordinary read unavailable")
      scope.close(); await sleep
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function))
      expect(vi.getTimerCount()).toBe(0)
    } finally { scope.close(); vi.useRealTimers() }
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildRequest, findOperation, openapiEngine, parametersOf, resolveRefs, runOpenapi
} from "../src/engines/openapi.ts"
import type { EngineAuth, HarnessJob, SkillAgent } from "../src/engines/types.ts"

type Json = Record<string, unknown>
const spec = {
  openapi: "3.0.3", info: { title: "Private upstream", version: "1" },
  servers: [{ url: "https://private.example.test/v1" }],
  paths: {
    "/rates/{base}": {
      parameters: [{ name: "base", in: "path", required: true, schema: { type: "string" } }],
      get: {
        operationId: "privateRateOperation",
        parameters: [{ name: "symbols", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "ok" } }
      }
    },
    "/notes": {
      post: {
        operationId: "createNote",
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Note" } } } },
        responses: { "200": { description: "ok" } }
      }
    }
  },
  components: { schemas: { Note: { type: "object", required: ["body"], properties: { body: { type: "string" } } } } }
}
const rate = () => findOperation(spec, "privateRateOperation")!
const input = { base: "USD", symbols: "EUR" }
const agent: SkillAgent = { systemPrompt: "" }
const dirs: string[] = []
const scratch = async () => {
  const dir = await mkdtemp(join(tmpdir(), "PRIVATE_OPENAPI_LOCATION_"))
  dirs.push(dir)
  return dir
}
const jobFor = async (over: Partial<HarnessJob> = {}, document: unknown = spec): Promise<HarnessJob> => {
  const dir = await scratch()
  await writeFile(join(dir, "openapi.json"), JSON.stringify(document))
  return {
    jobId: "job-1", input, skillDir: dir, bounds: { timeoutSec: 2 }, outputSchema: { type: "object" },
    engineConfig: { adapter: "openapi", spec: "openapi.json", operationId: "privateRateOperation" },
    ...over
  }
}
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("OpenAPI document helpers", () => {
  it("finds exactly the requested operation and leaves missing IDs absent", () => {
    expect(rate()).toMatchObject({ path: "/rates/{base}", method: "get" })
    expect(findOperation(spec, "createNote")).toMatchObject({ path: "/notes", method: "post" })
    expect(findOperation(spec, "missing")).toBeUndefined()
  })

  it("refuses ambiguous duplicate operation IDs", () => {
    expect(() => findOperation({ ...spec, paths: { "/a": { get: rate().op }, "/b": { get: rate().op } } }, "privateRateOperation"))
      .toThrow(/ambiguous|duplicate/i)
  })

  it("resolves local pointers, including escaped tokens, without fetching remote references", () => {
    expect(resolveRefs(spec, { $ref: "#/components/schemas/Note" })).toEqual(spec.components.schemas.Note)
    expect(resolveRefs({ "a/b": { "~key": { type: "string" } } }, { $ref: "#/a~1b/~0key" })).toEqual({ type: "string" })
    const remote = { $ref: "https://private.example.test/private.json#/schema" }
    expect(resolveRefs(spec, remote)).toEqual(remote)
  })

  it("fails closed on missing/cyclic/over-deep local references and inherited pointer properties", () => {
    expect(() => resolveRefs(spec, { $ref: "#/missing" })).toThrow(/reference/i)
    expect(() => resolveRefs({ loop: { $ref: "#/loop" } }, { $ref: "#/loop" })).toThrow(/reference|depth/i)
    expect(() => resolveRefs({}, { $ref: "#/constructor/prototype" })).toThrow(/reference/i)
    let deep: unknown = { type: "string" }
    for (let i = 0; i < 25; i++) deep = { child: deep }
    expect(() => resolveRefs({}, deep)).toThrow(/depth|limit/i)
  })

  it("copies dangerous-looking own JSON keys without changing prototypes", () => {
    const resolved = resolveRefs({}, JSON.parse('{"__proto__":{"polluted":true}}')) as Json
    expect(Object.hasOwn(resolved, "__proto__")).toBe(true)
    expect(({} as Json)["polluted"]).toBeUndefined()
  })

  it("merges path-item parameters with operation overrides and retains schemas for the generator", () => {
    const document = {
      paths: { "/x": { parameters: [{ name: "limit", in: "query", required: true, schema: { type: "number" } }],
        get: { operationId: "x", parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer" } }] } } }
    }
    expect(parametersOf(document, findOperation(document, "x")!)).toEqual([
      { name: "limit", in: "query", required: false, schema: { type: "integer" } }
    ])
    expect(parametersOf(spec, rate()).map((p) => p.name)).toEqual(["base", "symbols"])
  })
})

describe("buildRequest", () => {
  it("encodes path/query data and disables redirects", () => {
    const request = buildRequest(spec, rate(), { base: "USD/spot", symbols: "EUR & GBP" }, undefined, {})
    expect(request.url).toBe("https://private.example.test/v1/rates/USD%2Fspot?symbols=EUR+%26+GBP")
    expect(request.init).toMatchObject({ method: "GET", redirect: "error" })
    expect(request.init.body).toBeUndefined()
  })

  it("sends unclaimed fields as a JSON object body without prototype mutation", () => {
    const body = JSON.parse('{"body":"hello","__proto__":{"polluted":true}}') as Json
    const request = buildRequest(spec, findOperation(spec, "createNote")!, body, undefined, {})
    expect(JSON.parse(request.init.body as string)).toEqual(body)
    expect(new Headers(request.init.headers).get("content-type")).toBe("application/json")
    expect(({} as Json)["polluted"]).toBeUndefined()
  })

  it.each(["header", "query"] as const)("supplies required %s auth from the seller, never the buyer", (location) => {
    const auth: EngineAuth = { in: location, name: "X-Api-Key", env: "UPSTREAM_KEY" }
    const ref = { ...rate(), op: { ...rate().op, parameters: [
      { name: location === "header" ? "x-api-key" : auth.name, in: location, required: true },
      { name: "symbols", in: "query", required: true }
    ] } }
    const request = buildRequest(spec, ref, input, auth, { UPSTREAM_KEY: "seller-secret" })
    if (location === "header") expect(new Headers(request.init.headers).get("x-api-key")).toBe("seller-secret")
    else expect(new URL(request.url).searchParams.get("X-Api-Key")).toBe("seller-secret")
    const withBuyer = buildRequest(spec, ref, { ...input, "X-Api-Key": "buyer-key", "x-api-key": "buyer-key" }, auth, { UPSTREAM_KEY: "seller-secret" })
    expect(JSON.stringify(withBuyer)).not.toContain("buyer-key")
  })

  it.each([undefined, "", "  "])("refuses missing/empty auth without naming it", (secret) => {
    expect(() => buildRequest(spec, rate(), input, { in: "header", name: "PRIVATE_HEADER", env: "PRIVATE_AUTH_ENV" }, { PRIVATE_AUTH_ENV: secret }))
      .toThrow(/credential/i)
  })

  it("does not read inherited input or credential properties", () => {
    expect(() => buildRequest(spec, rate(), Object.create(input) as Json, undefined, {})).toThrow(/input|parameter/i)
    expect(() => buildRequest(spec, rate(), input, { in: "query", name: "key", env: "UPSTREAM_KEY" }, Object.create({ UPSTREAM_KEY: "inherited" }) as Record<string, string>))
      .toThrow(/credential/i)
  })

  it.each(["http://private.example.test", "https://user:password@private.example.test", "not a URL", "https://private.example.test/{region}"])(
    "refuses unsafe or unsupported servers",
    (url) => expect(() => buildRequest({ ...spec, servers: [{ url }] }, rate(), input, undefined, {})).toThrow(/HTTPS|server|userinfo/i)
  )

  it.each([".", ".."])("refuses a path value that WHATWG URL would normalize", (base) => {
    expect(() => buildRequest(spec, rate(), { ...input, base }, undefined, {})).toThrow(/path/i)
  })

  it("uses operation/path server overrides instead of silently calling the root server", () => {
    const ref = { ...rate(), op: { ...rate().op, servers: [{ url: "https://override.example.test/v2" }] } }
    expect(buildRequest(spec, ref, input, undefined, {}).url).toContain("https://override.example.test/v2/")
  })

  it.each([
    { name: "cookie", in: "cookie" },
    { name: "symbols", in: "query", style: "deepObject" },
    { $ref: "https://private.example.test/parameter.json" }
  ])("refuses unsupported parameter forms instead of silently dropping them", (parameter) => {
    const ref = { ...rate(), op: { ...rate().op, parameters: [parameter] } }
    expect(() => buildRequest(spec, ref, input, undefined, {})).toThrow(/parameter|reference/i)
  })

  it("refuses complex parameter serialization and non-JSON request bodies", () => {
    expect(() => buildRequest(spec, rate(), { ...input, symbols: ["EUR", "GBP"] }, undefined, {})).toThrow(/scalar|parameter/i)
    const ref = { ...findOperation(spec, "createNote")!, op: { requestBody: { content: { "multipart/form-data": {} } } } }
    expect(() => buildRequest(spec, ref, { body: "x" }, undefined, {})).toThrow(/JSON|body/i)
  })

  it("refuses header injection and buyer-controlled routing headers", () => {
    const headerRef = (name: string) => ({ ...rate(), op: { parameters: [{ name, in: "header" }] } })
    expect(() => buildRequest(spec, headerRef("X-Extra"), { base: "USD", "X-Extra": "value\r\nOther: bad" }, undefined, {})).toThrow(/header/i)
    expect(() => buildRequest(spec, headerRef("Host"), { base: "USD", Host: "other.example.test" }, undefined, {})).toThrow(/header/i)
  })
})

describe("runOpenapi", () => {
  it("reads a real local spec and returns JSON on success through the fake fetch", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("error")
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return Response.json({ rates: { EUR: 0.86 } })
    })
    const envelope = await runOpenapi(agent, await jobFor(), "", fetcher)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(envelope).toMatchObject({ stopReason: "end_turn", output: { rates: { EUR: 0.86 } }, usage: { toolCalls: 1 }, costUsd: 0 })
  })

  it("reports HTTP status without exposing the upstream response", async () => {
    const envelope = await runOpenapi(agent, await jobFor(), "", async () => new Response("PRIVATE_RESPONSE_BODY", { status: 503 }))
    expect(envelope.stopReason).toBe("error")
    expect(envelope.output).toBeUndefined()
    expect(envelope.error).toContain("503")
    expect(JSON.stringify(envelope)).not.toMatch(/PRIVATE|private\.example|\/rates\//)
  })

  it("does not wait indefinitely for an error body to acknowledge cancellation", async () => {
    const job = await jobFor()
    const body = new ReadableStream<Uint8Array>({ cancel: () => new Promise<void>(() => {}) })
    const envelope = await runOpenapi(agent, job, "", async () => new Response(body, { status: 503 }))
    expect(envelope.stopReason).toBe("error")
    expect(envelope.error).toContain("503")
  }, 500)

  it.each(["<html>private</html>", "", "null"])("does not settle invalid or empty success JSON", async (body) => {
    const envelope = await runOpenapi(agent, await jobFor(), "", async () => new Response(body))
    expect(envelope.stopReason).toBe("error")
    expect(envelope.output).toBeUndefined()
  })

  it("redacts fetch errors and private operation IDs", async () => {
    const job = await jobFor()
    const envelope = await runOpenapi(agent, job, "", async () => { throw new Error("PRIVATE_SECRET at https://private.example.test/rates/privateRateOperation") })
    expect(envelope.stopReason).toBe("error")
    expect(JSON.stringify(envelope)).not.toMatch(/PRIVATE|private\.example|privateRateOperation/)
    const missing = await runOpenapi(agent, { ...job, engineConfig: { ...job.engineConfig!, operationId: "PRIVATE_OPERATION_ID" } }, "", async () => Response.json({}))
    expect(missing.stopReason).toBe("error")
    expect(JSON.stringify(missing)).not.toContain("PRIVATE_OPERATION_ID")
  })

  it.each(["absolute", "parent", "symlink"])("refuses %s spec escapes without a fetch or path disclosure", async (kind) => {
    const job = await jobFor()
    const outside = await scratch()
    await writeFile(join(outside, "private.json"), JSON.stringify(spec))
    if (kind === "symlink") await symlink(outside, join(job.skillDir, "escape"), "dir")
    const specPath = kind === "absolute" ? join(outside, "private.json") : kind === "parent" ? "../private.json" : "escape/private.json"
    const fetcher = vi.fn(async () => Response.json({}))
    const envelope = await runOpenapi(agent, { ...job, engineConfig: { adapter: "openapi", spec: specPath, operationId: "privateRateOperation" } }, "", fetcher)
    expect(envelope.stopReason).toBe("error")
    expect(fetcher).not.toHaveBeenCalled()
    expect(JSON.stringify(envelope)).not.toMatch(/PRIVATE_OPENAPI_LOCATION|private\.json/)
  })

  it("allows a contained nested spec", async () => {
    const job = await jobFor()
    await mkdir(join(job.skillDir, "nested"))
    await writeFile(join(job.skillDir, "nested", "spec.json"), JSON.stringify(spec))
    const envelope = await runOpenapi(agent, { ...job, engineConfig: { ...job.engineConfig!, spec: "nested/spec.json" } }, "", async () => Response.json({ ok: true }))
    expect(envelope.stopReason).toBe("end_turn")
  })

  it.each(["missing", "bad-json", "bad-shape"])("sanitizes %s spec failures before fetch", async (kind) => {
    const job = await jobFor()
    const name = kind === "missing" ? "PRIVATE_MISSING.json" : "openapi.json"
    if (kind === "bad-json") await writeFile(join(job.skillDir, name), "PRIVATE_DOCUMENT_BYTES")
    if (kind === "bad-shape") await writeFile(join(job.skillDir, name), "null")
    const fetcher = vi.fn(async () => Response.json({}))
    const envelope = await runOpenapi(agent, { ...job, engineConfig: { ...job.engineConfig!, spec: name } }, "", fetcher)
    expect(envelope.stopReason).toBe("error")
    expect(fetcher).not.toHaveBeenCalled()
    expect(JSON.stringify(envelope)).not.toMatch(/PRIVATE_|privateRateOperation/)
  })

  it("aborts a stalled upstream with a timeout outcome", async () => {
    const job = await jobFor({ bounds: { timeoutSec: 0.02 } })
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("PRIVATE_ABORT_DIAGNOSTIC")), { once: true })
    }))
    const envelope = await runOpenapi(agent, job, "", fetcher)
    expect(envelope.stopReason).toBe("timeout")
    expect(JSON.stringify(envelope)).not.toContain("PRIVATE_ABORT_DIAGNOSTIC")
  })

  it("rejects non-object inputs before any call and grants no ambient environment", async () => {
    const fetcher = vi.fn(async () => Response.json({}))
    const envelope = await runOpenapi(agent, await jobFor({ input: [] }), "", fetcher)
    expect(envelope.stopReason).toBe("rejected")
    expect(fetcher).not.toHaveBeenCalled()
    expect(openapiEngine.envGrants(agent)).toEqual([])
  })
})

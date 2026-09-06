import { describe, expect, it, vi } from "vitest"
import { capturePublishTarget, localPublishRequestAllowed } from "../src/lib/publish-policy.ts"

const enabled = { ARCADE_PUBLISH_LOCAL: "1" }
const request = (url = "http://127.0.0.1:3000/_server/preview", headers: Record<string, string> = {}) => new Request(url, {
  method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin", ...headers }
})
describe("pure local publishing policy", () => {
  it("captures supported relative targets and explicit MCP discovery without options", () => {
    expect(capturePublishTarget({ target: "skills/diff-triage" })).toEqual({ target: "skills/diff-triage", kind: "directory" })
    expect(capturePublishTarget({ target: "./api/openapi.JSON" })).toEqual({ target: "./api/openapi.JSON", kind: "openapi" })
    expect(capturePublishTarget({ target: "mcp://docs.arc.io/mcp" })).toEqual({ target: "mcp://docs.arc.io/mcp", kind: "mcp" })
  })
  it.each(["", "../secret", "/etc/private.json", ".env", "skills/.private", "skills/../other", "--help", "$(whoami)",
    "skills/x;echo", "https://remote.test/openapi.json", "mcp://", "mcp://user:key@remote.test/mcp",
    "mcp://remote.test/mcp?key=PRIVATE", "mcp://remote.test/#x", "skills/xx\u0000", "x".repeat(1025)])("refuses unsafe target %s", target => {
    expect(() => capturePublishTarget({ target })).toThrow("Invalid preview target")
  })
  it("refuses closed-shape violations without evaluating accessors or coercing input", () => {
    const getter = vi.fn(() => "skills/xx")
    for (const value of [null, [], { target: "skills/xx", yes: true }, { target: { toString: getter } },
      Object.defineProperty({}, "target", { enumerable: true, get: getter })]) expect(() => capturePublishTarget(value)).toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
  it.each(["mcp://remote.test/$(whoami)", "mcp://remote.test/x;echo", "mcp://remote.test/a/../private",
    "mcp://remote.test/./x"])("refuses shell-shaped or parser-repaired MCP target %s", target => {
    expect(() => capturePublishTarget({ target })).toThrow("Invalid preview target")
  })
  it("accepts an explicit IPv6 loopback request without a forwarded authority", () => {
    expect(localPublishRequestAllowed(request("http://[::1]:3000/preview",
      { host: "[::1]:3000", origin: "http://[::1]:3000" }), enabled)).toBe(true)
  })
  it("allows only explicit local same-origin POST and never infers permission from a missing flag", () => {
    expect(localPublishRequestAllowed(request(), enabled)).toBe(true)
    expect(localPublishRequestAllowed(request(), {})).toBe(false)
    expect(localPublishRequestAllowed(request(), { ARCADE_PUBLISH_LOCAL: "true" })).toBe(false)
    expect(localPublishRequestAllowed(new Request("http://127.0.0.1:3000/"), enabled)).toBe(false)
  })
  it.each(["RAILWAY_SERVICE_ID", "FLY_APP_NAME", "RENDER_SERVICE_ID", "VERCEL", "NETLIFY", "AWS_LAMBDA_FUNCTION_NAME", "K_SERVICE", "DYNO"])("refuses local flag on platform marker %s", marker => {
    expect(localPublishRequestAllowed(request(), { ...enabled, [marker]: "fixture" })).toBe(false)
  })
  it.each([{ origin: "https://evil.test" }, { origin: "null" }, { origin: "" }, { host: "" },
    { host: "evil.test" }, { "sec-fetch-site": "cross-site" }, { "x-forwarded-host": "127.0.0.1:3000" },
    { "x-forwarded-proto": "http" }, { forwarded: "host=127.0.0.1" }])("refuses mismatched/proxy request metadata %j", headers => {
    expect(localPublishRequestAllowed(request(undefined, headers), enabled)).toBe(false)
  })
  it.each(["http://evil.test:3000", "http://0.0.0.0:3000", "http://127.0.0.1.evil.test:3000", "http://192.168.1.2:3000", "https://127.0.0.1:3000"])("refuses noncanonical local URL %s", origin => {
    expect(localPublishRequestAllowed(request(origin + "/preview", { host: new URL(origin).host, origin }), enabled)).toBe(false)
  })
})

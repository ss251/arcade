import { describe, expect, it } from "vitest"
import { localPublishHostname, requirePublishHost } from "../src/lib/publish-binding.ts"
import { partition, preflightWeb } from "../src/preflight.ts"

describe("publish loopback binding", () => {
  it("leaves the default deployment unchanged and forces an explicit numeric local host", () => {
    expect(localPublishHostname({})).toBeUndefined()
    expect(localPublishHostname({ ARCADE_PUBLISH_LOCAL: "1" })).toBe("127.0.0.1")
    expect(() => requirePublishHost({ ARCADE_PUBLISH_LOCAL: "1" }, "127.0.0.1")).not.toThrow()
  })
  it("rejects resolved all-interface, omitted, hostname and TLS listener settings in local mode", () => {
    for (const host of [undefined, true, false, "0.0.0.0", "localhost", "::", "other.example"])
      expect(() => requirePublishHost({ ARCADE_PUBLISH_LOCAL: "1" }, host)).toThrow()
    expect(() => requirePublishHost({ ARCADE_PUBLISH_LOCAL: "1" }, "127.0.0.1", true)).toThrow()
    expect(() => requirePublishHost({}, "0.0.0.0", true)).not.toThrow()
  })
  it.each(["RAILWAY_SERVICE_ID", "FLY_APP_NAME", "RENDER_SERVICE_ID", "VERCEL", "NETLIFY", "K_SERVICE", "DYNO", "AWS_LAMBDA_FUNCTION_NAME"])("refuses an accidental local flag on %s", key => {
    const env = { ARCADE_PUBLISH_LOCAL: "1", [key]: "fixture", ARCADE_HUB: "https://hub.example",
      ANTHROPIC_API_KEY: "fixture", ARCADE_APPROVAL_SECRET: "fixture" }
    expect(() => localPublishHostname(env)).toThrow()
    expect(partition(preflightWeb(env).problems).fatal.some(p => p.includes("ARCADE_PUBLISH_LOCAL"))).toBe(true)
  })
})

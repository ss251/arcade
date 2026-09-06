import { describe, expect, it } from "vitest"
import { parseScreenOptions, screenPages, screenUpstream, screenLocalPath } from "../../../scripts/web-screens-policy.ts"

const HUB = "https://hub.example", SELLER = "0x" + "3".repeat(40)
const args = () => ["--hub", HUB, "--seller", SELLER, "--skill", "diff-triage", "--chrome", "/Applications/Trusted Chrome"]
describe("read-only screenshot scope", () => {
  it("requires an explicit exact public source and trusted executable", () => {
    expect(parseScreenOptions(args())).toEqual({ hub: HUB, seller: SELLER, skill: "diff-triage", chrome: "/Applications/Trusted Chrome" })
    expect(parseScreenOptions(args().map(x => x === HUB ? "http://127.0.0.1:8787" : x)).hub).toBe("http://127.0.0.1:8787")
  })
  it.each([
    [], ["--hub", HUB], [...args(), "--hub", HUB], [...args(), "--key", "not-a-real-key"],
    args().map(x => x === HUB ? HUB + "/" : x),
    args().map(x => x === HUB ? "https://user:password@hub.example" : x),
    args().map(x => x === HUB ? "http://hub.example" : x),
    args().map(x => x === HUB ? HUB + "?token=x" : x),
    args().map(x => x === SELLER ? "0x" + "0".repeat(40) : x),
    args().map(x => x === "diff-triage" ? "../file" : x),
    args().map(x => x === "/Applications/Trusted Chrome" ? "chrome --flag" : x)
  ].map(input => ({ input })))("refuses ambiguous, private or malformed configuration", ({ input }) => {
    expect(() => parseScreenOptions(input)).toThrow("Invalid screenshot options")
  })
  it("generates only the six exact current routes, including selected seller", () => {
    expect(screenPages(parseScreenOptions(args()))).toEqual([
      { name: "market", path: "/" }, { name: "skill", path: "/skill/diff-triage" },
      { name: "seller", path: "/seller?address=" + SELLER }, { name: "buyer", path: "/buyer" },
      { name: "publish", path: "/publish" }, { name: "chat", path: "/chat" }
    ])
  })
  it("permits only bounded selected public reads, with exact origin and no credentials", () => {
    const o = parseScreenOptions(args())
    for (const path of ["/listings", "/stats", "/listings/diff-triage", "/listings/diff-triage/receipts?limit=20",
      "/sellers/" + SELLER + "/summary", "/names/diff-triage.seller.arcade.eth"]) {
      expect(screenUpstream(new Request(HUB + path), o)).toBe(true)
    }
    for (const request of [
      new Request(HUB + "/listings", { method: "POST" }),
      new Request("https://other.example/listings"), new Request(HUB + "/x/" + SELLER + "/diff-triage"),
      new Request(HUB + "/jobs/private/result"), new Request(HUB + "/trees/private"),
      new Request(HUB + "/listings?token=x"), new Request(HUB + "/listings/other-skill"),
      new Request(HUB + "/listings", { headers: { authorization: "Bearer fixture" } }),
      new Request(HUB + "/listings", { headers: { cookie: "fixture" } }),
      new Request(HUB + "/listings", { headers: { "payment-signature": "fixture" } }),
      new Request(HUB + "/listings", { headers: { "x-job-token": "fixture" } })
    ]) expect(screenUpstream(request, o)).toBe(false)
  })
  it("serves only selected pages and simple built assets, never active API/RPC routes", () => {
    const o = parseScreenOptions(args())
    for (const p of screenPages(o)) expect(screenLocalPath(p.path, o)).toBe(true)
    expect(screenLocalPath("/assets/client-A1_b.js", o)).toBe(true)
    for (const path of ["/api/chat", "/api/quote", "/api/publish-preview", "/_serverFn/x",
      "/buyer?token=x", "/assets/../secret", "/assets/%2e%2e/secret", "/assets/client.js?x=1"])
      expect(screenLocalPath(path, o)).toBe(false)
  })
})

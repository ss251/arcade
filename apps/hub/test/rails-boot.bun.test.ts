import { describe, expect, it } from "bun:test"
import { privateKeyToAccount } from "viem/accounts"
import { loadChainConfig } from "@arcade/core"
const root = new URL("../../..", import.meta.url).pathname, KEY = `0x${"01".repeat(32)}` as const
const pinned = loadChainConfig("arc-testnet")
async function hub(env: Record<string, string>, check: (origin: string, output: () => string) => Promise<void>) {
  const child = Bun.spawn([process.execPath, "--no-env-file", "--preload", "./apps/hub/test/fixtures/rails-boot-preload.ts", "apps/hub/src/server.ts"], {
    cwd: root, env: { PATH: "", PORT: "0", ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "test", ARCADE_CHAIN_CHECK: "0",
      ARCADE_HUB_SECRET: "public-offline-fixture", ...env }, stdout: "pipe", stderr: "pipe", stdin: "ignore"
  })
  let output = "", origin = ""
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader(), decoder = new TextDecoder()
    while (true) { const part = await reader.read(); if (part.done) break
      output = (output + decoder.decode(part.value, { stream: true })).slice(-32768)
      const port = /\[rails-port\] (\d+)/.exec(output)?.[1]; if (port) origin = `http://127.0.0.1:${port}`
    }
  }
  const streams = Promise.all([drain(child.stdout), drain(child.stderr)])
  const waitExit = async (ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([child.exited.then(() => true), new Promise<boolean>(r => { timer = setTimeout(() => r(false), ms) })]) }
    finally { if (timer !== undefined) clearTimeout(timer) }
  }
  try {
    const until = Date.now() + 6000
    while (!origin && child.exitCode === null && child.signalCode === null && Date.now() < until) await Bun.sleep(10)
    await check(origin, () => output)
    expect(output).not.toContain(KEY); expect(output).not.toContain("PRIVATE_BAD_RAIL")
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); if (!await waitExit(500)) { child.kill("SIGKILL"); if (!await waitExit(1000)) throw Error("Owned hub not reaped") } }
    await streams; expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
    if (origin) await expect(fetch(origin, { signal: AbortSignal.timeout(500), redirect: "error", credentials: "omit" })).rejects.toThrow()
  }
  return child.exitCode
}
const get = async (origin: string, path: string, init?: RequestInit) => {
  if (!origin) throw Error("Owned fixture did not bind")
  return fetch(origin + path, { ...init, signal: AbortSignal.timeout(2000), redirect: "error", credentials: "omit" })
}
describe("actual F4 boot and constructed rail inventory", () => {
  it.each(["test", "eip3009", "gateway"])("keeps %s default and advertises only built rails without provider traffic", async rail => {
    await hub({ ARCADE_RAIL: rail, ...(rail === "eip3009" ? { ARCADE_FACILITATOR_KEY: KEY, ARCADE_RPC_URL: "http://127.0.0.1:1" } : {}) }, async origin => {
      const expected = rail === "gateway" ? ["gateway"] : [rail, "gateway"]
      expect(await (await get(origin, "/healthz")).json()).toEqual({ ok: true, rail, rails: expected, network: "eip155:5042002" })
      const openapi = await (await get(origin, "/openapi.json")).json()
      expect(openapi["x-arcade-payment"]).toMatchObject({ rail, rails: expected })
      expect(openapi.paths[`/x/0x${"2".repeat(40)}/first`].post.description).toContain("EIP-3009 root payments need no deposit; Gateway payments need a pre-funded Gateway balance")
      expect(await (await get(origin, "/.well-known/x402")).json()).toMatchObject({ rail, rails: expected })
      const text = await (await get(origin, "/skill.md")).text()
      expect(text).toContain(`Default rail: ${rail}`); expect(text).toContain("Built rails:"); expect(text).toContain("not a live provider-support check")
      expect(text).toContain("pre-funded Gateway balance"); expect(text).toContain("not a mined transaction"); expect(text).toContain("test rail is simulated")
      const stats = await (await get(origin, "/__rails_fixture")).json()
      expect(stats.networkRequests).toBe(0); expect(stats.gateway).toHaveLength(1); expect(stats.eip).toHaveLength(rail === "eip3009" ? 1 : 0)
      expect(stats.gateway[0]).toEqual({ wallet: pinned.gateway!.wallet, facilitatorUrl: pinned.gateway!.facilitatorUrl,
        chainId: pinned.chainId, minValiditySeconds: pinned.gateway!.minValiditySeconds })
      if (rail === "eip3009") {
        expect(stats.eip[0]).toMatchObject({ chainId: 5042002, rpcUrl: "http://127.0.0.1:1", facilitator: privateKeyToAccount(KEY).address })
        expect(stats.eip[0]).not.toHaveProperty("feeSplitter")
        for (const [id, seller, splitter] of [["first", "2", "3"], ["second", "4", "5"]]) {
          const response = await get(origin, `/x/0x${seller!.repeat(40)}/${id}`, { method: "POST", body: "{}" })
          expect(response.status).toBe(402)
          expect((await response.json()).accepts[0]).toMatchObject({ payTo: `0x${splitter!.repeat(40)}`, extra: { name: "USDC" } })
        }
      }
      expect((await (await get(origin, "/__rails_fixture")).json()).networkRequests).toBe(0)
    })
  }, 10000)
  it("does not construct or advertise Gateway where the selected ready config has none", async () => {
    await hub({ TEST_NO_GATEWAY: "1" }, async origin => {
      expect(await (await get(origin, "/healthz")).json()).toMatchObject({ rail: "test", rails: ["test"] })
      expect(await (await get(origin, "/__rails_fixture")).json()).toEqual({ eip: [], gateway: [], networkRequests: 0 })
    })
  }, 10000)
  it("Gateway discovery names the actual unsigned challenge payee, not the EIP-only splitter", async () => {
    await hub({ ARCADE_RAIL: "gateway" }, async origin => {
      const discovery = await (await get(origin, "/.well-known/x402")).json()
      const response = await get(origin, `/x/0x${"2".repeat(40)}/first`, { method: "POST", body: "{}" })
      expect(response.status).toBe(402)
      const actual = (await response.json()).accepts[0]
      expect(actual.payTo).toBe(`0x${"2".repeat(40)}`)
      expect(discovery.resources[0].accepts[0].payTo).toBe(actual.payTo)
      expect((await (await get(origin, "/__rails_fixture")).json()).networkRequests).toBe(0)
    })
  }, 10000)
  it("does not promise an untouched payer balance after an uncertain settlement timeout", async () => {
    await hub({ ARCADE_RAIL: "gateway" }, async origin => {
      const openapi = await (await get(origin, "/openapi.json")).json()
      const description = openapi.paths[`/x/0x${"2".repeat(40)}/first`].post.description as string
      const markdown = await (await get(origin, "/skill.md")).text()
      expect(description).not.toContain("failed call leaves the payer's balance untouched")
      expect(markdown).not.toContain("buyer's balance is untouched")
      for (const text of [description, markdown]) {
        expect(text).toContain("Validated output is required before settlement is submitted")
        expect(text).toContain("Definite pre-settlement refusals are not submitted")
        expect(text).toContain("unknown outcome requiring reconciliation")
      }
      expect((await (await get(origin, "/__rails_fixture")).json()).networkRequests).toBe(0)
    })
  }, 10000)
  it.each([{ ARCADE_RAIL: "PRIVATE_BAD_RAIL" }, { ARCADE_RAIL: "gateway", TEST_NO_GATEWAY: "1" }, { ARCADE_NETWORK: "arc-mainnet" }])("refuses invalid or unavailable boot before building a listener %#", async env => {
    const exit = await hub(env, async (origin, output) => { expect(origin).toBe(""); expect(output()).toContain("refusing to start") })
    expect(exit).toBe(2)
  }, 10000)
})

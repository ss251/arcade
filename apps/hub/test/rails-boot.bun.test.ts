import { describe, expect, it } from "bun:test"
import { privateKeyToAccount } from "viem/accounts"
import { HIRE_CAPABILITY_HEADER, loadChainConfig } from "@arcade/core"
import type { PaymentRequirements } from "@arcade/payments"
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
      const challenge = await get(origin, `/x/0x${"2".repeat(40)}/first`, { method: "POST", body: "{}" })
      expect(challenge.status).toBe(402)
      const accepts = (await challenge.json()).accepts
      expect(accepts).toHaveLength(rail === "eip3009" ? 2 : 1)
      expect(accepts[0].extra.name).toBe(rail === "test" ? "USDC" : "GatewayWalletBatched")
      if (rail === "eip3009") {
        expect(stats.eip[0]).toMatchObject({ chainId: 5042002, rpcUrl: "http://127.0.0.1:1", facilitator: privateKeyToAccount(KEY).address })
        expect(stats.eip[0]).not.toHaveProperty("feeSplitter")
        for (const [id, seller, splitter] of [["first", "2", "3"], ["second", "4", "5"]]) {
          const response = await get(origin, `/x/0x${seller!.repeat(40)}/${id}`, { method: "POST", body: "{}" })
          expect(response.status).toBe(402)
          const accepts = (await response.json()).accepts
          expect(accepts).toHaveLength(2)
          expect(accepts[0]).toMatchObject({ payTo: `0x${seller!.repeat(40)}`, extra: { name: "GatewayWalletBatched" } })
          expect(accepts[1]).toMatchObject({ payTo: `0x${splitter!.repeat(40)}`, extra: { name: "USDC", feeSplitterVersion: 2 } })
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

const paidEnv = { ARCADE_RAIL: "eip3009", ARCADE_FACILITATOR_KEY: KEY, ARCADE_RPC_URL: "http://127.0.0.1:1", TEST_RAIL_PAYMENTS: "1" }
const pathFor = (id = "first", seller = "2") => `/x/0x${seller.repeat(40)}/${id}`
const simulatedPayment = (accepted: PaymentRequirements, signature = "0xgood", value = accepted.amount) => ({ x402Version: 2, accepted,
  payload: { signature, authorization: { from: `0x${"a".repeat(40)}`, to: accepted.payTo, value,
    validAfter: String(Math.floor(Date.now() / 1000) - 1), validBefore: String(Math.floor(Date.now() / 1000) + 600),
    nonce: `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}` } } })
const signed = (value: unknown) => ({ "payment-signature": Buffer.from(JSON.stringify(value)).toString("base64") })
const stats = async (origin: string) => (await get(origin, "/__rails_fixture")).json()
const probe = async (origin: string, path = pathFor(), headers?: HeadersInit) => {
  const response = await get(origin, path, { method: "POST", body: "{}", ...(headers === undefined ? {} : { headers }) })
  expect(response.status).toBe(402)
  return response.json() as Promise<{ accepts: PaymentRequirements[]; error: string }>
}
async function finished(origin: string, response: Response) {
  expect(response.status).toBe(202)
  const handle = await response.json()
  expect(handle.status).toBe("queued")
  const url = new URL(handle.poll_url)
  expect(url.origin).toBe(origin)
  for (let i = 0; i < 100; i++) {
    const result = await (await get(origin, url.pathname + url.search)).json()
    if (result.receipt) return result.receipt
    await Bun.sleep(10)
  }
  throw Error("Owned simulated job did not finish")
}
describe("J1 native ordinary-route selection (offline named rails)", () => {
  it("booted without Gateway, advertises and settles only exact", async () => {
    await hub({ ...paidEnv, TEST_NO_GATEWAY: "1" }, async origin => {
      const choices = (await probe(origin)).accepts
      expect(choices).toHaveLength(1); expect(choices[0]!.extra["name"]).toBe("USDC")
      const receipt = await finished(origin, await get(origin, pathFor(), { method: "POST", body: "{}", headers: signed(simulatedPayment(choices[0]!)) }))
      expect(receipt).toMatchObject({ rail: "eip3009", settled: true })
      expect(await stats(origin)).toMatchObject({ gateway: [], verifies: ["eip3009"], settlements: ["eip3009"], networkRequests: 0 })
    })
  }, 10000)
  it.each(["gateway", "eip3009"] as const)("carries %s through verify, settlement and receipt", async name => {
    await hub(paidEnv, async origin => {
      const choices = (await probe(origin)).accepts
      expect(choices).toHaveLength(2)
      const accepted = choices[name === "gateway" ? 0 : 1]!
      const receipt = await finished(origin, await get(origin, pathFor(), { method: "POST", body: "{}", headers: signed(simulatedPayment(accepted)) }))
      expect(receipt).toMatchObject({ rail: name, settled: true })
      const result = await stats(origin)
      expect(result).toMatchObject({ verifies: [name], settlements: [name], dispatches: 1, reservations: 0, networkRequests: 0 })
      expect(result.receipts).toHaveLength(1)
    })
  }, 10000)
  it("preserves exact overpayment authorization policy without accepting a changed quote", async () => {
    await hub(paidEnv, async origin => {
      const accepted = (await probe(origin)).accepts[1]!
      const receipt = await finished(origin, await get(origin, pathFor(), { method: "POST", body: "{}", headers: signed(simulatedPayment(accepted, "0xgood", "10001")) }))
      expect(receipt).toMatchObject({ rail: "eip3009", settled: true })
      expect((await stats(origin)).settlements).toEqual(["eip3009"])
    })
  }, 10000)
  it.each(["gateway", "eip3009"] as const)("does not settle %s when output fails its schema", async name => {
    await hub(paidEnv, async origin => {
      const path = pathFor(`only-${name}`), accepted = (await probe(origin, path)).accepts[0]!
      const receipt = await finished(origin, await get(origin, path, { method: "POST", body: '{"fail":true}', headers: signed(simulatedPayment(accepted)) }))
      expect(receipt).toMatchObject({ rail: name, settled: false })
      expect(await stats(origin)).toMatchObject({ verifies: [name], settlements: [], dispatches: 1, networkRequests: 0 })
    })
  }, 10000)
  it("refuses unknown, unbuilt and unlisted rails before verify, jobs or reservations", async () => {
    await hub(paidEnv, async origin => {
      const [gateway, exact] = (await probe(origin)).accepts
      for (const [path, accepted] of [
        [pathFor(), { ...gateway, scheme: "unknown" }], [pathFor(), { ...exact, scheme: "erc8183" }],
        [pathFor("only-eip3009"), gateway], [pathFor("only-gateway"), exact]
      ] as const) {
        const response = await get(origin, path, { method: "POST", body: "{}", headers: signed(simulatedPayment(accepted as PaymentRequirements)) })
        expect(response.status).toBe(402); expect(await response.json()).toEqual({ error: "unsupported_rail" })
      }
      expect(await probe(origin, pathFor("only-erc8183"))).toMatchObject({ error: "unsupported_rail", accepts: [] })
      expect(await stats(origin)).toMatchObject({ verifies: [], settlements: [], dispatches: 0, jobWrites: 0, reservations: 0, networkRequests: 0 })
    })
  }, 10000)
  it("binds every echoed payment term before a verifier can run", async () => {
    await hub(paidEnv, async origin => {
      const exact = (await probe(origin)).accepts[1]!
      for (const change of [{ amount: "10001" }, { asset: `0x${"6".repeat(40)}` }, { network: "eip155:1" },
        { payTo: `0x${"6".repeat(40)}` }, { resource: "/other" }, { maxTimeoutSeconds: 1 },
        { extra: { ...exact.extra, version: "3" } }, { extra: { ...exact.extra, feeSplitterVersion: 1 } },
        { extra: { ...exact.extra, feeSplitter: `0x${"6".repeat(40)}` } }]) {
        const response = await get(origin, pathFor(), { method: "POST", body: "{}", headers: signed(simulatedPayment({ ...exact, ...change })) })
        expect(response.status).toBe(402); expect(await response.json()).toEqual({ error: "payment_invalid", detail: "requirements_mismatch" })
      }
      const gateway = (await probe(origin)).accepts[0]!
      const response = await get(origin, pathFor(), { method: "POST", body: "{}", headers: signed(simulatedPayment({ ...gateway,
        extra: { ...gateway.extra, verifyingContract: `0x${"6".repeat(40)}` } })) })
      expect(response.status).toBe(402); expect(await response.json()).toEqual({ error: "payment_invalid", detail: "requirements_mismatch" })
      expect(await stats(origin)).toMatchObject({ verifies: [], settlements: [], dispatches: 0, jobWrites: 0, reservations: 0, networkRequests: 0 })
    })
  }, 10000)
  it("keeps malformed envelopes at 400 and invalid signatures at 402 without work", async () => {
    await hub(paidEnv, async origin => {
      for (const raw of [null, [], {}, { x402Version: 2, accepted: { scheme: "exact" }, payload: {} }]) {
        expect((await get(origin, pathFor(), { method: "POST", body: "{}", headers: signed(raw) })).status).toBe(400)
      }
      const accepted = (await probe(origin)).accepts[0]!
      const response = await get(origin, pathFor(), { method: "POST", body: "{}", headers: signed(simulatedPayment(accepted, "0xbad")) })
      expect(response.status).toBe(402); expect(await response.json()).toMatchObject({ error: "payment_invalid" })
      expect(await stats(origin)).toMatchObject({ verifies: ["gateway"], settlements: [], dispatches: 0, jobWrites: 0, reservations: 0, networkRequests: 0 })
    })
  }, 10000)
  it("keeps authorized child calls on exact, with no Gateway admission or speculative budget reservation", async () => {
    await hub(paidEnv, async origin => {
      const { capability } = await (await get(origin, "/__rails_child")).json()
      const headers = { [HIRE_CAPABILITY_HEADER]: capability }, path = pathFor("second", "4")
      const rootChoices = (await probe(origin, path)).accepts, child = (await probe(origin, path, headers)).accepts
      expect(child).toHaveLength(1); expect(child[0]).toEqual(rootChoices[1])
      const refused = await get(origin, path, { method: "POST", body: "{}", headers: { ...headers, ...signed(simulatedPayment(rootChoices[0]!)) } })
      expect(refused.status).toBe(402); expect(await refused.json()).toEqual({ error: "unsupported_rail" })
      expect(await stats(origin)).toMatchObject({ verifies: [], jobWrites: 0, reservations: 0 })
      const receipt = await finished(origin, await get(origin, path, { method: "POST", body: "{}", headers: { ...headers, ...signed(simulatedPayment(child[0]!)) } }))
      expect(receipt).toMatchObject({ rail: "eip3009", settled: true, hop: 1 })
      expect(await stats(origin)).toMatchObject({ verifies: ["eip3009"], settlements: ["eip3009"], reservations: 1, networkRequests: 0 })
    })
  }, 10000)
})

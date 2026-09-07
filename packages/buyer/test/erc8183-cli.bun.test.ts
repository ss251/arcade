import { expect, test } from "bun:test"
import { parseEscrowBuyerCommand, escrowBuyerMain } from "../src/erc8183-cli.ts"
import { fileURLToPath } from "node:url"
const seller = "0x" + "1".repeat(40)
const base = ["skill", "--rail", "erc8183", "--hub", "https://example.test", "--seller", seller, "--input", '{"fixture":true}', "--max-amount", "0.30"]
test("strict escrow command captures ID/name, canonical JSON and independent principal cap", () => {
  expect(parseEscrowBuyerCommand(base)).toMatchObject({ kind: "id", skillId: "skill", seller, body: '{"fixture":true}', maxAmountAtomic: 300000n })
  expect(parseEscrowBuyerCommand(["--name", "skill.seller.arcade.eth", "--rail", "erc8183", "--input", "{ }", "--max-amount", "0.3"]))
    .toMatchObject({ kind: "name", name: "skill.seller.arcade.eth", body: "{}", maxAmountAtomic: 300000n })
})
test.each([[], base.slice(0, -2), [...base, "--rail", "erc8183"], [...base, "--key", "PRIVATE_SENTINEL"], [...base, "extra"],
  base.map(x => x === "erc8183" ? "eip3009" : x), base.map(x => x === "0.30" ? "0" : x),
  base.map(x => x === "--rail" ? "--rail=erc8183" : x), base.map(x => x === "https://example.test" ? "https://example.test/" : x),
  base.map(x => x === '{"fixture":true}' ? "INVALID_PRIVATE_JSON" : x), [...base, "--name", "skill.seller.arcade.eth"]].map(args => ({ args })))("invalid escrow argv refuses before environment/key/IO %#", async ({ args }) => {
  let reads = 0; const lines: string[] = [], env = new Proxy({}, { get() { reads++; throw Error("PRIVATE_ENV") } })
  expect(await escrowBuyerMain(args, { env, write: async line => { lines.push(line) } })).toBe(2)
  expect(reads).toBe(0); expect(lines.join()).toContain("escrow_buyer_input_or_configuration_refused")
  expect(lines.join()).not.toMatch(/PRIVATE_SENTINEL|PRIVATE_ENV|INVALID_PRIVATE_JSON/)
})
test("escrow help is offline and accessor argv is not invoked", async () => {
  let reads = 0; const lines: string[] = [], env = new Proxy({}, { get() { reads++; throw Error() } })
  expect(await escrowBuyerMain(["--rail", "erc8183", "--help"], { env, write: async line => { lines.push(line) } })).toBe(0)
  expect(lines.join()).toContain("additional exposure"); expect(reads).toBe(0)
  const args = [...base]; Object.defineProperty(args, "0", { get() { reads++; return "skill" } })
  expect(() => parseEscrowBuyerCommand(args)).toThrow("escrow_buyer_input_invalid"); expect(reads).toBe(0)
})
const root = fileURLToPath(new URL("../../..", import.meta.url)), cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url)),
  module = fileURLToPath(new URL("../src/erc8183-cli.ts", import.meta.url))
async function child(args: string[], signalOnReady = false) {
  const process = Bun.spawn([Bun.which("bun")!, "--no-env-file", ...args], { cwd: root, env: { PATH: "" }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  let signaled = false, second: ReturnType<typeof setTimeout> | undefined
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    let output = ""; const reader = stream.getReader()
    try { for (;;) { const part = await reader.read(); if (part.done) return output
      output += new TextDecoder().decode(part.value); if (output.length > 16384) throw Error("fixture output limit")
      if (signalOnReady && !signaled && output.includes("READY")) {
        signaled = true; process.kill("SIGTERM"); second = setTimeout(() => { if (process.exitCode === null && process.signalCode === null) process.kill("SIGTERM") }, 5)
      }
    } } finally { reader.releaseLock() }
  }
  const drains = Promise.all([drain(process.stdout), drain(process.stderr)]); void drains.catch(() => {})
  const within = async <T>(promise: Promise<T>, ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("owned fixture deadline")), ms) })]) }
    finally { clearTimeout(timer) }
  }
  try { const code = await within(process.exited, 4000), [stdout, stderr] = await within(drains, 1000); return { code, stdout, stderr, signaled } }
  finally {
    clearTimeout(second)
    if (process.exitCode === null && process.signalCode === null) { process.kill("SIGKILL"); await within(process.exited, 1000) }
    await within(drains, 1000)
  }
}
test("actual entry help and malformed rail never fall through to legacy key parsing", async () => {
  const help = await child([cli, "--rail", "erc8183", "--help"])
  expect(help.code).toBe(0); expect(help.stdout).toContain("additional exposure"); expect(help.stderr).toBe("")
  const invalid = await child([cli, "skill", "--rail=erc8183", "PRIVATE_SENTINEL"])
  expect(invalid.code).toBe(2); expect(invalid.stderr).toContain("escrow_buyer_input_or_configuration_refused")
  expect(invalid.stdout + invalid.stderr).not.toMatch(/PRIVATE_SENTINEL|ARCADE_BUYER_KEY is not set/)
  const badName = await child([cli, "--name=PRIVATE_SENTINEL"])
  expect(badName.code).toBe(2); expect(badName.stderr).toContain("escrow_buyer_input_or_configuration_refused")
  expect(badName.stdout + badName.stderr).not.toMatch(/PRIVATE_SENTINEL|ARCADE_BUYER_KEY is not set/)
  const imported = await child(["-e", `globalThis.fetch=()=>{throw Error("NETWORK_FORBIDDEN")};await import(${JSON.stringify(module)});console.log("IMPORT_INERT")`])
  expect(imported).toMatchObject({ code: 0, stdout: "IMPORT_INERT\n", stderr: "" })
})
test("actual repeated signals await owned cleanup; stalled cleanup hits the bounded fuse", async () => {
  const out = await child(["-e", `const {runOwnedEscrowBuyerCli}=await import(${JSON.stringify(module)});await runOwnedEscrowBuyerCli(async signal=>{
    console.log("READY");await new Promise(resolve=>signal.addEventListener("abort",resolve,{once:true}));await Bun.sleep(30);console.log("JOINED");return 1
  });console.log("FINISHED")`], true)
  expect(out).toMatchObject({ code: 1, signaled: true, stdout: "READY\nJOINED\nFINISHED\n", stderr: "" })
  const stalled = await child(["-e", `const {runOwnedEscrowBuyerCli}=await import(${JSON.stringify(module)});await runOwnedEscrowBuyerCli(()=>new Promise(()=>{}),30)`])
  expect(stalled.code).toBe(124); expect(stalled.stderr).toContain("escrow_buyer_deadline_exceeded")
})

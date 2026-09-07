import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const buyer = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const arcade = fileURLToPath(new URL("../../runner/src/cli.ts", import.meta.url))
const address = `0x${"11".repeat(20)}`, delegate = `0x${"22".repeat(20)}`
const dry = ["fund", "--from-unified-balance", "--owner", address, "--source", "Arc_Testnet", "--amount", "0.25", "--dry-run"]
async function child(args: string[]) {
  const p = Bun.spawn([process.execPath, "--no-env-file", ...args], { cwd: root, env: { PATH: "" }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader(); let size = 0, text = ""
    try { for (;;) { const n = await reader.read(); if (n.done) return text
      size += n.value.length; if (size > 16384) throw Error("output_bound")
      text += new TextDecoder().decode(n.value)
    } } finally { reader.releaseLock() }
  }
  const output = Promise.all([drain(p.stdout), drain(p.stderr)]); void output.catch(() => {})
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const exited = await Promise.race([p.exited, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { p.kill("SIGKILL"); reject(Error("owned_child_deadline")) }, 5000)
    })])
    const [stdout, stderr] = await output
    return { exited, stdout, stderr }
  } finally {
    if (timer) clearTimeout(timer)
    if (p.exitCode === null && p.signalCode === null) p.kill("SIGKILL")
    await p.exited; await output
  }
}
test("actual arcade and buyer fund routes are offline for help/dry-run and reject key arguments", async () => {
  for (const entry of [arcade, buyer]) {
    const help = await child([entry, "fund", "--help"])
    expect(help.exited).toBe(0); expect(help.stdout).toContain("max-burn-block-delta"); expect(help.stderr).toBe("")
    const preview = await child([entry, ...dry, "--delegate", delegate])
    expect(preview.exited).toBe(0); expect(preview.stderr).toBe("")
    expect(JSON.parse(preview.stdout)).toMatchObject({ status: "dry_run", networkObserved: false, plan: { recipient: delegate } })
    const bad = await child([entry, "fund", "--key", "PRIVATE_SENTINEL"])
    expect(bad.exited).toBe(2); expect(bad.stderr).toContain("unified_funding_input_invalid")
    expect(bad.stdout + bad.stderr).not.toContain("PRIVATE_SENTINEL")
  }
})
test("actual buyer function never reads key/config or fetches for dry-run with unresolved delegate", async () => {
  const script = `globalThis.fetch=()=>{throw Error("NETWORK_FORBIDDEN")};
    const{buyerMain}=await import(${JSON.stringify(buyer)});
    let keys=0; const env=new Proxy({}, {get(_t,k){if(k!=="ARCADE_NETWORK"){keys++;throw Error("KEY_FORBIDDEN")}}});
    const code=await buyerMain(${JSON.stringify(dry)},env);
    if(keys||code)throw Error("OFFLINE_CONTRACT_FAILED");`
  const result = await child(["-e", script])
  expect(result.exited).toBe(0); expect(result.stderr).toBe("")
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "dry_run", delegateUnresolved: true, plan: { recipient: null } })
})

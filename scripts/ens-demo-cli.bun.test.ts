import { describe, expect, it } from "bun:test"
import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const entry = join(root, "scripts/ens-demo.ts")
const name = "flow.seller.arcade.eth"
const refusal = "ENS demo refused or unavailable; inspect public state and reconcile any retained journal/hash before retrying. Private diagnostics withheld."

/** Only this fixture child is ever signalled; close, not kill(), proves cleanup. */
const childRun = async (args: string[], timeoutMs = 5000, deadlineAfter?: string) => {
  const child = spawn(process.execPath, ["--no-env-file", ...args], {
    cwd: root, env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, stdio: ["ignore", "pipe", "pipe"]
  })
  let stdout = "", stderr = "", timedOut = false, overflow = false, ready = false
  let force: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    if (child.pid === undefined || child.pid <= 0 || child.exitCode !== null || child.signalCode !== null) return
    child.kill("SIGTERM")
    force ??= setTimeout(() => {
      if (child.pid !== undefined && child.pid > 0 && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    }, 100)
  }
  const capture = (target: "stdout" | "stderr", chunk: Buffer) => {
    if (stdout.length + stderr.length + chunk.length > 65_536) { overflow = true; stop(); return }
    if (target === "stdout") stdout += chunk.toString(); else stderr += chunk.toString()
    if (deadlineAfter !== undefined && !ready && stdout.includes(deadlineAfter)) {
      ready = true; clearTimeout(timer); timer = setTimeout(() => { timedOut = true; stop() }, timeoutMs)
    }
  }
  child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk))
  child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk))
  const close = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code, signal) => resolve({ code, signal }))
  })
  let timer = setTimeout(() => { timedOut = true; stop() }, deadlineAfter === undefined ? timeoutMs : 5000)
  try {
    const result = await close
    return { ...result, stdout, stderr, timedOut, overflow, closed: true }
  } finally { clearTimeout(timer); if (force) clearTimeout(force); stop() }
}

const withGuard = async (test: (preload: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "arcade-ens-cli-test-"))
  try {
    const preload = join(directory, "guard.ts")
    await writeFile(preload, `
      const reads = { state: 0, key: 0, network: 0 };
      process.env = new Proxy(process.env, { get(target, key) {
        if (key === "ARCADE_ENS_STATE") { reads.state++; throw Error("STATE_GUARD"); }
        if (typeof key === "string" && key.endsWith("_KEY")) { reads.key++; throw Error("KEY_GUARD"); }
        return Reflect.get(target, key);
      }});
      globalThis.fetch = Object.assign(async () => { reads.network++; throw Error("NETWORK_GUARD"); }, {preconnect() {}});
      process.once("exit", () => console.error("OFFLINE_GUARD=" + JSON.stringify(reads)));
    `, { mode: 0o600 })
    await test(preload)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

const noAccess = (output: Awaited<ReturnType<typeof childRun>>) => {
  expect(output.closed).toBe(true)
  expect(output.timedOut).toBe(false)
  expect(output.overflow).toBe(false)
  expect(output.stderr).toContain('OFFLINE_GUARD={"state":0,"key":0,"network":0}')
  expect(output.stdout + output.stderr).not.toMatch(/(?:STATE|KEY|NETWORK)_GUARD/)
}

describe("real ENS demo CLI without a wallet or RPC", () => {
  it("imports from the repository root without starting a beat or reading state, keys or network", async () => {
    await withGuard(async preload => {
      const result = await childRun(["--preload", preload, "-e", `const api = await import(${JSON.stringify(entry)}); console.log(JSON.stringify({run: typeof api.runEnsDemo, parse: typeof api.parseDemoArgs}));`])
      noAccess(result); expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual({ run: "function", parse: "function" })
    })
  })

  it("prints real help without choosing a default beat or accessing any private/runtime state", async () => {
    await withGuard(async preload => {
      const result = await childRun(["--preload", preload, entry, "--help"])
      noAccess(result); expect(result.code).toBe(0)
      expect(result.stdout).toContain("<price-lock|tampered-402|expiry|all> --name")
      expect(result.stdout).toContain("--confirm-name")
      expect(result.stdout).toContain("owner restoration is separate")
      expect(result.stdout).not.toContain('"results"')
    })
  })

  it("refuses missing/invalid selectors, missing write consent and invalid timing before state access", async () => {
    await withGuard(async preload => {
      for (const argv of [[], ["all"], ["price-lock", "--name", name],
        ["all", "--name", name, "--confirm-name", "other.seller.arcade.eth"],
        ["expiry", "--name", name, "--timeout-ms", "1500001"],
        ["expiry", "--name", name, "--poll-ms", "0"], ["unknown", "--name", name]]) {
        const result = await childRun(["--preload", preload, entry, ...argv])
        noAccess(result); expect(result.code).toBe(1); expect(result.stdout).toBe("")
        expect(result.stderr).toContain(refusal)
      }
    })
  }, 15_000)
})

describe("finite production orchestration in an owned subprocess", () => {
  for (const mode of ["deadline", "abort"] as const) {
    it(`settles ${mode} while a state read is pending and leaves no child running`, async () => {
      const source = `
        import {parseDemoArgs, runEnsDemo} from ${JSON.stringify(entry)};
        const hold = setInterval(() => {}, 50), controller = new AbortController();
        const args = parseDemoArgs(["expiry", "--name", ${JSON.stringify(name)}, "--timeout-ms", "1000", "--poll-ms", "1000"]);
        const env = {ARCADE_ENS_STATE: "/tmp/offline-ens-cli-never-read.json"};
        let stateReads = 0, network = 0;
        try {
          const work = runEnsDemo(args, env, {signal: controller.signal,
            readState: async () => { stateReads++; return await new Promise(() => {}); },
            fetch: async () => { network++; throw Error("NETWORK_GUARD"); }});
          ${mode === "abort" ? "setTimeout(() => controller.abort(), 20);" : ""}
          await work;
          console.log("UNEXPECTED_SUCCESS");
        } catch (error) {
          console.log(JSON.stringify({refused: error instanceof Error && error.message === ${JSON.stringify(refusal)}, stateReads, network}));
          process.exitCode = 1;
        } finally { clearInterval(hold); }
      `
      const result = await childRun(["-e", source], 2500)
      expect(result.closed).toBe(true)
      expect(result.timedOut).toBe(false)
      expect(result.code).toBe(1)
      expect(result.signal).toBeNull()
      expect(result.stderr).toBe("")
      expect(JSON.parse(result.stdout)).toEqual({ refused: true, stateReads: 1, network: 0 })
    })
  }

  it("reaps only its uncooperative fixture child when the parent deadline is reached", async () => {
    const result = await childRun(["-e", 'process.on("SIGTERM", () => {}); console.log("OWNED_CHILD_READY"); setInterval(() => {}, 50);'], 400, "OWNED_CHILD_READY")
    expect(result.stdout).toContain("OWNED_CHILD_READY")
    expect(result.timedOut).toBe(true)
    expect(result.closed).toBe(true)
    expect(result.signal).toBe("SIGKILL")
    expect(result.overflow).toBe(false)
  }, 10_000)
})

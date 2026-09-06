import { describe, expect, it } from "bun:test"
import { chmodSync, closeSync, fsyncSync, linkSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync, writeSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { spawn, type ChildProcess } from "node:child_process"

const modulePath = "./graph-deploy.ts"
const runtime = () => import(modulePath) as Promise<typeof import("./graph-deploy.ts")>
// A public SHA2-256 multihash fixture, not an uploaded or approved deployment.
const CID = "QmYwAPJzv5CZsnAzt8auVTL7Lb3wmLnUTYhvQSveNSaVK6"
const SMOKE = "QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8"
const KEY = "0123456789abcdef0123456789abcdef"
const QUERY = "https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.1.0"
const response = () => Response.json({ jsonrpc: "2.0", id: 1, result: { queries: QUERY, playground: "ignored" } })
const fixture = async (run: (path: string, directory: string) => Promise<void>) => {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), "arcade-g6-deploy-"))
  try { chmodSync(directory, 0o700); await run(join(directory, "deployment.jsonl"), directory) }
  finally { rmSync(directory, { recursive: true, force: true }) }
}
const options = (journal: string) => ({ cid: CID, version: "v0.1.0" as const, journal })
const argv = (path: string) => ["--cid", CID, "--version", "v0.1.0", "--journal", path]

describe("G6 fixed deployment policy", () => {
  it("captures exact explicit policy and refuses the consumed smoke and unreviewed variants", async () => {
    const { parseDeployArgs } = await runtime()
    expect(parseDeployArgs(argv("/private/tmp/owned/deployment.jsonl"))).toEqual({ kind: "deploy", ...options("/private/tmp/owned/deployment.jsonl") })
    expect(parseDeployArgs(["--help"])).toEqual({ kind: "help" })
    for (const args of [[], ["--help", "extra"], argv("relative"), ["--cid", SMOKE, "--version", "v0.1.0", "--journal", "/private/tmp/x"],
      ["--cid", CID, "--version", "v0.0.1-smoke", "--journal", "/private/tmp/x"], [...argv("/private/tmp/x"), "--key", KEY],
      ["--cid", "Qm" + "1".repeat(44), "--version", "v0.1.0", "--journal", "/private/tmp/x"], ["--cid", CID, "--cid", CID, "--journal", "/private/tmp/x"]]) {
      expect(() => parseDeployArgs(args)).toThrow("Studio deployment command refused")
    }
    let touched = 0
    expect(() => parseDeployArgs(Object.defineProperty([], "0", { get() { touched++; return "--help" } }))).toThrow()
    expect(touched).toBe(0)
  })
  it("help and invalid CLI do not open a journal, read a key or dispatch", async () => {
    const { deployMain } = await runtime(); let calls = 0
    const deps = { readKey: async () => { calls++; return KEY }, fetch: async () => { calls++; return response() } }
    expect(await deployMain(["--help"], deps)).toEqual({ exitCode: 0, output: expect.stringContaining("Usage:") })
    expect((await deployMain(["--key", KEY], deps)).output).not.toContain(KEY)
    expect(calls).toBe(0)
  })
})

describe("G6 one-shot actual private journal with synthetic credential", () => {
  it("persists preparation before key lookup and intent before exactly one POST", async () => fixture(async path => {
    const { createDeployment } = await runtime(); let keys = 0, sends = 0
    const run = createDeployment(options(path), {
      readKey: async () => { keys++; expect(readFileSync(path, "utf8")).toContain('"phase":"prepared"'); return KEY },
      fetch: async (url, init) => {
        sends++; const journal = readFileSync(path, "utf8")
        expect(journal).toContain('"phase":"dispatch_intent"'); expect(journal).not.toContain(KEY)
        expect(url).toBe("https://api.studio.thegraph.com/deploy")
        expect(init).toMatchObject({ method: "POST", redirect: "error", credentials: "omit" })
        expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${KEY}`)
        expect(JSON.parse(String(init.body))).toEqual({ jsonrpc: "2.0", id: 1, method: "subgraph_deploy", params: { name: "arcade-ledger-arc-testnet", ipfs_hash: CID, version_label: "v0.1.0" } })
        return response()
      }
    })
    expect(await run()).toEqual({ status: "deployed", cid: CID, version: "v0.1.0", queryUrl: QUERY })
    expect(await run()).toEqual({ status: "refused", error: "Studio deployment command refused." })
    expect({ keys, sends }).toEqual({ keys: 1, sends: 1 })
    const text = readFileSync(path, "utf8")
    expect(text).not.toContain(KEY); expect(text.trim().split("\n").map(line => JSON.parse(line).event.phase)).toEqual(["prepared", "dispatch_intent", "completion"])
    expect(statSync(path).mode & 0o777).toBe(0o600)
  }))
  it("existing file, symlink, linked parent or broad permissions refuse before lookup", async () => fixture(async (path, directory) => {
    const { createDeployment } = await runtime(); let keys = 0
    const deps = { readKey: async () => { keys++; return KEY }, fetch: async () => response() }
    writeFileSync(path, "retained", { mode: 0o600, flag: "wx" })
    expect((await createDeployment(options(path), deps)()).status).toBe("refused")
    const alias = join(directory, "alias"); symlinkSync(path, alias)
    expect((await createDeployment(options(alias), deps)()).status).toBe("refused")
    const parentAlias = join(directory, "parent"); symlinkSync(directory, parentAlias)
    expect((await createDeployment(options(join(parentAlias, "fresh")), deps)()).status).toBe("refused")
    chmodSync(directory, 0o755)
    expect((await createDeployment(options(join(directory, "fresh")), deps)()).status).toBe("refused")
    expect(keys).toBe(0); expect(readFileSync(path, "utf8")).toBe("retained")
  }))
  it("concurrent invocations and separate operations sharing one fresh path cannot double dispatch", async () => fixture(async path => {
    const { createDeployment } = await runtime(); let sends = 0
    const deps = { readKey: async () => KEY, fetch: async () => { sends++; return response() } }
    const first = createDeployment(options(path), deps), second = createDeployment(options(path), deps)
    const results = await Promise.all([first(), first(), second()])
    expect(results.map(r => r.status).sort()).toEqual(["deployed", "refused", "refused"]); expect(sends).toBe(1)
  }))
  it("retains unknown dispatch and never follows a redirected/latest/wrong-version outcome", async () => {
    for (const url of [QUERY.replace("v0.1.0", "version/latest"), QUERY.replace("v0.1.0", "v0.1.1"), QUERY.replace("1721684", "123"), `${QUERY}?secret=${KEY}`]) {
      await fixture(async path => {
        const { createDeployment } = await runtime(); let sends = 0
        const run = createDeployment(options(path), { readKey: async () => KEY, fetch: async () => { sends++; return Response.json({ jsonrpc: "2.0", id: 1, result: { queries: url } }) } })
        expect((await run()).status).toBe("unknown"); expect((await run()).status).toBe("refused"); expect(sends).toBe(1)
        expect(readFileSync(path, "utf8")).not.toContain(KEY)
      })
    }
  })
  it("projects rejection code only, never split/encoded provider credentials", async () => fixture(async path => {
    const { createDeployment } = await runtime()
    const result = await createDeployment(options(path), { readKey: async () => KEY, fetch: async () => Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: KEY.slice(0, 16) + " " + KEY.slice(16), data: Buffer.from(KEY).toString("base64") } }) })()
    expect(result).toEqual({ status: "rejected", code: -32000, message: "Studio rejected deployment" })
    const retained = JSON.stringify(result) + readFileSync(path, "utf8")
    expect(retained.replace(/\s/g, "")).not.toContain(KEY); expect(retained).not.toContain(Buffer.from(KEY).toString("base64"))
  }))
})

describe("G6 captured boundary and durable IO", () => {
  it("rejects a non-string credential without coercing it or sending", async () => fixture(async path => {
    const { createDeployment } = await runtime(); let coerced = 0, sends = 0
    const key = { toString() { coerced++; return KEY } }
    const result = await createDeployment(options(path), { readKey: async () => key as unknown as string, fetch: async () => { sends++; return response() } })()
    expect(result.status).toBe("refused"); expect(coerced).toBe(0); expect(sends).toBe(0)
  }))
  it("rejects an asynchronous journal sync instead of treating it as durable", async () => fixture(async path => {
    const { createDeployment } = await runtime(); let keys = 0, sends = 0
    const result = await createDeployment(options(path), { readKey: async () => { keys++; return KEY }, fetch: async () => { sends++; return response() }, journalIO: { sync: async () => {} } })()
    expect(result.status).toBe("refused"); expect(keys).toBe(0); expect(sends).toBe(0)
  }))
  it("captures policy, transport and hooks before caller mutation", async () => fixture(async path => {
    const { createDeployment } = await runtime(); let sends = 0
    const input = options(path), deps = { readKey: async () => KEY, fetch: async () => { sends++; return response() } }
    const run = createDeployment(input, deps)
    input.cid = SMOKE; deps.fetch = async () => { throw Error("PRIVATE_MUTATION") }
    expect((await run()).status).toBe("deployed"); expect(sends).toBe(1)
  }))
  it("fixes proxy/getter diagnostics without executing own accessors", async () => {
    const { createDeployment, parseDeployArgs } = await runtime(); let touched = 0
    for (const trap of ["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor"]) {
      const proxy = new Proxy(options("/private/tmp/owned/x"), { [trap]() { throw Error(KEY) } })
      expect(() => createDeployment(proxy)).toThrow("Studio deployment command refused.")
    }
    expect(() => createDeployment(options("/private/tmp/owned/x"), Object.defineProperty({}, "readKey", { get() { touched++; throw Error(KEY) } }))).toThrow("Studio deployment command refused.")
    expect(() => parseDeployArgs(new Proxy([], { getPrototypeOf() { throw Error(KEY) } }))).toThrow("Studio deployment command refused.")
    expect(touched).toBe(0)
  })
  it("keeps a partial preparation write and refuses before key lookup", async () => fixture(async path => {
    const { createDeployment } = await runtime(); let writes = 0, keys = 0
    const result = await createDeployment(options(path), { readKey: async () => { keys++; return KEY }, fetch: async () => response(), journalIO: {
      write(fd, bytes, offset, length) { if (++writes === 1) return writeSync(fd, bytes, offset, Math.min(7, length)); throw Error("PRIVATE_IO") }
    } })()
    expect(result.status).toBe("refused"); expect(keys).toBe(0); expect(statSync(path).size).toBe(7)
    expect((await createDeployment(options(path), { readKey: async () => { keys++; return KEY } })()).status).toBe("refused"); expect(keys).toBe(0)
  }))
  it("fails closed on preparation/intent/completion fsync failures and close uncertainty", async () => {
    for (const syncFailure of [1, 2, 3, 4, 5, 6]) await fixture(async path => {
      const { createDeployment } = await runtime(); let syncs = 0, keys = 0, sends = 0
      const result = await createDeployment(options(path), { readKey: async () => { keys++; return KEY }, fetch: async () => { sends++; return response() }, journalIO: {
        sync(fd) { if (++syncs === syncFailure) throw Error("PRIVATE_SYNC"); fsyncSync(fd) }
      } })()
      expect(result.status).toBe(syncFailure <= 4 ? "refused" : "unknown")
      expect(keys).toBe(syncFailure <= 2 ? 0 : 1); expect(sends).toBe(syncFailure <= 4 ? 0 : 1)
      expect(readFileSync(path, "utf8")).not.toContain("PRIVATE_SYNC")
    })
    await fixture(async path => {
      const { createDeployment } = await runtime(); let closes = 0
      const result = await createDeployment(options(path), { readKey: async () => KEY, fetch: async () => response(), journalIO: {
        close(fd) { closeSync(fd); if (++closes === 1) throw Error("PRIVATE_CLOSE") }
      } })()
      expect(result.status).toBe("unknown"); expect(closes).toBe(2)
    })
  })
  it("refuses a newly hard-linked or replaced journal after key lookup", async () => {
    for (const mutation of ["hardlink", "replace"] as const) await fixture(async (path, directory) => {
      const { createDeployment } = await runtime(); let sends = 0
      const result = await createDeployment(options(path), { readKey: async () => {
        if (mutation === "hardlink") linkSync(path, join(directory, "alias"))
        else { rmSync(path); writeFileSync(path, "replacement", { mode: 0o600, flag: "wx" }) }
        return KEY
      }, fetch: async () => { sends++; return response() } })()
      expect(result.status).toBe("refused"); expect(sends).toBe(0)
    })
  })
  it("retains a self-consistent hash chain containing only public policy/results", async () => fixture(async path => {
    const { createDeployment } = await runtime()
    expect((await createDeployment(options(path), { readKey: async () => KEY, fetch: async () => response() })()).status).toBe("deployed")
    let previous = "0".repeat(64), sequence = 0
    for (const line of readFileSync(path, "utf8").trim().split("\n")) {
      const { hash, ...row } = JSON.parse(line)
      expect(row.previousHash).toBe(previous); expect(row.sequence).toBe(sequence++)
      expect(hash).toBe(createHash("sha256").update(JSON.stringify(row)).digest("hex")); previous = hash
      expect(row.policy).toEqual({ endpoint: "https://api.studio.thegraph.com/deploy", name: "arcade-ledger-arc-testnet", cid: CID, version: "v0.1.0", queryUrl: QUERY })
    }
    expect(sequence).toBe(3)
  }))
})

describe("G6 bounded single transport", () => {
  it("has no late key lookup or dispatch after cancellation during durable IO", async () => {
    for (const abortAt of [2, 4]) await fixture(async path => {
      const { createDeployment } = await runtime(); const controller = new AbortController(); let syncs = 0, keys = 0, sends = 0
      const result = await createDeployment(options(path), { signal: controller.signal, readKey: async () => { keys++; return KEY }, fetch: async () => { sends++; return response() }, journalIO: {
        sync(fd) { fsyncSync(fd); if (++syncs === abortAt) controller.abort(Error(KEY)) }
      } })()
      expect(result.status).toBe("refused"); expect(keys).toBe(abortAt === 2 ? 0 : 1); expect(sends).toBe(0)
    })
  })
  it("checks elapsed deadline after synchronous durable IO, before key lookup", async () => fixture(async path => {
    const { createDeployment } = await runtime(); let keys = 0
    const result = await createDeployment(options(path), { timeoutMs: 5, readKey: async () => { keys++; return KEY }, journalIO: {
      sync(fd) { fsyncSync(fd); const end = performance.now() + 8; while (performance.now() < end) {} }
    } })()
    expect(result.status).toBe("refused"); expect(keys).toBe(0)
  }))
  it("ignores a late credential and cancels a late response without a second POST", async () => {
    await fixture(async path => {
      const { createDeployment } = await runtime(); let finish!: (key: string) => void, sends = 0
      const result = await createDeployment(options(path), { timeoutMs: 10, readKey: () => new Promise(r => { finish = r }), fetch: async () => { sends++; return response() } })()
      expect(result.status).toBe("refused"); finish(KEY); await new Promise(r => setTimeout(r, 5)); expect(sends).toBe(0)
    })
    await fixture(async path => {
      const { createDeployment } = await runtime(); let finish!: (r: Response) => void, sends = 0, cancelled = 0
      const run = createDeployment(options(path), { timeoutMs: 10, readKey: async () => KEY, fetch: () => { sends++; return new Promise(r => { finish = r }) } })
      expect((await run()).status).toBe("unknown")
      finish(new Response(new ReadableStream({ cancel() { cancelled++ } }), { headers: { "content-type": "application/json" } }))
      await new Promise(r => setTimeout(r, 5)); expect(cancelled).toBe(1); expect((await run()).status).toBe("refused"); expect(sends).toBe(1)
    })
  })
  it("bounds a stalled body and uncooperative cancellation", async () => fixture(async path => {
    const { createDeployment } = await runtime(); let cancelled = 0
    const start = performance.now()
    const result = await createDeployment(options(path), { timeoutMs: 15, readKey: async () => KEY, fetch: async () => new Response(new ReadableStream({
      pull() { return new Promise(() => {}) }, cancel() { cancelled++; return new Promise(() => {}) }
    }), { headers: { "content-type": "application/json" } }) })()
    expect(result.status).toBe("unknown"); expect(cancelled).toBe(1); expect(performance.now() - start).toBeLessThan(500)
    expect(readFileSync(path, "utf8")).toContain('"phase":"dispatch_intent"')
  }))
  it("bounds empty-chunk storms without relying solely on timer fairness", async () => fixture(async path => {
    const { createDeployment } = await runtime(); let pulls = 0
    const result = await createDeployment(options(path), { timeoutMs: 500, readKey: async () => KEY, fetch: async () => new Response(new ReadableStream({
      pull(c) { if (++pulls > 10_000) c.close(); else c.enqueue(new Uint8Array()) }
    }), { headers: { "content-type": "application/json" } }) })()
    expect(result.status).toBe("unknown"); expect(pulls).toBeLessThanOrEqual(1027)
  }))
  it("requires exact framing, UTF-8, envelope and endpoint while never reflecting malformed bytes", async () => {
    const good = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { queries: QUERY } })
    const cases: (() => Response)[] = [
      () => new Response(good, { status: 307, headers: { location: "https://other.invalid/", "content-type": "application/json" } }),
      () => new Response(good, { headers: { "content-type": "text/plain" } }),
      () => new Response(good, { headers: { "content-type": "application/json", "content-encoding": "gzip" } }),
      ...[String(good.length - 1), String(good.length + 1), "01", "16385"].map(length => () => new Response(good, { headers: { "content-type": "application/json", "content-length": length } })),
      () => new Response(new Uint8Array([0xc3]), { headers: { "content-type": "application/json" } }),
      () => new Response(" ".repeat(16385), { headers: { "content-type": "application/json" } }),
      ...[{ jsonrpc: "2.0", id: 2, result: { queries: QUERY } }, { jsonrpc: "2.0", id: 1, result: { queries: QUERY }, error: { code: -1, message: KEY } }, { jsonrpc: "2.0", id: 1, result: { queries: QUERY }, token: KEY }, { jsonrpc: "2.0", id: 1, error: { code: 1.5, message: KEY } }].map(body => () => Response.json(body)),
      () => Object.defineProperty(response(), "url", { value: "https://other.invalid/" }),
      () => Object.defineProperty(response(), "redirected", { value: true })
    ]
    for (const make of cases) await fixture(async path => {
      const { createDeployment } = await runtime(); let sends = 0
      const run = createDeployment(options(path), { readKey: async () => KEY, fetch: async () => { sends++; return make() } })
      expect((await run()).status).toBe("unknown"); expect((await run()).status).toBe("refused"); expect(sends).toBe(1)
      expect(readFileSync(path, "utf8")).not.toContain(KEY)
    })
  })
  it("accepts exactly 16 KiB and clones each source chunk before further reads", async () => {
    const text = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { queries: QUERY } })
    await fixture(async path => {
      const { createDeployment } = await runtime()
      expect((await createDeployment(options(path), { readKey: async () => KEY, fetch: async () => new Response(text.padEnd(16384, " "), { headers: { "content-type": "application/json", "content-length": "16384" } }) })()).status).toBe("deployed")
    })
    await fixture(async path => {
      const { createDeployment } = await runtime(); const bytes = new TextEncoder().encode(text); let reads = 0
      const result = await createDeployment(options(path), { readKey: async () => KEY, fetch: async () => new Response(new ReadableStream({
        pull(c) { if (++reads === 1) c.enqueue(bytes); else { bytes.fill(0); c.close() } }
      }, { highWaterMark: 0 }), { headers: { "content-type": "application/json" } }) })()
      expect(result.status).toBe("deployed")
    })
  })
})

describe("G6 actual isolated child ownership and inert entry", () => {
  it("operation cancellation waits for its actual native key-reader child cleanup", async () => fixture(async path => {
    const { createDeployment, readDeploymentKey } = await runtime(); const controller = new AbortController()
    let child: ChildProcess | undefined, closed = false, sends = 0
    let finishClose!: () => void; const close = new Promise<void>(r => { finishClose = r })
    const synthetic = ((_file: string, _args: string[], options: unknown) => {
      child = spawn(process.execPath, ["--no-env-file", "-e", `process.on('SIGTERM',()=>{});process.stdout.write(${JSON.stringify(KEY)});setInterval(()=>{},1000)`], options as Parameters<typeof spawn>[2])
      child.once("close", () => { closed = true; finishClose() }); child.stdout!.once("data", () => controller.abort(Error(KEY))); return child
    }) as typeof spawn
    const fuse = setTimeout(() => child?.kill("SIGKILL"), 2000)
    try {
      const result = await createDeployment(options(path), { signal: controller.signal, readKey: signal => readDeploymentKey(signal, synthetic), fetch: async () => { sends++; return response() } })()
      expect(result.status).toBe("refused"); expect(closed).toBe(true); expect(sends).toBe(0); expect(child?.signalCode).toBe("SIGKILL")
    } finally { if (child) await close; clearTimeout(fuse) }
  }))
  it("an injected key reader cannot make aborted operation cleanup unbounded", async () => fixture(async path => {
    const { createDeployment } = await runtime(); let sends = 0
    const start = performance.now()
    const result = await createDeployment(options(path), { timeoutMs: 10, readKey: () => new Promise(() => {}), fetch: async () => { sends++; return response() } })()
    expect(result.status).toBe("refused"); expect(sends).toBe(0); expect(performance.now() - start).toBeLessThan(800)
  }))
  it("uses exact Keychain argv/empty environment but only executes a synthetic key child here", async () => {
    const { readDeploymentKey } = await runtime(); let child: ChildProcess | undefined, closed = false
    const synthetic = ((file: string, args: string[], options: unknown) => {
      expect(file).toBe("/usr/bin/security")
      expect(args).toEqual(["find-generic-password", "-s", "arcade-graph-deploy-key", "-a", "GRAPH_DEPLOY_KEY", "-w"])
      expect(options).toEqual({ env: {}, stdio: ["ignore", "pipe", "ignore"] })
      child = spawn(process.execPath, ["--no-env-file", "-e", `process.stdout.write(${JSON.stringify(KEY + "\n")})`], options as Parameters<typeof spawn>[2])
      child.once("close", () => { closed = true }); return child
    }) as typeof spawn
    expect(await readDeploymentKey(new AbortController().signal, synthetic)).toBe(KEY)
    expect(closed).toBe(true); expect(child?.exitCode).toBe(0)
  })
  it("aborts and reaps an actual owned child that ignores TERM before returning refusal", async () => {
    const { readDeploymentKey } = await runtime(); const controller = new AbortController(); let child: ChildProcess | undefined, closed = false
    const synthetic = ((_file: string, _args: string[], options: unknown) => {
      child = spawn(process.execPath, ["--no-env-file", "-e", `process.on('SIGTERM',()=>{});process.stdout.write(${JSON.stringify(KEY)});setInterval(()=>{},1000)`], options as Parameters<typeof spawn>[2])
      child.once("close", () => { closed = true }); child.stdout!.once("data", () => controller.abort(Error(KEY))); return child
    }) as typeof spawn
    await expect(readDeploymentKey(controller.signal, synthetic)).rejects.toThrow("Studio deployment credential unavailable.")
    expect(closed).toBe(true); expect(child?.signalCode).toBe("SIGKILL")
  })
  it("caps synthetic child output and refuses before spawning when already cancelled", async () => {
    const { readDeploymentKey } = await runtime(); let spawns = 0, closed = false
    const synthetic = ((_file: string, _args: string[], options: unknown) => {
      spawns++; const child = spawn(process.execPath, ["--no-env-file", "-e", "process.stdout.write('x'.repeat(1024));setInterval(()=>{},1000)"], options as Parameters<typeof spawn>[2])
      child.once("close", () => { closed = true }); return child
    }) as typeof spawn
    await expect(readDeploymentKey(new AbortController().signal, synthetic)).rejects.toThrow("Studio deployment credential unavailable.")
    expect(closed).toBe(true)
    const controller = new AbortController(); controller.abort(Error(KEY))
    await expect(readDeploymentKey(controller.signal, synthetic)).rejects.toThrow("Studio deployment credential unavailable.")
    expect(spawns).toBe(1)
  })
  it("the actual key-reader deadline stops and reaps a silent synthetic child", async () => {
    const { readDeploymentKey } = await runtime(); let child: ChildProcess | undefined, closed = false
    const synthetic = ((_file: string, _args: string[], options: unknown) => {
      child = spawn(process.execPath, ["--no-env-file", "-e", "setInterval(()=>{},1000)"], options as Parameters<typeof spawn>[2])
      child.once("close", () => { closed = true }); return child
    }) as typeof spawn
    const start = performance.now()
    await expect(readDeploymentKey(new AbortController().signal, synthetic)).rejects.toThrow("Studio deployment credential unavailable.")
    expect(performance.now() - start).toBeLessThan(3500); expect(closed).toBe(true); expect(child?.signalCode).toBe("SIGTERM")
  })
  it("actual import/help/invalid invocation is inert with hostile ambient selectors", async () => {
    const module = new URL("./graph-deploy.ts", import.meta.url).pathname
    for (const args of [["-e", `await import(${JSON.stringify(module)}); console.log('INERT_IMPORT_OK')`], [module, "--help"], [module, "--key", "PRIVATE_ARG_SENTINEL"]]) {
      const child = Bun.spawn([process.execPath, "--no-env-file", ...args], { env: { ARCADE_NETWORK: "PRIVATE_AMBIENT_SENTINEL" }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
      let fired = false
      const timer = setTimeout(() => { fired = true; child.kill("SIGKILL") }, 3000)
      const boundedText = async (stream: ReadableStream<Uint8Array>) => {
        const reader = stream.getReader(); let text = "", count = 0
        while (true) { const part = await reader.read(); if (part.done) return text; count += part.value.length; if (count > 4096) { child.kill("SIGKILL"); throw Error("Owned output cap") }; text += new TextDecoder().decode(part.value) }
      }
      try {
        const [stdout, stderr, code] = await Promise.all([boundedText(child.stdout), boundedText(child.stderr), child.exited])
        expect(code).toBe(args[1] === "--key" ? 2 : 0); expect(stderr).toBe(""); expect(fired).toBe(false)
        expect(stdout).not.toContain("PRIVATE_"); expect(stdout).not.toContain(KEY)
        expect(stdout).toContain(args[0] === "-e" ? "INERT_IMPORT_OK" : args[1] === "--help" ? "Usage:" : "Studio deployment command refused.")
      } finally { if (child.exitCode === null) child.kill("SIGKILL"); await child.exited; clearTimeout(timer) }
    }
  })
})

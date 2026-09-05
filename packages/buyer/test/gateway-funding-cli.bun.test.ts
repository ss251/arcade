import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const within = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Owned CLI fixture deadline")), ms) })]) }
  finally { if (timer !== undefined) clearTimeout(timer) }
}
async function child(args: readonly string[]) {
  const owned = Bun.spawn([process.execPath, "--no-env-file", ...args], {
    cwd: root, env: { PATH: "" }, stdin: "ignore", stdout: "pipe", stderr: "pipe"
  })
  const read = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader(); let text = "", size = 0
    try { for (;;) { const next = await reader.read(); if (next.done) return text
      size += next.value.byteLength; if (size > 16384) throw Error("Owned CLI output bound")
      text += new TextDecoder().decode(next.value)
    } } finally { reader.releaseLock() }
  }
  const drains = Promise.all([read(owned.stdout), read(owned.stderr)]); void drains.catch(() => {})
  try {
    const exit = await within(owned.exited, 4000), [stdout, stderr] = await within(drains, 1000)
    return { exit, stdout, stderr }
  } finally {
    if (owned.exitCode === null && owned.signalCode === null) {
      owned.kill("SIGTERM")
      try { await within(owned.exited, 500) } catch { owned.kill("SIGKILL"); await within(owned.exited, 1000) }
    }
    await within(drains, 1000)
    if (owned.exitCode === null && owned.signalCode === null) throw Error("Owned child not reaped")
  }
}

test("legacy buyer entry is import-safe and cannot consume a key or dispatch on import", async () => {
  const out = await child(["-e", `globalThis.fetch = () => { throw Error("NETWORK_FORBIDDEN") }; await import(${JSON.stringify(cli)}); console.log("IMPORT_INERT")`])
  expect(out).toEqual({ exit: 0, stdout: "IMPORT_INERT\n", stderr: "" })
})

test("reserved funding typo refuses before the legacy key parser without reflecting input", async () => {
  const out = await child([cli, "gateway-not-a-command", "--private-unexpected", "DUMMY_PRIVATE_SENTINEL"])
  expect(out.exit).toBe(2)
  expect(out.stdout + out.stderr).toContain("funding_input_invalid")
  expect(out.stdout + out.stderr).not.toMatch(/ARCADE_BUYER_KEY|DUMMY_PRIVATE_SENTINEL|private-unexpected/)
})

const ADDRESS = `0x${"12".repeat(20)}` as `0x${string}`
test("strict parser preserves exact amount versus target, explicit gas/fee/height and expected account", async () => {
  const { parseFundingCommand } = await import("../src/gateway-funding-cli.ts")
  const base = ["--address", ADDRESS, "--journal", "/tmp/owned/facts.jsonl", "--gas-cap-wei", "123"]
  expect(parseFundingCommand(["gateway-deposit", ...base, "--amount", "1.000001"])).toMatchObject({ kind: "deposit", authority: { account: ADDRESS },
    request: { kind: "deposit", mode: "exact", amount: 1000001n, gasCapWei: 123n } })
  expect(parseFundingCommand(["gateway-deposit", ...base, "--minimum-available", "0", "--max-deposit", "0"])).toMatchObject({ request: {
    kind: "deposit", mode: "target", minimumAvailable: 0n, maxDeposit: 0n, gasCapWei: 123n } })
  expect(parseFundingCommand(["gateway-withdraw", ...base, "--amount", "0.1", "--fee-cap", "0", "--max-burn-block-delta", "99"])).toMatchObject({ request: {
    kind: "withdrawal", amount: 100000n, maxFee: 0n, maxBurnBlockDelta: 99n, gasCapWei: 123n } })
})

test("strict parser refuses missing/conflicting/duplicate/unknown flags and coercions without getters", async () => {
  const { parseFundingCommand } = await import("../src/gateway-funding-cli.ts")
  const base = ["gateway-deposit", "--address", ADDRESS, "--journal", "/tmp/owned/facts.jsonl", "--amount", "0.1", "--gas-cap-wei", "123"]
  const malformed = [[], ["gateway-withdraw"], [...base, "--amount", "0.2"], [...base, "--minimum-available", "1", "--max-deposit", "1"],
    [...base, "--key", "DUMMY_PRIVATE_SENTINEL"], [...base, "extra"], ["gateway-balance", "--address", `0x${"00".repeat(20)}`],
    ["gateway-balance", "--address", ADDRESS, "--journal", "/tmp/x"], ["gateway-reconcile", "--address", ADDRESS, "--journal", "relative"],
    ["gateway-finalize", "--address", ADDRESS, "--journal", "/tmp/a/../b"]]
  for (const args of malformed) expect(() => parseFundingCommand(args)).toThrow("funding_input_invalid")
  for (const amount of ["01", "1e3", " 1", "1.0000001", "0", "-1", "+1", "$1"]) {
    const args = [...base]; args[6] = amount
    expect(() => parseFundingCommand(args)).toThrow("funding_input_invalid")
  }
  let reads = 0; const accessor = ["gateway-balance", "--address", ADDRESS]
  Object.defineProperty(accessor, "2", { get() { reads++; return ADDRESS } })
  expect(() => parseFundingCommand(accessor)).toThrow("funding_input_invalid"); expect(reads).toBe(0)
})

for (const path of ["/tmp/owned/facts.txt", "/tmp/owned/tab\tname.jsonl"]) test("journal extension/control policy refuses before runtime selection", async () => {
  const { fundingMain } = await import("../src/gateway-funding-cli.ts")
  let imports = 0; const lines: string[] = []
  const code = await fundingMain(["gateway-reconcile", "--address", ADDRESS, "--journal", path], { role: "buyer", env: {},
    runtime: async () => { imports++; throw Error("RUNTIME_FORBIDDEN") }, write: async line => { lines.push(line) } })
  expect(imports).toBe(0); expect(code).toBe(2); expect(lines).toEqual(["funding_input_invalid"])
})

test("actual help and invalid seller entry remain keyless and return fixed diagnostics", async () => {
  const withdraw = fileURLToPath(new URL("../../../scripts/gateway-withdraw.ts", import.meta.url))
  for (const entry of [cli, withdraw]) {
    const help = await child([entry, "--help"])
    expect(help.exit).toBe(0); expect(help.stdout).toContain("--address"); expect(help.stderr).toBe("")
    const invalid = await child([entry, "--key", "DUMMY_PRIVATE_SENTINEL"])
    expect(invalid.exit).toBe(2); expect(invalid.stdout + invalid.stderr).not.toContain("DUMMY_PRIVATE_SENTINEL")
  }
})

test("owning-process fuse covers a stalled final cleanup without reflecting its diagnostic", async () => {
  const module = fileURLToPath(new URL("../src/gateway-funding-cli.ts", import.meta.url))
  const out = await child(["-e", `const {runOwnedFundingCli}=await import(${JSON.stringify(module)}); await runOwnedFundingCli(async()=>{try{return 0}finally{await new Promise(()=>{})}},30)`])
  expect(out.exit).toBe(124); expect(out.stderr).toContain("funding_deadline_exceeded"); expect(out.stdout).toBe("")
})

test("session batch uses only frozen Promise methods and stops uncertain calls without implicit close or replay", async () => {
  const { createSessionCliController, parseSessionCommand } = await import("../src/session-cli.ts")
  const command = parseSessionCommand(["session", "--hub", "http://127.0.0.1:8787", "--address", ADDRESS, "--budget", "1", "--calls", "2", "--skill", "flow", "--seller", "service", "--rail", "test", "--input", "{}"])
  let opens = 0, calls = 0, closes = 0, keys = 0
  const controller = createSessionCliController(command, {
    signal: new AbortController().signal, deadlineMs: performance.now() + 1000,
    acquireAccount: async () => { keys++; return { address: ADDRESS, type: "json-rpc" } },
    open: async () => { opens++; return { id: `ses_${"ab".repeat(16)}`, buyer: ADDRESS, network: "eip155:5042002", rail: "test", budgetAtomic: 1000000n,
      quote: async () => { throw Error("No advisory request needed") },
      call: async () => { calls++; throw Error("PRIVATE_UNCERTAIN_CALL") },
      status: async () => { throw Error("PRIVATE_STATUS") },
      close: async () => { closes++; throw Error("UNREQUESTED_CLOSE") }
    } }
  })
  expect(await controller.run()).toMatchObject({ status: "uncertain", completedCalls: 0 })
  expect(await controller.run()).toMatchObject({ status: "refused" })
  expect({ opens, calls, closes, keys }).toEqual({ opens: 1, calls: 1, closes: 0, keys: 1 })
})

test("session closed recovery is explicit status-only on retained private handle", async () => {
  const { createSessionCliController, parseSessionCommand } = await import("../src/session-cli.ts")
  const command = parseSessionCommand(["session", "--hub", "http://127.0.0.1:8787", "--address", ADDRESS, "--budget", "1", "--calls", "1", "--skill", "flow", "--seller", "service", "--rail", "test", "--input", "{}"])
  const id = `ses_${"ab".repeat(16)}`, jobId = `job_${"ab".repeat(16)}`, ref = `0xtest${"ab".repeat(16)}`
  const receipt = { sessionId: id, buyer: ADDRESS, rail: "test" as const, network: "eip155:5042002", budgetAtomic: "1000000", spentAtomic: "100000", heldAtomic: "0",
    calls: [{ jobId, skillId: "flow", priceAtomic: "100000", state: "settled" as const, settled: true, settleRef: ref, settleRefKind: "test" as const, createdAtMs: 1500 }],
    settledCalls: 1, settlementRefs: [ref], complete: true as const, openedAtMs: 1000, closedAtMs: 2000 }
  let closes = 0, reads = 0
  const identity = { id, buyer: ADDRESS, network: "eip155:5042002", rail: "test" as const, budgetAtomic: 1000000n }
  const controller = createSessionCliController(command, {
    signal: new AbortController().signal, deadlineMs: performance.now() + 1000, acquireAccount: async () => ({ address: ADDRESS, type: "json-rpc" }),
    open: async () => ({ ...identity,
      quote: async () => { throw Error("No advisory request needed") },
      call: async () => ({ jobId, status: "succeeded", result: { private: "OMIT_RAW_OUTPUT" }, receipt: { settled: true }, authorizedAmountAtomic: 100000n, fencedResult: "fixture" }),
      close: async () => { closes++; throw Error("LOST_CLOSE") },
      status: async () => { reads++; return { ...identity, closed: true, complete: true, spentAtomic: 100000n, heldAtomic: 0n, remainingAtomic: 900000n,
        calls: receipt.calls, localIssuedAtomic: 100000n, localConfirmedAtomic: 100000n, localExposureAtomic: 0n, closedReceipt: receipt } }
    })
  })
  expect(await controller.run()).toMatchObject({ status: "uncertain" })
  expect({ closes, reads }).toEqual({ closes: 1, reads: 0 })
  const recovered = await controller.recoverClosed()
  expect(recovered).toMatchObject({ status: "closed", receipt })
  expect(JSON.stringify(recovered)).not.toContain("OMIT_RAW_OUTPUT")
  expect({ closes, reads }).toEqual({ closes: 1, reads: 1 })
})

test("session controller captures its exact command and input before any key await", async () => {
  const { createSessionCliController, parseSessionCommand } = await import("../src/session-cli.ts")
  const parsed = parseSessionCommand(["session", "--hub", "http://127.0.0.1:8787", "--address", ADDRESS, "--budget", "1", "--calls", "1", "--skill", "flow", "--seller", "service", "--rail", "test", "--input", "{}"])
  const command = { ...parsed, input: { value: "original" } }
  let release!: () => void, entered!: () => void; const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
  const observed: unknown[] = []
  const controller = createSessionCliController(command, { signal: new AbortController().signal, deadlineMs: performance.now() + 1000,
    acquireAccount: async () => { entered(); await gate; return { address: ADDRESS, type: "json-rpc" } },
    open: async () => ({ id: `ses_${"ab".repeat(16)}`, buyer: ADDRESS, rail: "test", network: "eip155:5042002", budgetAtomic: 1000000n,
      quote: async () => { throw Error() }, status: async () => { throw Error() }, close: async () => { throw Error() },
      call: async args => { observed.push(args); throw Error("UNCERTAIN") } }) })
  const pending = controller.run(); await started
  try { command.seller = "changed"; command.input.value = "changed"; release(); await pending
    expect(observed).toHaveLength(1); expect(observed[0]).toMatchObject({ seller: "service", input: { value: "original" } })
  } finally { release(); await pending }
})

test("actual injected read-only child commands have no signer or mutation fallback", async () => {
  const module = fileURLToPath(new URL("../src/gateway-funding-cli.ts", import.meta.url))
  const out = await child(["-e", `
    globalThis.fetch = () => { throw Error("NETWORK_FORBIDDEN") };
    const {fundingMain}=await import(${JSON.stringify(module)});
    let keys=0, mutations=0, calls=0, signerOptions=0; const output=[];
    const env=new Proxy({}, {get(_t,k){if(k==="ARCADE_BUYER_KEY"||k==="ARCADE_SELLER_KEY"){keys++;throw Error("PRIVATE_KEY_ACCESS")} return undefined}});
    const runtime=async()=>({createFundingDependencies(o){if("acquireSigner"in o)signerOptions++;return o},
      createFundingOperation(){mutations++;throw Error("MUTATION_FORBIDDEN")},
      inspectFunding:async()=>{calls++;return {status:"observed",facts:{account:${JSON.stringify(ADDRESS)},network:"eip155:5042002",walletTokenBalance:1n,pending:null}}},
      reconcileFundingOperation:async()=>{calls++;return {status:"uncertain",code:"operation_uncertain",facts:{}}},
      finalizeFundingOperation:async()=>{calls++;return {status:"confirmed",facts:{terminalKind:"unsigned_refusal"}}}});
    const context={env,role:"buyer",runtime,write:async(line,error)=>output.push({line,error})};
    const codes=[];
    codes.push(await fundingMain(["gateway-balance","--address",${JSON.stringify(ADDRESS)}],context));
    codes.push(await fundingMain(["gateway-reconcile","--address",${JSON.stringify(ADDRESS)},"--journal","/tmp/owned/facts.jsonl"],context));
    codes.push(await fundingMain(["gateway-finalize","--address",${JSON.stringify(ADDRESS)},"--journal","/tmp/owned/facts.jsonl"],context));
    console.log(JSON.stringify({codes,keys,mutations,calls,signerOptions,output}));
  `])
  expect(out.exit).toBe(0); expect(out.stderr).toBe("")
  const proof = JSON.parse(out.stdout)
  expect(proof).toMatchObject({ codes: [0, 1, 0], keys: 0, mutations: 0, calls: 3, signerOptions: 0 })
  expect(out.stdout).not.toMatch(/PRIVATE_KEY_ACCESS|NETWORK_FORBIDDEN|MUTATION_FORBIDDEN/)
})

test("withdrawal mints only after validated mint_ready and cleanup failure cannot print success", async () => {
  const module = fileURLToPath(new URL("../src/gateway-funding-cli.ts", import.meta.url))
  for (const mode of ["ready", "uncertain", "malformed", "close-failure"] as const) {
    const out = await child(["-e", `
      const {fundingMain}=await import(${JSON.stringify(module)}); const mode=${JSON.stringify(mode)};
      let requests=0,mints=0,closes=0,keys=0; const output=[];
      const env=new Proxy({}, {get(_t,k){if(k==="ARCADE_BUYER_KEY"){keys++;throw Error("PRIVATE_KEY_ACCESS")}return undefined}});
      const partial={status:"uncertain",facts:{}};
      const operation={executeDepositOnce:async()=>{throw Error("WRONG_STAGE")},
        requestWithdrawalOnce:async()=>{requests++;return mode==="uncertain"?partial:mode==="malformed"?{status:"mint_ready",facts:{attestation:"PRIVATE_CAPABILITY"}}:{status:"mint_ready",facts:{}}},
        mintWithdrawalOnce:async()=>{mints++;return {status:"confirmed",facts:{terminalKind:"withdrawal_complete"}}},
        reconcileOperationReadOnly:async()=>partial,publicState:()=>partial,close:async()=>{closes++;if(mode==="close-failure")throw Error("PRIVATE_CLOSE")}};
      const runtime=async()=>({createFundingDependencies:o=>o,createFundingOperation:()=>operation,
        inspectFunding:async()=>partial,reconcileFundingOperation:async()=>partial,finalizeFundingOperation:async()=>partial});
      const code=await fundingMain(["gateway-withdraw","--address",${JSON.stringify(ADDRESS)},"--journal","/tmp/owned/facts.jsonl","--amount","0.1","--fee-cap","0","--max-burn-block-delta","10","--gas-cap-wei","1"],
        {env,role:"buyer",runtime,write:async(line,error)=>output.push({line,error})}).catch(()=>1);
      console.log(JSON.stringify({code,requests,mints,closes,keys,output}));
    `])
    expect(out.exit).toBe(0); expect(out.stderr).toBe("")
    const proof = JSON.parse(out.stdout)
    expect(proof).toMatchObject({ code: mode === "ready" ? 0 : 1, requests: 1, mints: mode === "ready" || mode === "close-failure" ? 1 : 0, keys: 0 })
    expect(proof.closes).toBeGreaterThanOrEqual(1)
    expect(out.stdout).not.toMatch(/PRIVATE_CAPABILITY|PRIVATE_KEY_ACCESS|PRIVATE_CLOSE/)
    if (mode === "close-failure") expect(proof.output).not.toEqual(expect.arrayContaining([expect.objectContaining({ error: false })]))
  }
})

test("session main refuses a contradictory network before its lazy key getter", async () => {
  const { sessionMain } = await import("../src/session-cli.ts")
  let keys = 0; const output: string[] = []
  const code = await sessionMain(["session", "--hub", "http://127.0.0.1:8787", "--address", ADDRESS, "--budget", "1", "--calls", "1", "--skill", "flow", "--seller", "service", "--rail", "test", "--input", "{}"], {
    role: "buyer", env: { ARCADE_NETWORK: "arc-mainnet", get ARCADE_BUYER_KEY(): string { keys++; throw Error("PRIVATE_KEY_GETTER") } }, write: async line => { output.push(line) }
  })
  expect(keys).toBe(0); expect(code).toBe(2); expect(output.join()).not.toContain("PRIVATE_KEY_GETTER")
})

test("exported funding main keeps a rejecting cleanup diagnostic private", async () => {
  const module = fileURLToPath(new URL("../src/gateway-funding-cli.ts", import.meta.url))
  const out = await child(["-e", `
    const {fundingMain}=await import(${JSON.stringify(module)}); const output=[];
    const result={status:"uncertain",facts:{}};
    const operation={executeDepositOnce:async()=>result,requestWithdrawalOnce:async()=>result,mintWithdrawalOnce:async()=>result,
      publicState:()=>result,reconcileOperationReadOnly:async()=>result,close:async()=>{throw Error("PRIVATE_CLOSE_DIAGNOSTIC")}};
    const runtime=async()=>({createFundingDependencies:o=>o,createFundingOperation:()=>operation});
    try { const code=await fundingMain(["gateway-deposit","--address",${JSON.stringify(ADDRESS)},"--journal","/tmp/owned/facts.jsonl","--amount","0.1","--gas-cap-wei","1"],
      {env:{},role:"buyer",runtime,write:async(line,error)=>output.push({line,error})});console.log(JSON.stringify({code,output})); }
    catch { console.log(JSON.stringify({rejected:true})); }
  `])
  expect(out.exit).toBe(0)
  expect(JSON.parse(out.stdout)).toMatchObject({ code: 1, output: [{ error: true }] })
  expect(out.stdout + out.stderr).not.toContain("PRIVATE_CLOSE_DIAGNOSTIC")
})

for (const mode of ["amount", "order", "valid"] as const) test(`session receipt binds local confirmed calls: ${mode}`, async () => {
  const { createSessionCliController, parseSessionCommand } = await import("../src/session-cli.ts")
  const command = parseSessionCommand(["session", "--hub", "http://127.0.0.1:8787", "--address", ADDRESS, "--budget", "1", "--calls", "2", "--skill", "flow", "--seller", "service", "--rail", "test", "--input", "{}"])
  const id = `ses_${"ab".repeat(16)}`, jobs = [`job_${"ab".repeat(16)}`, `job_${"cd".repeat(16)}`], refs = [`0xtest${"ab".repeat(16)}`, `0xtest${"cd".repeat(16)}`]
  const amounts = [100000n, 200000n]; let calls = 0
  const report = jobs.map((jobId, i) => ({ jobId, skillId: "flow", priceAtomic: String(mode === "amount" && i === 0 ? 90000n : amounts[i]), state: "settled" as const,
    settled: true, settleRef: refs[i]!, settleRefKind: "test" as const, createdAtMs: 1500 + i }))
  if (mode === "order") report.reverse()
  const controller = createSessionCliController(command, { signal: new AbortController().signal, deadlineMs: performance.now() + 1000,
    acquireAccount: async () => ({ address: ADDRESS, type: "json-rpc" }),
    open: async () => ({ id, buyer: ADDRESS, rail: "test", network: "eip155:5042002", budgetAtomic: 1000000n,
      quote: async () => { throw Error() }, status: async () => { throw Error() },
      call: async () => { const i = calls++; return { jobId: jobs[i]!, status: "succeeded", result: {}, receipt: { settled: true }, authorizedAmountAtomic: amounts[i]!, fencedResult: "fixture" } },
      close: async () => ({ sessionId: id, buyer: ADDRESS, rail: "test", network: "eip155:5042002", budgetAtomic: "1000000", spentAtomic: mode === "amount" ? "290000" : "300000", heldAtomic: "0",
        calls: report, settledCalls: 2, settlementRefs: report.map(c => c.settleRef), complete: true, openedAtMs: 1000, closedAtMs: 2000 }) }) })
  const outcome = await controller.run()
  expect(outcome).toMatchObject({ status: mode === "valid" ? "closed" : "uncertain", completedCalls: 2 })
  if (mode === "valid") expect(outcome.receipt).toMatchObject({ spentAtomic: "300000", calls: report })
  else expect(outcome).not.toHaveProperty("receipt")
})

test("session deadline aborts its retained signal and late account completion cannot open a session", async () => {
  const { createSessionCliController, parseSessionCommand } = await import("../src/session-cli.ts")
  const command = parseSessionCommand(["session", "--hub", "http://127.0.0.1:8787", "--address", ADDRESS, "--budget", "1", "--calls", "1", "--skill", "flow", "--seller", "service", "--rail", "test", "--input", "{}"])
  let resolveAccount!: (account: { address: `0x${string}`; type: "json-rpc" }) => void
  let observedSignal: AbortSignal | undefined, opens = 0
  const gate = new Promise<{ address: `0x${string}`; type: "json-rpc" }>(resolve => { resolveAccount = resolve })
  const controller = createSessionCliController(command, { signal: new AbortController().signal, deadlineMs: performance.now() + 20,
    acquireAccount: async signal => { observedSignal = signal; return gate }, open: async () => { opens++; throw Error("LATE_OPEN_FORBIDDEN") } })
  try {
    expect(await controller.run()).toMatchObject({ status: "refused", completedCalls: 0 })
    expect(observedSignal?.aborted).toBe(true)
    resolveAccount({ address: ADDRESS, type: "json-rpc" }); await gate; await Promise.resolve()
    expect(opens).toBe(0); expect(await controller.run()).toMatchObject({ status: "refused" })
  } finally { resolveAccount({ address: ADDRESS, type: "json-rpc" }); await gate }
})

test("actual session help and invalid input are keyless, import-inert and fixed-output", async () => {
  const module = fileURLToPath(new URL("../src/session-cli.ts", import.meta.url))
  const inert = await child(["-e", `globalThis.fetch=()=>{throw Error("NETWORK_FORBIDDEN")};await import(${JSON.stringify(module)});console.log("SESSION_IMPORT_INERT")`])
  expect(inert).toEqual({ exit: 0, stdout: "SESSION_IMPORT_INERT\n", stderr: "" })
  const help = await child([cli, "session", "--help"])
  expect(help.exit).toBe(0); expect(help.stdout).toContain("Process exit loses the private capability"); expect(help.stderr).toBe("")
  const bad = await child([cli, "session", "--key", "DUMMY_PRIVATE_SENTINEL"])
  expect(bad.exit).toBe(2); expect(bad.stderr).toContain("session_input_invalid")
  expect(bad.stdout + bad.stderr).not.toMatch(/DUMMY_PRIVATE_SENTINEL|ARCADE_BUYER_KEY/)
})

test("session output remains inside the owning hard fuse until its write callback completes", async () => {
  const funding = fileURLToPath(new URL("../src/gateway-funding-cli.ts", import.meta.url)), session = fileURLToPath(new URL("../src/session-cli.ts", import.meta.url))
  const out = await child(["-e", `const {runOwnedFundingCli}=await import(${JSON.stringify(funding)});const {sessionMain}=await import(${JSON.stringify(session)});
    process.stdout.write=()=>true;
    await runOwnedFundingCli(()=>sessionMain(["session","--help"],{env:{},role:"buyer"}),30);`])
  expect(out.exit).toBe(124); expect(out.stderr).toContain("funding_deadline_exceeded"); expect(out.stdout).toBe("")
})

for (const entry of ["funding", "buyer", "withdraw", "session"] as const) test(`exported ${entry} entry rejects accessor argv without reading or reflecting it`, async () => {
  const path = entry === "withdraw" ? fileURLToPath(new URL("../../../scripts/gateway-withdraw.ts", import.meta.url)) :
    entry === "buyer" ? cli : fileURLToPath(new URL(`../src/${entry === "session" ? "session-cli" : "gateway-funding-cli"}.ts`, import.meta.url))
  const name = entry === "funding" ? "fundingMain" : entry === "buyer" ? "buyerMain" : entry === "withdraw" ? "withdrawMain" : "sessionMain"
  const out = await child(["-e", `const {${name}:main}=await import(${JSON.stringify(path)});let reads=0,code,rejected=false;const args=["placeholder","--help"];
    Object.defineProperty(args,"0",{get(){reads++;throw Error("PRIVATE_ARGV_GETTER")}});
    try{code=await main(args,${entry === "buyer" || entry === "withdraw" ? "{}" : "{env:{},role:'buyer'}"});}catch{rejected=true;}
    console.log(JSON.stringify({reads,code,rejected}));`])
  expect(out.exit).toBe(0); expect(JSON.parse(out.stdout)).toEqual({ reads: 0, code: 2, rejected: false })
  expect(out.stderr).not.toContain("PRIVATE_ARGV_GETTER")
})

test("session entry capture preserves an input larger than the funding argv limit", async () => {
  const { fundingMain } = await import("../src/gateway-funding-cli.ts")
  let keys = 0; const lines: string[] = []
  const code = await fundingMain(["session", "--hub", "http://127.0.0.1:8787", "--address", ADDRESS, "--budget", "1", "--calls", "1", "--skill", "flow", "--seller", "service", "--rail", "test", "--input", JSON.stringify({ text: "x".repeat(65536) })], {
    env: { get ARCADE_BUYER_KEY(): string { keys++; throw Error("PRIVATE_KEY_UNAVAILABLE") } }, role: "buyer", write: async line => { lines.push(line) }
  })
  expect(code).toBe(1); expect(keys).toBe(1); expect(lines).toEqual([JSON.stringify({ status: "refused", completedCalls: 0 })])
})

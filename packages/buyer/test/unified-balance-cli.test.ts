import { describe, expect, it, vi } from "vitest"
import { parseUnifiedFundingCommand, unifiedFundingMain, ownerAddDelegateCommand, type UnifiedCliRuntime } from "../src/unified-balance-cli.ts"
import { captureUnifiedFundingPlan } from "../src/unified-balance-funding.ts"

const owner = `0x${"11".repeat(20)}` as const, recipient = `0x${"22".repeat(20)}` as const
const plan = captureUnifiedFundingPlan({ owner, recipient, sourceChain: "Arc_Testnet", amount: "0.25" })
const hash = `0x${"33".repeat(32)}` as const
const argv = () => ["fund", "--from-unified-balance", "--owner", owner, "--source", "Arc_Testnet", "--amount", "0.25", "--delegate", recipient]
const liveOptions = ["--journal", "/tmp/owned/run.jsonl", "--max-burn-block-delta", "200"]
const fixture = () => {
  const output: { line: string; error: boolean }[] = []
  const resolveDelegate = vi.fn(async () => recipient)
  const status = vi.fn(async (): Promise<unknown> => "ready")
  const execute = vi.fn<UnifiedCliRuntime["execute"]>(async () => ({ status: "sdk_returned", plan, txHash: hash }))
  const runtime = vi.fn(async () => ({ resolveDelegate, status, execute }))
  return { output, resolveDelegate, status, execute, runtime, context: { env: {}, runtime,
    write: async (line: string, error: boolean) => { output.push({ line, error }) } } }
}
describe("Unified Balance command policy", () => {
  it("captures an explicit testnet plan and finite fee/gas limits", () => {
    expect(parseUnifiedFundingCommand([...argv(), "--fee-cap", "0", "--gas-cap-wei", "1"])).toEqual({
      kind: "fund", owner, sourceChain: "Arc_Testnet", amount: "0.250000", delegate: recipient,
      dryRun: false, feeCapAtomic: 0n, gasCapWei: 1n
    })
    expect(Object.isFrozen(parseUnifiedFundingCommand(argv()))).toBe(true)
  })
  it.each([
    [], ["fund"], [...argv(), "--amount", "0.2"], [...argv(), "--from-unified-balance"],
    [...argv(), "--key", "PRIVATE_SENTINEL"], [...argv(), "--dry-run", "true"],
    [...argv(), "--journal", "relative.jsonl"], [...argv(), "--journal", "/tmp/a/../b.jsonl"],
    [...argv(), "--journal", "/tmp/a\tb.jsonl"], [...argv(), "--journal", "/tmp/b.txt"],
    [...argv(), "--gas-cap-wei", "0"], [...argv(), "--gas-cap-wei", "1e18"],
    [...argv(), "--fee-cap", "-1"], [...argv(), "--max-burn-block-delta", "0"],
    [...argv(), "--max-burn-block-delta", String((1n << 256n) - 1n)]
  ].map(args => ({ args })))("refuses malformed options without reflecting them: $args", ({ args }) => {
    expect(() => parseUnifiedFundingCommand(args)).toThrow("unified_funding_input_invalid")
  })
  it.each(["0", "-1", "01", "1e2", "0.0000001", " 1"])("refuses ambiguous amount %s", amount => {
    const args = argv(); args[7] = amount
    expect(() => parseUnifiedFundingCommand(args)).toThrow()
  })
  it("refuses mainnet, self-delegation and getters", () => {
    const base = argv(); base[5] = "Base"
    expect(() => parseUnifiedFundingCommand(base)).toThrow()
    const self = argv(); self[9] = owner
    expect(() => parseUnifiedFundingCommand(self)).toThrow()
    const getter = vi.fn(() => owner), raw = argv()
    Object.defineProperty(raw, "3", { get: getter })
    expect(() => parseUnifiedFundingCommand(raw)).toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
  it("formats a precise source-specific owner command without private-key argv", () => {
    expect(ownerAddDelegateCommand(plan)).toBe(`cast send 0x0077777d7eba4688bdef3e311b846f25870a19b9 'addDelegate(address,address)' 0x3600000000000000000000000000000000000000 ${recipient} --rpc-url https://rpc.testnet.arc.io --chain 5042002 --from ${owner} --interactive`)
    const base = ownerAddDelegateCommand({ ...plan, sourceChain: "Base_Sepolia" })
    expect(base).toContain("--chain 84532")
    expect(base).toContain("0x036cbd53842c5426634e7929541ec2318f3dcf7e")
  })
  it("help runs before any environment or runtime access", async () => {
    const f = fixture(), get = vi.fn(() => { throw Error("ENV_FORBIDDEN") })
    expect(await unifiedFundingMain(["fund", "--help"], { ...f.context, env: new Proxy({}, { get }) })).toBe(0)
    expect(get).not.toHaveBeenCalled(); expect(f.runtime).not.toHaveBeenCalled()
    expect(f.output[0]?.line).toContain("not a per-call cap")
  })
  it.each([true, false])("offline dry-run resolves no key or SDK (delegate explicit=%s)", async explicit => {
    const f = fixture(), args = explicit ? argv() : argv().slice(0, 8)
    const env = new Proxy({}, { get: (_target, key) => { if (key !== "ARCADE_NETWORK") throw Error("KEY_FORBIDDEN") } })
    expect(await unifiedFundingMain([...args, "--dry-run"], { ...f.context, env })).toBe(0)
    expect(f.runtime).not.toHaveBeenCalled()
    expect(JSON.parse(f.output[0]!.line)).toMatchObject({ status: "dry_run", networkObserved: false, delegateUnresolved: !explicit,
      plan: { owner, recipient: explicit ? recipient : null } })
  })
  it.each(["none", "pending"])("reports %s without executing, journaling or re-granting", async status => {
    const f = fixture(); f.status.mockResolvedValue(status)
    expect(await unifiedFundingMain(argv(), f.context)).toBe(2)
    expect(await unifiedFundingMain([...argv(), "--journal", "/tmp/owned/run.jsonl"], f.context)).toBe(2)
    expect(f.execute).not.toHaveBeenCalled(); expect(f.resolveDelegate).not.toHaveBeenCalled()
    expect(JSON.parse(f.output[0]!.line)).toMatchObject({ status, next: status === "none" ? "owner_grant_required" : "wait_for_existing_grant_do_not_repeat" })
  })
  it("never executes an unknown status or a ready plan without a private journal", async () => {
    const f = fixture()
    expect(await unifiedFundingMain(argv(), f.context)).toBe(2)
    f.status.mockResolvedValue("unknown")
    expect(await unifiedFundingMain([...argv(), ...liveOptions], f.context)).toBe(1)
    expect(f.execute).not.toHaveBeenCalled()
  })
  it("prints only the bound SDK return, never independent confirmation or raw traces", async () => {
    const f = fixture()
    f.execute.mockResolvedValue({ status: "sdk_returned", plan, txHash: hash, steps: "PRIVATE_TRACE" } as never)
    expect(await unifiedFundingMain([...argv(), ...liveOptions], f.context)).toBe(0)
    expect(JSON.parse(f.output[0]!.line)).toEqual({ status: "sdk_returned", plan, txHash: hash, independentlyConfirmed: false })
    expect(f.execute).toHaveBeenCalledTimes(1)
  })
  it("redacts thrown SDK data and refuses changed result identity", async () => {
    const f = fixture()
    f.execute.mockRejectedValue(Error("PRIVATE_SIGNATURE"))
    expect(await unifiedFundingMain([...argv(), ...liveOptions], f.context)).toBe(1)
    expect(JSON.stringify(f.output)).not.toContain("PRIVATE_SIGNATURE")
    f.execute.mockResolvedValue({ status: "sdk_returned", plan: { ...plan, amount: "0.5" }, txHash: hash })
    expect(await unifiedFundingMain([...argv(), ...liveOptions], f.context)).toBe(1)
  })
  it("captures argv before resolving a delegate and refuses an explicit mainnet environment", async () => {
    const f = fixture(), args = [...argv().slice(0, 8), ...liveOptions]
    f.resolveDelegate.mockImplementation(async () => { args[7] = "999"; return recipient })
    expect(await unifiedFundingMain(args, f.context)).toBe(0)
    expect(f.status).toHaveBeenCalledWith(plan)
    const other = fixture()
    expect(await unifiedFundingMain([...argv(), "--dry-run"], { ...other.context, env: { ARCADE_NETWORK: "base-mainnet" } })).toBe(2)
    expect(other.runtime).not.toHaveBeenCalled()
  })
})

import { describe, expect, it } from "bun:test"
import { parseSetupArgs, proposeParent, registerParent, type ParentDriver } from "./ens-setup.ts"
import { loadEnsDeployments } from "@arcade/core"
import { encodeAbiParameters, keccak256 } from "viem"

const owner = `0x${"11".repeat(20)}` as const, registry = `0x${"22".repeat(20)}` as const, resolver = `0x${"33".repeat(20)}` as const
const secret = `0x${"44".repeat(32)}` as const
const commitment = keccak256(encodeAbiParameters([{type:"string"},{type:"address"},{type:"bytes32"},{type:"address"},{type:"address"},{type:"uint64"},{type:"bytes32"}], ["arcade",owner,secret,registry,resolver,31536000n,`0x${"00".repeat(32)}`]))
const args = ["--seller", owner, "--skills", "usdc-flow-check", "--dry-run"]
const setup = () => {
  const sends: {label:string;fn:string;args:readonly unknown[]}[] = [], checkpoints: unknown[] = []
  let now = 1000
  const driver: ParentDriver = {
    chainId: async()=>11155111, nowSeconds:()=>now,
    read: async a => ({ isAvailable:true, getRegisterPrice:[10n,2n], MIN_COMMITMENT_AGE:60n, MAX_COMMITMENT_AGE:600n, MIN_REGISTER_DURATION:60n,
      balanceOf:sends.some(x=>x.fn==="mint")?12n:0n, allowance:sends.some(x=>x.fn==="approve")?12n:0n, makeCommitment:commitment, commitmentAt:1000n, getOwner:owner })[a.functionName],
    send: async(label,a)=>{sends.push({label,fn:a.functionName,args:a.args});return `0x${sends.length.toString(16).padStart(64,"0")}`},
    checkpoint:async entry=>{checkpoints.push(entry)}, wait:async seconds=>{now+=seconds}
  }
  return { driver,sends,checkpoints,request:{deployment:loadEnsDeployments()[0]!,owner,rootLabel:"arcade",confirmedLabel:"arcade",subregistry:registry,resolver,secret,duration:31536000n,maxFeeAtomic:100000000n} }
}
describe("ENS setup public planning boundary", () => {
  it("parses offline without any environment private key and does not invent an MCP endpoint", () => {
    const parsed = parseSetupArgs(args)
    expect(parsed.dryRun).toBe(true)
    expect(parsed.seller).toBe(owner)
    expect(parsed.mcpUrl).toBeUndefined()
    expect(parsed.confirmedLabel).toBeUndefined()
  })
  it("refuses malformed/duplicate/unrecognized arguments before any operation", () => {
    for(const extra of [["--unknown","x"],["--seller",owner],["--root-label","x.y"],["--hub","https://user:pass@example.com"],["--skills","a,a"]]) {
      expect(()=>parseSetupArgs([...args,...extra])).toThrow()
    }
    expect(()=>parseSetupArgs(["--seller","bad","--skills","flow"])).toThrow()
  })
  it("proposes fallback but never silently changes an explicitly approved label", async () => {
    expect(await proposeParent(parseSetupArgs(args),async label=>label==="arcade-hub")).toBe("arcade-hub")
    await expect(proposeParent(parseSetupArgs([...args,"--confirm-root-label","arcade"]),async label=>label==="arcade-hub")).rejects.toThrow(/approval/)
  })
})
describe("parent commit/reveal sequence with simulated chain boundary", () => {
  it("requires exact explicit label consent before reads or writes", async () => {
    const s=setup()
    await expect(registerParent({...s.request,confirmedLabel:undefined},s.driver)).rejects.toThrow(/approval/)
    expect(s.sends).toEqual([]);expect(s.checkpoints).toEqual([])
  })
  it("quotes exact MockUSDC fee, commits once, waits chain minimum, registers once", async () => {
    const s=setup()
    await registerParent(s.request,s.driver)
    expect(s.sends.map(s=>s.fn)).toEqual(["mint","approve","commit","register"])
    expect(s.sends[0]!.args).toEqual([owner,12n])
    expect(s.sends[1]!.args).toEqual([s.request.deployment.ethRegistrar,12n])
    expect(s.sends[3]!.args).toEqual(["arcade",owner,secret,registry,resolver,31536000n,s.request.deployment.mockUsdc,`0x${"00".repeat(32)}`])
    expect(s.checkpoints.length).toBeGreaterThanOrEqual(8)
  })
  it("checks chain and maximum registration fee before payment-token writes", async () => {
    for(const change of [{chainId:async()=>1},{read:async(a:{functionName:string})=>a.functionName==="getRegisterPrice"?[100000001n,0n]:true}]) {
      const s=setup()
      await expect(registerParent(s.request,{...s.driver,...change})).rejects.toThrow()
      expect(s.sends).toEqual([])
    }
  })
  it("does not send or retry a step if the prebroadcast checkpoint failed or a send is uncertain", async () => {
    const s=setup()
    await expect(registerParent(s.request,{...s.driver,checkpoint:async()=>{throw new Error("disk full")}})).rejects.toThrow()
    expect(s.sends).toEqual([])
    let calls=0
    await expect(registerParent(s.request,{...s.driver,send:async()=>{calls++;throw new Error("PRIVATE_KEY_OR_RPC_SECRET")}})).rejects.not.toThrow("PRIVATE_KEY_OR_RPC_SECRET")
    expect(calls).toBe(1)
  })
  it("does not guess a longer wait or register when the chain commitment is missing/expired", async () => {
    const s=setup(), read=s.driver.read
    await expect(registerParent(s.request,{...s.driver,read:async a=>a.functionName==="commitmentAt"?0n:read(a)})).rejects.toThrow()
    expect(s.sends.filter(s=>s.fn==="register")).toHaveLength(0)
  })
  it("validates the commitment before any token write", async () => {
    const s=setup(), read=s.driver.read
    await expect(registerParent(s.request,{...s.driver,read:async a=>a.functionName==="makeCommitment"?"0x":read(a)})).rejects.toThrow()
    expect(s.sends).toHaveLength(0)
  })
  it("refuses a syntactically valid commitment that does not bind the exact request", async () => {
    const s=setup(), read=s.driver.read
    await expect(registerParent(s.request,{...s.driver,read:async a=>a.functionName==="makeCommitment"?`0x${"55".repeat(32)}`:read(a)})).rejects.toThrow()
    expect(s.sends).toHaveLength(0)
  })
  it("reduces a preexisting excessive allowance to the exact quoted fee", async () => {
    const s=setup(), read=s.driver.read
    await registerParent(s.request,{...s.driver,read:async a=>a.functionName==="allowance"&&!s.sends.some(x=>x.fn==="approve")?1000000000n:read(a)})
    expect(s.sends.find(x=>x.fn==="approve")?.args).toEqual([s.request.deployment.ethRegistrar,12n])
  })
  it("refuses to commit after a nominally confirmed mint or approval without matching token state", async () => {
    for(const broken of ["balanceOf","allowance"]) {
      const s=setup(), read=s.driver.read
      await expect(registerParent(s.request,{...s.driver,read:async a=>a.functionName===broken?0n:read(a)})).rejects.toThrow()
      expect(s.sends.some(x=>x.fn==="commit")).toBe(false)
    }
  })
  it("refuses a quote above uint256 before token writes", async () => {
    const s=setup(), read=s.driver.read
    await expect(registerParent({...s.request,maxFeeAtomic:2n**256n},{...s.driver,read:async a=>a.functionName==="getRegisterPrice"?[2n**256n,0n]:read(a)})).rejects.toThrow()
    expect(s.sends).toHaveLength(0)
  })
  it("rejects expired, early or invalid clocks without a register retry", async () => {
    for(const now of [1600,1000,NaN]) {
      const s=setup()
      await expect(registerParent(s.request,{...s.driver,nowSeconds:()=>now,wait:async()=>{}})).rejects.toThrow()
      expect(s.sends.some(x=>x.fn==="register")).toBe(false)
    }
  })
  it("stops on post-broadcast checkpoint failure and owner mismatch", async () => {
    const s=setup(), read=s.driver.read
    await expect(registerParent(s.request,{...s.driver,checkpoint:async e=>{if(e.state==="confirmed")throw new Error("disk full")}})).rejects.toThrow(/reconcile/)
    expect(s.sends).toHaveLength(1)
    const next=setup()
    await expect(registerParent(next.request,{...next.driver,read:async a=>a.functionName==="getOwner"?registry:next.driver.read(a)})).rejects.toThrow(/owner mismatch/)
    expect(next.sends.filter(x=>x.fn==="register")).toHaveLength(1)
  })
})

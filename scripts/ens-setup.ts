/** OWNER-gated ENSv2 Sepolia bootstrap. Importing this module never reads keys or starts IO. */
import { createPublicClient, encodeAbiParameters, http, keccak256, type Abi, type Hex } from "viem"
import { sepolia } from "viem/chains"
import {
  ENS_SEPOLIA_CHAIN_ID, ETH_REGISTRAR_ABI, MOCK_USDC_ABI, PERMISSIONED_REGISTRY_ABI,
  ensDeploymentReader, ensTtlSeconds, labelId, loadEnsDeployments, pickAvailableLabel,
  resolveEnsDeployment, sellerLabelFor, type EnsDeployment
} from "@arcade/core"

const insist: (ok: unknown, message: string) => asserts ok = (ok, message) => { if (!ok) throw new Error(message) }
const address = (value: string): Hex => {
  insist(value.length === 42 && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value), "ENS setup: invalid public address")
  return value.toLowerCase() as Hex
}
const hash = (value: unknown): value is Hex => typeof value === "string" && value.length === 66 && /^0x[0-9a-fA-F]{64}$/.test(value)
const label = (value: string): string => { labelId(value); return value.toLowerCase() }
const safeUrl = (value: string, originOnly = false): string => {
  insist(value.length <= 2048 && value.trim() === value, "ENS setup: invalid public URL")
  let url: URL
  try { url = new URL(value) } catch { throw new Error("ENS setup: invalid public URL") }
  insist(!url.username && !url.password && !url.search && !url.hash &&
    (url.protocol === "https:" || url.protocol === "http:" && ["localhost","127.0.0.1","[::1]"].includes(url.hostname)), "ENS setup: public URL must use HTTPS or explicit loopback")
  insist(!originOnly || url.pathname === "/", "ENS setup: hub/web must be origins")
  return originOnly ? url.origin : url.href
}
export interface SetupArgs {
  readonly seller: Hex; readonly sellerLabel: string; readonly skillIds: readonly string[]
  readonly rootLabel: string; readonly confirmedLabel?: string; readonly hubUrl: string; readonly webUrl: string
  readonly mcpUrl?: string; readonly agentId?: string; readonly owner?: Hex; readonly daemon?: Hex
  readonly ttlSeconds: number; readonly sellerTtlSeconds: number; readonly dryRun: boolean
}
export const parseSetupArgs = (argv: readonly string[]): SetupArgs => {
  insist(argv.length <= 40, "ENS setup: too many arguments")
  const values = new Map<string,string>(), flags = new Set<string>()
  const names = new Set(["seller","seller-label","skills","root-label","confirm-root-label","hub","web","mcp","agent-id","ttl","seller-ttl","owner","daemon"])
  for(let i=0;i<argv.length;i++) {
    const arg=argv[i]!
    insist(arg.startsWith("--"), "ENS setup: expected named arguments")
    const name=arg.slice(2)
    insist(!values.has(name)&&!flags.has(name), "ENS setup: duplicate argument")
    if(name==="dry-run") { flags.add(name);continue }
    insist(names.has(name), "ENS setup: unrecognized argument")
    const value=argv[++i]
    insist(value!==undefined && value.length<=2048 && !value.startsWith("--"), "ENS setup: missing argument value")
    values.set(name,value)
  }
  const seller=address(values.get("seller")??""), rawSkills=values.get("skills")??""
  const skillIds=rawSkills.split(",").map(label)
  insist(skillIds.length>0&&skillIds.length<=64&&new Set(skillIds).size===skillIds.length, "ENS setup: skills must be unique labels")
  const hubUrl=safeUrl(values.get("hub")??"http://localhost:8787",true)
  const rootLabel=label(values.get("root-label")??"arcade"), confirmed=values.get("confirm-root-label"), id=values.get("agent-id")
  if(id!==undefined) insist(/^(0|[1-9][0-9]{0,77})$/.test(id)&&BigInt(id)<2n**256n, "ENS setup: agent id must be uint256")
  return {
    seller,sellerLabel:label(values.get("seller-label")??sellerLabelFor(seller)),skillIds,rootLabel,hubUrl,
    webUrl:safeUrl(values.get("web")??hubUrl,true), ttlSeconds:ensTtlSeconds(values.get("ttl")), sellerTtlSeconds:ensTtlSeconds(values.get("seller-ttl")??"90d"),
    dryRun:flags.has("dry-run"), ...(confirmed===undefined?{}:{confirmedLabel:label(confirmed)}),
    ...(values.has("mcp")?{mcpUrl:safeUrl(values.get("mcp")!)}:{}), ...(id===undefined?{}:{agentId:id}),
    ...(values.has("owner")?{owner:address(values.get("owner")!)}:{}), ...(values.has("daemon")?{daemon:address(values.get("daemon")!)}:{})
  }
}
export const proposeParent = async (args: SetupArgs, available: (label:string)=>Promise<boolean>): Promise<string> => {
  const proposed=await pickAvailableLabel([args.rootLabel,"arcade-hub","arcadelabs"],available)
  insist(args.confirmedLabel===undefined||args.confirmedLabel===proposed,"ENS setup: owner approval does not match the available proposed label")
  return proposed
}

export interface SetupCall { readonly address: Hex; readonly abi: Abi; readonly functionName: string; readonly args: readonly unknown[] }
export interface ParentDriver {
  readonly chainId: ()=>Promise<number>
  readonly read: (call: SetupCall)=>Promise<unknown>
  /** Exactly one broadcast plus verified successful receipt. Never retry uncertain writes. */
  readonly send: (label:string,call:SetupCall)=>Promise<Hex>
  /** Durable private checkpoint. Wallet private keys never enter the checkpoint. */
  readonly checkpoint: (entry: {readonly step:string;readonly state:"intent"|"confirmed";readonly txHash?:Hex})=>Promise<void>
  readonly nowSeconds: ()=>number
  readonly wait: (seconds:number)=>Promise<void>
}
export interface ParentRequest {
  readonly deployment:EnsDeployment;readonly owner:Hex;readonly rootLabel:string;readonly confirmedLabel:string|undefined
  readonly subregistry:Hex;readonly resolver:Hex;readonly secret:Hex;readonly duration:bigint;readonly maxFeeAtomic:bigint
}
const bounded = <T>(work:()=>Promise<T>,ms:number,reason:string):Promise<T> => new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(reason)),ms)
  Promise.resolve().then(work).then(v=>{clearTimeout(timer);resolve(v)},()=>{clearTimeout(timer);reject(new Error(reason))})
})
/** Testable parent stage; outer setup owns persistent recovery and proxy/skill stages. */
export const registerParent = async(a:ParentRequest,d:ParentDriver):Promise<Hex> => {
  insist(a.confirmedLabel===a.rootLabel && label(a.rootLabel)===a.rootLabel,"ENS setup: explicit owner label approval required")
  address(a.owner);address(a.subregistry);address(a.resolver)
  insist(hash(a.secret)&&a.duration>0n&&a.duration<2n**64n&&a.maxFeeAtomic>0n&&a.maxFeeAtomic<2n**256n,"ENS setup: invalid parent registration parameters")
  const pinned=loadEnsDeployments().find(x=>x.set===a.deployment.set)
  insist(pinned!==undefined&&Object.keys(pinned).every(k=>pinned[k as keyof EnsDeployment]===a.deployment[k as keyof EnsDeployment]),"ENS setup: deployment must match the validated manifest")
  const chain=async()=>insist(await bounded(d.chainId,5000,"ENS chain unavailable")===ENS_SEPOLIA_CHAIN_ID,"ENS setup: RPC must be Sepolia")
  await chain()
  const read=(target:Hex,abi:Abi,functionName:string,args:readonly unknown[])=>bounded(()=>d.read({address:target,abi,functionName,args}),5000,"ENS setup: preflight read unavailable")
  const registrar=(fn:string,args:readonly unknown[])=>read(a.deployment.ethRegistrar,ETH_REGISTRAR_ABI,fn,args)
  insist(await registrar("isAvailable",[a.rootLabel])===true,"ENS setup: approved label is not available")
  const quote=await registrar("getRegisterPrice",[a.rootLabel,a.duration,a.deployment.mockUsdc])
  insist(Array.isArray(quote)&&quote.length===2&&quote.every(x=>typeof x==="bigint"&&x>=0n&&x<2n**256n),"ENS setup: invalid fee quote")
  const fee=(quote[0] as bigint)+(quote[1] as bigint)
  insist(fee<2n**256n&&fee<=a.maxFeeAtomic,"ENS setup: quoted registration fee exceeds approved ceiling")
  const [minimum,maximum,durationMinimum]=await Promise.all([registrar("MIN_COMMITMENT_AGE",[]),registrar("MAX_COMMITMENT_AGE",[]),registrar("MIN_REGISTER_DURATION",[])])
  insist(typeof minimum==="bigint"&&minimum>=0n&&minimum<=600n&&typeof maximum==="bigint"&&maximum>minimum&&maximum<=86400n&&typeof durationMinimum==="bigint"&&a.duration>=durationMinimum,"ENS setup: unsupported commitment window or registration duration")
  const send=async(step:string,target:Hex,abi:Abi,fn:string,args:readonly unknown[])=>{
    await chain()
    await bounded(()=>d.checkpoint({step,state:"intent"}),5000,"ENS setup: checkpoint failed before broadcast")
    const txHash=await bounded(()=>d.send(step,{address:target,abi,functionName:fn,args}),90000,"ENS setup: transaction outcome uncertain; reconcile checkpoint before retry")
    insist(hash(txHash),"ENS setup: invalid confirmed transaction hash")
    await bounded(()=>d.checkpoint({step,state:"confirmed",txHash}),5000,"ENS setup: confirmed transaction checkpoint failed; reconcile before retry")
    return txHash
  }
  const referrer=`0x${"00".repeat(32)}` as Hex
  const commitmentArgs=[a.rootLabel,a.owner,a.secret,a.subregistry,a.resolver,a.duration,referrer] as const
  const commitment=await registrar("makeCommitment",commitmentArgs)
  // contracts-v2 ETHRegistrar @97a5729: keccak256(abi.encode(all seven reveal fields)).
  const expected=keccak256(encodeAbiParameters([{type:"string"},{type:"address"},{type:"bytes32"},{type:"address"},{type:"address"},{type:"uint64"},{type:"bytes32"}],commitmentArgs))
  insist(hash(commitment)&&commitment.toLowerCase()===expected,"ENS setup: invalid commitment hash or request binding")
  const balance=await read(a.deployment.mockUsdc,MOCK_USDC_ABI,"balanceOf",[a.owner])
  const allowance=await read(a.deployment.mockUsdc,MOCK_USDC_ABI,"allowance",[a.owner,a.deployment.ethRegistrar])
  insist(typeof balance==="bigint"&&balance>=0n&&typeof allowance==="bigint"&&allowance>=0n,"ENS setup: invalid MockUSDC balances")
  if(balance<fee) await send("mock-usdc-mint",a.deployment.mockUsdc,MOCK_USDC_ABI,"mint",[a.owner,fee-balance])
  // Exact allowance also closes a previously oversized grant: the registrar has no maxFee argument.
  if(allowance!==fee) await send("mock-usdc-approve",a.deployment.mockUsdc,MOCK_USDC_ABI,"approve",[a.deployment.ethRegistrar,fee])
  const [funded,approved]=await Promise.all([read(a.deployment.mockUsdc,MOCK_USDC_ABI,"balanceOf",[a.owner]),read(a.deployment.mockUsdc,MOCK_USDC_ABI,"allowance",[a.owner,a.deployment.ethRegistrar])])
  insist(typeof funded==="bigint"&&funded>=fee&&approved===fee,"ENS setup: confirmed token state does not match exact fee authorization")
  await send("parent-commit",a.deployment.ethRegistrar,ETH_REGISTRAR_ABI,"commit",[commitment])
  const at=await registrar("commitmentAt",[commitment])
  insist(typeof at==="bigint"&&at>0n&&at<=BigInt(Number.MAX_SAFE_INTEGER),"ENS setup: confirmed commitment missing")
  const current=()=>{const now=d.nowSeconds();insist(Number.isSafeInteger(now)&&now>=0,"ENS setup: invalid clock");return BigInt(now)}
  let now=current()
  insist(now<at+maximum,"ENS setup: commitment expired; do not recommit automatically")
  if(now<at+minimum) await bounded(()=>d.wait(Number(at+minimum-now)),610000,"ENS setup: commitment wait exceeded deadline")
  now=current()
  insist(now>=at+minimum&&now<at+maximum,"ENS setup: commitment not in reveal window")
  const tx=await send("parent-register",a.deployment.ethRegistrar,ETH_REGISTRAR_ABI,"register",[a.rootLabel,a.owner,a.secret,a.subregistry,a.resolver,a.duration,a.deployment.mockUsdc,referrer])
  const registeredOwner=await read(a.deployment.ethRegistry,PERMISSIONED_REGISTRY_ABI,"getOwner",[labelId(a.rootLabel)])
  insist(typeof registeredOwner==="string"&&registeredOwner.toLowerCase()===a.owner.toLowerCase(),"ENS setup: confirmed registration owner mismatch")
  return tx
}

const HELP="ENS setup: --seller <address> --skills <id,id> [--root-label <label>] [--confirm-root-label <label>] [--seller-label <label>] [--hub <origin>] [--web <origin>] [--mcp <real-url>] [--agent-id <uint256>] [--ttl <6h>] [--seller-ttl <90d>] [--owner <public-address>] [--daemon <public-address>] --dry-run\nDry run is public and keyless. Live bootstrap requires owner-provisioned Sepolia keys, explicit label consent and completed registry/skill stages. Use bun --no-env-file run scripts/ens-setup.ts."
export const main = async(argv:readonly string[]=process.argv.slice(2)):Promise<number> => {
  if(argv.length===1&&argv[0]==="--help") {console.log(HELP);return 0}
  try {
    const args=parseSetupArgs(argv)
    // E4/E5 must replace this boundary only once all setup stages exist. Never mint or
    // commit in a partial implementation merely to discover a later stub is incomplete.
    insist(args.dryRun,"ENS setup: OWNER approval and complete registry/skill setup stages required; use --dry-run")
    const rpc=safeUrl(process.env["ARCADE_ENS_RPC"]??"https://ethereum-sepolia-rpc.publicnode.com")
    const client=createPublicClient({chain:sepolia,transport:http(rpc,{timeout:5000,retryCount:0})})
    const deployment=await resolveEnsDeployment(ensDeploymentReader(client))
    const proposed=await proposeParent(args,name=>client.readContract({address:deployment.ethRegistrar,abi:ETH_REGISTRAR_ABI,functionName:"isAvailable",args:[name]}))
    console.log(JSON.stringify({dryRun:true,deploymentSet:deployment.set,proposedParent:`${proposed}.eth`,seller:args.seller,skillIds:args.skillIds,ownerApprovalRequired:true},null,2))
    return 0
  } catch { console.error("ENS setup refused: invalid configuration, unavailable public preflight, or OWNER approval/setup prerequisites missing. No automatic retry; reconcile any existing checkpoint before resuming.");return 2 }
}
if(import.meta.main) process.exitCode=await main()

/** OWNER-gated ENSv2 Sepolia bootstrap. Importing this module never reads keys or starts IO. */
import { createPublicClient, decodeEventLog, encodeAbiParameters, encodeEventTopics, encodeFunctionData, http, keccak256, parseAbi, type Abi, type Hex } from "viem"
import { sepolia } from "viem/chains"
import {
  ALL_ROLES, SELLER_SUBNAME_ROLES, ENS_SEPOLIA_CHAIN_ID, ETH_REGISTRAR_ABI, MOCK_USDC_ABI, PERMISSIONED_REGISTRY_ABI,
  PERMISSIONED_RESOLVER_ABI, USER_REGISTRY_INIT_ABI, VERIFIABLE_FACTORY_ABI, arcadeSellerName, ownedResolverSalt, userRegistrySalt,
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
export interface SetupCheckpoint {
  readonly step:string;readonly state:"intent"|"confirmed";readonly txHash?:Hex
  /** Public recovery coordinates only. The outer driver persists the full private journal. */
  readonly metadata?:Readonly<Record<string,string>>
}
export interface ParentDriver {
  readonly chainId: ()=>Promise<number>
  readonly read: (call: SetupCall)=>Promise<unknown>
  /** Exactly one broadcast plus verified successful receipt. Never retry uncertain writes. */
  readonly send: (label:string,call:SetupCall)=>Promise<Hex>
  /** Durable private checkpoint. Wallet private keys never enter the checkpoint. */
  readonly checkpoint: (entry: SetupCheckpoint)=>Promise<void>
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

export interface RegistryContext { readonly deployment:EnsDeployment;readonly owner:Hex }
export interface RegistryDriver extends ParentDriver {
  /** Simulate a fresh factory deploy from the configured owner; return its result address. */
  readonly simulate:(call:SetupCall)=>Promise<unknown>
  readonly getCode:(address:Hex)=>Promise<unknown>
  /** The exact receipt for the supplied hash, not a cached or unrelated successful receipt. */
  readonly readReceipt:(txHash:Hex)=>Promise<unknown>
}
export interface ParentWiring {
  readonly root:string;readonly rootLabel:string;readonly sellerRegistry:Hex;readonly resolver:Hex
}
export interface SellerRequest {
  readonly root:string;readonly sellerLabel:string;readonly seller:Hex;readonly sellerRegistry:Hex;readonly resolver:Hex
  /** Absolute, owner-approved expiry persisted before setup; never recomputed on a rerun. */
  readonly expiry:bigint
  /** Recovery coordinate after a confirmed factory deploy but before seller registration. */
  readonly knownSkillRegistry?:Hex
}
const ZERO=`0x${"00".repeat(20)}` as Hex
// contracts-v2 @97a57293f3b4279d94b571e678edb53ce62638f4:
// IRegistry.getResolver/getParent; IUUPSProxy's immutable provenance; access-control roles.
const REGISTRY_VIEWS=parseAbi([
  "function getResolver(string label) view returns (address)",
  "function getParent() view returns (address parent, string label)",
  "function getVerifiableProxyData() view returns (bytes32 outerSalt, address implementation)",
  "function verifiableProxyFactory() view returns (address)",
  "function roles(uint256 resource, address account) view returns (uint256)"
])
const same=(a:unknown,b:unknown)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase()
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v)
const readAddress=(v:unknown):Hex=>{insist(typeof v==="string"&&/^0x[0-9a-fA-F]{40}$/.test(v),"ENS setup: invalid address readback");return v.toLowerCase() as Hex}
const uint=(v:unknown,bits=256):v is bigint=>typeof v==="bigint"&&v>=0n&&v<2n**BigInt(bits)
const registryOps=(c:RegistryContext,d:RegistryDriver)=>{
  const owner=address(c.owner),pinned=loadEnsDeployments().find(v=>v.set===c.deployment.set)
  insist(pinned!==undefined&&Object.keys(pinned).every(k=>pinned[k as keyof EnsDeployment]===c.deployment[k as keyof EnsDeployment]),"ENS setup: unvalidated deployment")
  const chain=async()=>insist(await bounded(d.chainId,5000,"ENS setup: chain unavailable")===ENS_SEPOLIA_CHAIN_ID,"ENS setup: RPC must be Sepolia")
  const read=(target:Hex,abi:Abi,fn:string,args:readonly unknown[]=[])=>bounded(()=>d.read({address:target,abi,functionName:fn,args}),5000,"ENS setup: registry read unavailable")
  const code=async(target:Hex)=>{
    const got=await bounded(()=>d.getCode(target),5000,"ENS setup: proxy bytecode unavailable")
    if(got===undefined)return false
    insist(typeof got==="string"&&got.length<=262146&&/^0x(?:[0-9a-fA-F]{2})*$/.test(got),"ENS setup: invalid proxy bytecode")
    return got!=="0x"
  }
  const send=async(step:string,target:Hex,abi:Abi,fn:string,args:readonly unknown[],metadata:Readonly<Record<string,string>>)=>{
    await chain()
    await bounded(()=>d.checkpoint({step,state:"intent",metadata}),5000,"ENS setup: checkpoint failed before broadcast")
    const tx=await bounded(()=>d.send(step,{address:target,abi,functionName:fn,args}),90000,"ENS setup: transaction outcome uncertain; reconcile before retry")
    insist(hash(tx),"ENS setup: invalid confirmed transaction hash")
    await bounded(()=>d.checkpoint({step,state:"confirmed",txHash:tx,metadata}),5000,"ENS setup: confirmed checkpoint failed; reconcile before retry")
    return tx
  }
  return {owner,chain,read,code,send}
}
type RegistryOps=ReturnType<typeof registryOps>
const rootParts=(root:string)=>{
  insist(root.endsWith(".eth")&&root.split(".").length===2,"ENS setup: expected canonical parent 2LD")
  const rootLabel=root.slice(0,-4)
  insist(label(rootLabel)===rootLabel,"ENS setup: expected canonical parent label")
  return rootLabel
}
const verifyProxy=async(c:RegistryContext,o:RegistryOps,proxy:Hex,implementation:Hex,salt:bigint)=>{
  insist(await o.code(proxy),"ENS setup: expected proxy bytecode missing")
  const data=await o.read(proxy,REGISTRY_VIEWS,"getVerifiableProxyData")
  const expectedOuter=keccak256(encodeAbiParameters([{type:"address"},{type:"uint256"}],[o.owner,salt]))
  insist(Array.isArray(data)&&data.length===2&&same(data[0],expectedOuter)&&same(data[1],implementation),"ENS setup: proxy salt or implementation provenance mismatch")
  insist(same(await o.read(proxy,REGISTRY_VIEWS,"verifiableProxyFactory"),c.deployment.verifiableFactory)&&
    same(await o.read(c.deployment.verifiableFactory,VERIFIABLE_FACTORY_ABI,"verifyContract",[proxy]),implementation),"ENS setup: proxy factory or current implementation mismatch")
  insist(await o.read(proxy,REGISTRY_VIEWS,"roles",[0n,o.owner])===ALL_ROLES,"ENS setup: proxy owner root roles differ from the initializer")
}
const verifyFactoryReceipt=async(c:RegistryContext,d:RegistryDriver,tx:Hex,proxy:Hex,implementation:Hex,salt:bigint)=>{
  const receipt=await bounded(()=>d.readReceipt(tx),5000,"ENS setup: factory receipt unavailable; reconcile before retry")
  insist(object(receipt)&&same(receipt["transactionHash"],tx)&&(receipt["status"]==="success"||receipt["status"]==="0x1")&&
    same(receipt["from"],c.owner)&&same(receipt["to"],c.deployment.verifiableFactory)&&Array.isArray(receipt["logs"])&&receipt["logs"].length<=256,"ENS setup: factory receipt identity or status mismatch")
  const numeric=(v:unknown):bigint|undefined=>{
    if(typeof v==="bigint"&&v>=0n)return v
    if(typeof v==="number"&&Number.isSafeInteger(v)&&v>=0)return BigInt(v)
    if(typeof v==="string"&&/^0x[0-9a-fA-F]{1,64}$/.test(v))return BigInt(v)
    return undefined
  }
  const deploymentTopic=encodeEventTopics({abi:VERIFIABLE_FACTORY_ABI,eventName:"ProxyDeployed"})[0]
  let matching=0,emitted=0
  for(const log of receipt["logs"]){
    insist(object(log)&&(log["removed"]===undefined||log["removed"]===false)&&(log["transactionHash"]===undefined||same(log["transactionHash"],tx))&&
      (log["blockHash"]===undefined||hash(log["blockHash"])&&same(log["blockHash"],receipt["blockHash"]))&&
      ["blockNumber","transactionIndex"].every(k=>log[k]===undefined||numeric(log[k])!==undefined&&numeric(log[k])===numeric(receipt[k])),"ENS setup: removed or unrelated factory receipt log")
    if(!same(log["address"],c.deployment.verifiableFactory)||!Array.isArray(log["topics"])||!same(log["topics"][0],deploymentTopic))continue
    emitted++
    insist(typeof log["data"]==="string","ENS setup: malformed factory deployment event")
    try{
      const e=decodeEventLog({abi:VERIFIABLE_FACTORY_ABI,topics:log["topics"] as [Hex,...Hex[]],data:log["data"] as Hex})
      if(e.eventName==="ProxyDeployed"&&same(e.args.sender,c.owner)&&same(e.args.proxyAddress,proxy)&&e.args.salt===salt&&same(e.args.implementation,implementation))matching++
    }catch{throw new Error("ENS setup: malformed factory deployment event")}
  }
  insist(emitted===1&&matching===1,"ENS setup: exactly one matching factory ProxyDeployed event required")
}
const deployProxy=async(c:RegistryContext,d:RegistryDriver,kind:string,implementation:Hex,salt:bigint,initData:Hex,known?:Hex)=>{
  const o=registryOps(c,d);await o.chain()
  if(known!==undefined){const proxy=address(known);await verifyProxy(c,o,proxy,implementation,salt);return proxy}
  const args=[implementation,salt,initData] as const
  const prediction=await bounded(()=>d.simulate({address:c.deployment.verifiableFactory,abi:VERIFIABLE_FACTORY_ABI,functionName:"deployProxy",args}),5000,"ENS setup: fresh proxy simulation failed; use verified recovery coordinates")
  insist(typeof prediction==="string","ENS setup: invalid fresh proxy prediction")
  const proxy=address(prediction)
  insist(!(await o.code(proxy)),"ENS setup: predicted proxy already exists; explicit verified recovery required")
  const metadata={proxy,implementation,salt:salt.toString(),owner:o.owner,kind}
  const tx=await o.send(`deploy-proxy:${kind}`,c.deployment.verifiableFactory,VERIFIABLE_FACTORY_ABI,"deployProxy",args,metadata)
  await verifyFactoryReceipt(c,d,tx,proxy,implementation,salt)
  await verifyProxy(c,o,proxy,implementation,salt)
  return proxy
}
export const deployUserRegistry=async(c:RegistryContext,name:string,d:RegistryDriver,knownProxy?:Hex):Promise<Hex>=>
  deployProxy(c,d,`registry:${name}`,c.deployment.userRegistryImpl,userRegistrySalt(name),encodeFunctionData({abi:USER_REGISTRY_INIT_ABI,functionName:"initialize",args:[address(c.owner),ALL_ROLES]}),knownProxy)
export const deployResolver=async(c:RegistryContext,d:RegistryDriver,knownProxy?:Hex):Promise<Hex>=>
  deployProxy(c,d,"resolver",c.deployment.permissionedResolverImpl,ownedResolverSalt(c.owner),encodeFunctionData({abi:PERMISSIONED_RESOLVER_ABI,functionName:"initialize",args:[address(c.owner),ALL_ROLES,[]]}),knownProxy)
const ownedRoot=async(c:RegistryContext,o:RegistryOps,rootLabel:string)=>
  insist(same(await o.read(c.deployment.ethRegistry,PERMISSIONED_REGISTRY_ABI,"getOwner",[labelId(rootLabel)]),o.owner),"ENS setup: parent is not owned by the setup owner")
const parentPair=(value:unknown):readonly[Hex,string]=>{
  insist(Array.isArray(value)&&value.length===2&&typeof value[1]==="string"&&value[1].length<=63,"ENS setup: invalid reverse parent readback")
  return [readAddress(value[0]),value[1]]
}
const wireReverse=async(o:RegistryOps,child:Hex,parent:Hex,parentLabel:string)=>{
  const before=parentPair(await o.read(child,REGISTRY_VIEWS,"getParent"))
  if(same(before[0],parent)&&before[1]===parentLabel)return
  insist(before[0]===ZERO&&before[1]==="","ENS setup: existing conflicting reverse parent requires explicit migration")
  await o.send(`set-parent:${child}`,child,PERMISSIONED_REGISTRY_ABI,"setParent",[parent,parentLabel],{child,parent,label:parentLabel})
  const after=parentPair(await o.read(child,REGISTRY_VIEWS,"getParent"))
  insist(same(after[0],parent)&&after[1]===parentLabel,"ENS setup: reverse parent write did not match readback")
}
export const wireParent=async(c:RegistryContext,a:ParentWiring,d:RegistryDriver):Promise<void>=>{
  const rootLabel=rootParts(a.root);insist(a.rootLabel===rootLabel,"ENS setup: root label mismatch")
  const o=registryOps(c,d);await o.chain();await ownedRoot(c,o,rootLabel)
  const registry=await deployUserRegistry(c,a.root,d,a.sellerRegistry),resolver=await deployResolver(c,d,a.resolver)
  const currentRegistry=readAddress(await o.read(c.deployment.ethRegistry,PERMISSIONED_REGISTRY_ABI,"getSubregistry",[rootLabel]))
  const currentResolver=readAddress(await o.read(c.deployment.ethRegistry,REGISTRY_VIEWS,"getResolver",[rootLabel]))
  const reverse=parentPair(await o.read(registry,REGISTRY_VIEWS,"getParent"))
  insist((currentRegistry===ZERO||same(currentRegistry,registry))&&(currentResolver===ZERO||same(currentResolver,resolver))&&
    (reverse[0]===ZERO&&reverse[1]===""||same(reverse[0],c.deployment.ethRegistry)&&reverse[1]===rootLabel),"ENS setup: conflicting parent pointers require explicit migration")
  for(const [method,readMethod,target,current] of [["setSubregistry","getSubregistry",registry,currentRegistry],["setResolver","getResolver",resolver,currentResolver]] as const){
    if(same(current,target))continue
    await ownedRoot(c,o,rootLabel)
    await o.send(method,c.deployment.ethRegistry,PERMISSIONED_REGISTRY_ABI,method,[labelId(rootLabel),target],{root:a.root,target})
    insist(same(await o.read(c.deployment.ethRegistry,readMethod==="getResolver"?REGISTRY_VIEWS:PERMISSIONED_REGISTRY_ABI,readMethod,[rootLabel]),target),"ENS setup: parent pointer write did not match readback")
  }
  await ownedRoot(c,o,rootLabel)
  await wireReverse(o,registry,c.deployment.ethRegistry,rootLabel)
}
const sellerState=async(o:RegistryOps,registry:Hex,sellerLabel:string)=>{
  const value=await o.read(registry,PERMISSIONED_REGISTRY_ABI,"getState",[labelId(sellerLabel)])
  insist(object(value)&&[0,1,2].includes(value["status"] as number)&&uint(value["expiry"],64)&&uint(value["tokenId"])&&uint(value["resource"]),"ENS setup: invalid seller state readback")
  return {status:value["status"],expiry:value["expiry"],owner:readAddress(value["latestOwner"]),resource:value["resource"]}
}
export const registerSeller=async(c:RegistryContext,a:SellerRequest,d:RegistryDriver):Promise<Hex>=>{
  const rootLabel=rootParts(a.root),name=arcadeSellerName({root:a.root,sellerLabel:a.sellerLabel}),seller=address(a.seller)
  insist(label(a.sellerLabel)===a.sellerLabel,"ENS setup: canonical seller label required")
  const now=()=>{const value=d.nowSeconds();insist(Number.isSafeInteger(value)&&value>=0,"ENS setup: invalid clock");return BigInt(value)}
  insist(uint(a.expiry,64)&&a.expiry>now(),"ENS setup: explicit future seller expiry required")
  const o=registryOps(c,d);await o.chain();await ownedRoot(c,o,rootLabel)
  const registry=await deployUserRegistry(c,a.root,d,a.sellerRegistry),resolver=await deployResolver(c,d,a.resolver)
  const mount=parentPair(await o.read(registry,REGISTRY_VIEWS,"getParent"))
  insist(same(await o.read(c.deployment.ethRegistry,PERMISSIONED_REGISTRY_ABI,"getSubregistry",[rootLabel]),registry)&&
    same(await o.read(c.deployment.ethRegistry,REGISTRY_VIEWS,"getResolver",[rootLabel]),resolver)&&same(mount[0],c.deployment.ethRegistry)&&mount[1]===rootLabel,"ENS setup: parent must be wired in both directions before seller setup")
  const before=await sellerState(o,registry,a.sellerLabel)
  // ENSv2 getOwner returns zero after expiry but latestOwner survives. Expired identity
  // revival needs root RENEW, not the seller's per-name RENEW; never silently re-register.
  const fresh=before.status===0&&before.owner===ZERO&&before.expiry===0n
  insist(fresh||before.status===2&&same(before.owner,seller)&&before.expiry===a.expiry&&before.expiry>now(),"ENS setup: reserved, expired, differently owned or changed-expiry seller requires explicit recovery")
  const existing=fresh?undefined:readAddress(await o.read(registry,PERMISSIONED_REGISTRY_ABI,"getSubregistry",[a.sellerLabel]))
  if(existing!==undefined)insist(existing!==ZERO&&(a.knownSkillRegistry===undefined||same(existing,a.knownSkillRegistry)),"ENS setup: seller registry recovery coordinate mismatch")
  const verifySeller=async(skill:Hex)=>{
    const state=await sellerState(o,registry,a.sellerLabel)
    insist(state.status===2&&same(state.owner,seller)&&state.expiry===a.expiry&&state.expiry>now()&&
      same(await o.read(registry,PERMISSIONED_REGISTRY_ABI,"getOwner",[labelId(a.sellerLabel)]),seller)&&
      await o.read(registry,PERMISSIONED_REGISTRY_ABI,"getExpiry",[labelId(a.sellerLabel)])===a.expiry&&
      await o.read(registry,PERMISSIONED_REGISTRY_ABI,"roles",[state.resource,seller])===SELLER_SUBNAME_ROLES&&
      same(await o.read(registry,PERMISSIONED_REGISTRY_ABI,"getSubregistry",[a.sellerLabel]),skill)&&
      same(await o.read(registry,REGISTRY_VIEWS,"getResolver",[a.sellerLabel]),resolver),"ENS setup: seller owner/expiry/roles/pointers mismatch")
  }
  if(existing!==undefined)await verifySeller(existing)
  const skill=await deployUserRegistry(c,name,d,existing??a.knownSkillRegistry)
  const reverse=parentPair(await o.read(skill,REGISTRY_VIEWS,"getParent"))
  insist(reverse[0]===ZERO&&reverse[1]===""||same(reverse[0],registry)&&reverse[1]===a.sellerLabel,"ENS setup: conflicting skill registry mount")
  if(fresh){
    const recheck=await sellerState(o,registry,a.sellerLabel)
    insist(recheck.status===0&&recheck.owner===ZERO&&recheck.expiry===0n&&a.expiry>now(),"ENS setup: seller changed before registration")
    await ownedRoot(c,o,rootLabel)
    await o.send(`register-seller:${name}`,registry,PERMISSIONED_REGISTRY_ABI,"register",[a.sellerLabel,seller,skill,resolver,SELLER_SUBNAME_ROLES,a.expiry],
      {name,seller,registry:skill,resolver,expiry:a.expiry.toString()})
    await verifySeller(skill)
  }
  await wireReverse(o,skill,registry,a.sellerLabel)
  return skill
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

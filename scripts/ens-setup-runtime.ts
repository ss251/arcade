/** Complete bootstrap entry: public preparation precedes key access and all writes. */
import {createPublicClient,http,keccak256,parseAbi,stringToHex,type Hex} from "viem"
import {privateKeyToAccount} from "viem/accounts"
import {sepolia} from "viem/chains"
import {arcadeSellerName,decodeEnsState,ensDeploymentReader,ETH_REGISTRAR_ABI,PERMISSIONED_REGISTRY_ABI,labelId,resolveEnsDeployment,type EnsDeployment,type EnsState} from "@arcade/core"
import {ensStatePath,readEnsState,writeEnsState} from "@arcade/core/ens-state"
import {deployUserRegistry,deployResolver,registerParent,wireParent,registerSeller,type SetupArgs} from "./ens-setup.ts"
import {openSetupSession,type SetupSession} from "./ens-setup-driver.ts"
import {prepareSkillRecords,publicSetupJson,registerSkills,type EnsSkillPlan} from "./ens-setup-skills.ts"

const fail=()=>new Error("ENS setup refused; verify explicit namespace consent, separate Sepolia roles, public records and retained journal. No automatic resend.")
const insist:(value:unknown)=>asserts value=value=>{if(!value)throw fail()}
const addr=(v:unknown):v is Hex=>typeof v==="string"&&/^0x[0-9a-fA-F]{40}$/.test(v)&&!/^0x0{40}$/.test(v)
const same=(a:unknown,b:unknown)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase()
const consent=(a:SetupArgs):SetupArgs&{owner:Hex;daemon:Hex}=>{
  insist(!a.dryRun&&a.confirmedLabel===a.rootLabel&&addr(a.owner)&&addr(a.daemon)&&addr(a.seller)&&new Set([a.owner,a.seller,a.daemon].map(x=>x.toLowerCase())).size===3)
  insist(a.ttlSeconds>=60&&a.sellerTtlSeconds>=a.ttlSeconds&&a.sellerTtlSeconds<=31_536_000)
  return a as SetupArgs&{owner:Hex;daemon:Hex}
}
const DURATION=31_536_000n,MAX_FEE=100_000_000n
type Env=Readonly<Record<string,string|undefined>>
type Fetcher=(request:Request)=>Promise<Response>
export const setupPublicClient=(rpc:string,fetcher:Fetcher=fetch)=>{
  const url=new URL(rpc)
  insist(url.protocol==="https:"&&!url.username&&!url.password&&!url.search&&!url.hash&&rpc.length<=2048)
  return createPublicClient({chain:sepolia,ccipRead:false,transport:http(url.href,{retryCount:0,timeout:5000,maxResponseBodySize:262144,fetchOptions:{redirect:"error",credentials:"omit"},fetchFn:async(input,init)=>{
    const request=new Request(input,init),sent=await request.clone().json() as {id:unknown}
    const {status,value}=await publicSetupJson(request,fetcher)
    insist(status===200&&typeof value==="object"&&value!==null&&!Array.isArray(value))
    const data=value as Record<string,unknown>
    insist(data.id===sent.id&&data.jsonrpc==="2.0"&&Object.hasOwn(data,"result")!==Object.hasOwn(data,"error"))
    return Response.json(value)
  }})})
}
interface Prepared {readonly deployment:EnsDeployment;readonly plans:ReadonlyArray<EnsSkillPlan>;readonly statePath:string}
const defaults={deployUserRegistry,deployResolver,registerParent,wireParent,registerSeller,registerSkills,writeEnsState}
/** Stage seams are for offline orchestration tests; each default has its own real-codec suite. */
export const executeSetup=async(args:SetupArgs,input:Prepared,session:SetupSession,stages:typeof defaults=defaults):Promise<EnsState>=>{
  const a=consent(args),d=session.driver,c={deployment:input.deployment,owner:a.owner},root=`${a.rootLabel}.eth`
  insist(await d.chainId()===11155111&&session.journal.skillExpiry>BigInt(d.nowSeconds())&&session.journal.sellerExpiry>=session.journal.skillExpiry)
  const registered=await session.confirmed("parent-register")
  const available=await d.read({address:c.deployment.ethRegistrar,abi:ETH_REGISTRAR_ABI,functionName:"isAvailable",args:[a.rootLabel]})
  insist(registered?available===false:available===true)
  if(registered)insist(same(await d.read({address:c.deployment.ethRegistry,abi:PERMISSIONED_REGISTRY_ABI,functionName:"getOwner",args:[labelId(a.rootLabel)]}),a.owner))
  const sellerRegistry=await stages.deployUserRegistry(c,root,d,session.knownProxy(`registry:${root}`))
  const resolver=await stages.deployResolver(c,d,session.knownProxy("resolver"))
  if(!registered)await stages.registerParent({...c,rootLabel:a.rootLabel,confirmedLabel:a.confirmedLabel,subregistry:sellerRegistry,resolver,secret:session.journal.secret,duration:DURATION,maxFeeAtomic:MAX_FEE},d)
  await stages.wireParent(c,{root,rootLabel:a.rootLabel,sellerRegistry,resolver},d)
  const knownSkillRegistry=session.knownProxy(`registry:${arcadeSellerName({root,sellerLabel:a.sellerLabel})}`)
  const skillRegistry=await stages.registerSeller(c,{root,sellerLabel:a.sellerLabel,seller:a.seller,sellerRegistry,resolver,expiry:session.journal.sellerExpiry,...(knownSkillRegistry===undefined?{}:{knownSkillRegistry})},d)
  const state=decodeEnsState({root,seller:a.seller,sellerLabel:a.sellerLabel,owner:a.owner,daemon:a.daemon,sellerRegistry,skillRegistry,resolver,universalResolver:c.deployment.universalResolver,deploymentSet:c.deployment.set,ttlSeconds:a.ttlSeconds,skills:input.plans.map(({skillId,label,name,priceAtomic})=>({skillId,label,name,priceAtomic}))})
  const verified=await stages.registerSkills(c,{state,plans:input.plans,expiry:session.journal.skillExpiry},d)
  await stages.writeEnsState(verified,input.statePath)
  return verified
}

export const runEnsSetup=async(args:SetupArgs,env:Env=process.env,fetcher:Fetcher=fetch):Promise<EnsState>=>{
  const a=consent(args),root=`${a.rootLabel}.eth`
  const rpc=env["ARCADE_ENS_RPC"]??"https://ethereum-sepolia-rpc.publicnode.com",pub=setupPublicClient(rpc,fetcher)
  const deployment=await resolveEnsDeployment(ensDeploymentReader(pub))
  const servedRoot=await pub.readContract({address:deployment.universalResolver,abi:parseAbi(["function ROOT_REGISTRY() view returns(address)"]),functionName:"ROOT_REGISTRY"})
  insist(same(servedRoot,deployment.rootRegistry))
  const available=await pub.readContract({address:deployment.ethRegistrar,abi:ETH_REGISTRAR_ABI,functionName:"isAvailable",args:[a.rootLabel]})
  if(!available)insist(same(await pub.readContract({address:deployment.ethRegistry,abi:PERMISSIONED_REGISTRY_ABI,functionName:"getOwner",args:[labelId(a.rootLabel)]}),a.owner))
  const plans=await prepareSkillRecords(a,root,fetcher),statePath=ensStatePath(env),old=await readEnsState(statePath)
  if(old)insist(old.root===root&&old.seller===a.seller&&old.sellerLabel===a.sellerLabel&&old.owner===a.owner&&old.daemon===a.daemon&&old.ttlSeconds===a.ttlSeconds&&old.deploymentSet===deployment.set&&old.skills.every(s=>plans.some(p=>p.skillId===s.skillId)))
  const journalPath=env["ARCADE_ENS_SETUP_JOURNAL"]??`${statePath}.setup.json`
  insist(journalPath!==statePath&&journalPath!==env["ARCADE_CONFIG_PATH"])
  // Deliberately accessed last: the public role addresses and all unsigned skill
  // records must already be valid. Keychain retrieval belongs to the owner command.
  const ownerKey=env["ARCADE_ENS_OWNER_KEY"],daemonKey=env["ARCADE_ENS_DAEMON_KEY"]
  insist(typeof ownerKey==="string"&&/^0x[0-9a-fA-F]{64}$/.test(ownerKey)&&typeof daemonKey==="string"&&/^0x[0-9a-fA-F]{64}$/.test(daemonKey))
  insist(same(privateKeyToAccount(ownerKey as Hex).address,a.owner)&&same(privateKeyToAccount(daemonKey as Hex).address,a.daemon))
  const binding=keccak256(stringToHex(JSON.stringify({args:a,deployment,plans,duration:DURATION.toString(),maxFeeAtomic:MAX_FEE.toString()})))
  const session=await openSetupSession({path:journalPath,privateKey:ownerKey as Hex,rpcUrl:rpc,binding,root,owner:a.owner,seller:a.seller,daemon:a.daemon,ttlSeconds:a.ttlSeconds,sellerTtlSeconds:a.sellerTtlSeconds,fetch:fetcher})
  try{return await executeSetup(a,{deployment,plans,statePath},session)}finally{await session.close()}
}

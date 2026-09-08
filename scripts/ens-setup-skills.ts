/** Read-only listing/challenge preparation and owner-driven skill registration stages. */
import { decodeFunctionResult,encodeAbiParameters,encodeFunctionData,keccak256,parseAbi,stringToHex,type Abi,type Hex } from "viem"
import { namehash } from "viem/ens"
import { decodePublicListingSync,decodeEnsState,arcadeSellerName,arcadeSkillName,parsePrice,skillTextRecords,labelId,dnsNameOf,ENS_TEXT_KEYS,PERMISSIONED_REGISTRY_ABI,PERMISSIONED_RESOLVER_ABI,RegistryRoles,ResolverRoles,SKILL_SUBNAME_ROLES,type EnsSkillState,type EnsState } from "@arcade/core"
import { canaryInputFor } from "../apps/hub/src/canary-input.ts"
import { deployUserRegistry,deployResolver,type SetupArgs,type RegistryContext,type RegistryDriver } from "./ens-setup.ts"

type Fetcher=(request:Request)=>Promise<Response>
export interface EnsSkillPlan extends EnsSkillState {readonly records:ReadonlyArray<{readonly key:string;readonly value:string}>}
const fail=()=>new Error("ENS setup: public skill preflight failed; check seller, exact unsigned challenge and verified identity; private diagnostics withheld")
const insist:(value:unknown)=>asserts value=value=>{if(!value)throw fail()}
const object=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value)
const same=(a:unknown,b:string)=>typeof a==="string"&&a.toLowerCase()===b.toLowerCase()
const address=(v:unknown):v is `0x${string}`=>typeof v==="string"&&/^0x[0-9a-fA-F]{40}$/.test(v)&&!/^0x0{40}$/.test(v)
const IDENTITY="0x8004A818BFB912233c491871b3d84c89A494BD9e",ARC_RPC="https://rpc.testnet.arc.io"
const SPLITTER_VIEWS=parseAbi(["function version() view returns(uint8)","function seller() view returns(address)","function usdc() view returns(address)","function feeBps() view returns(uint16)"])

export const publicSetupJson=async(request:Request,fetcher:Fetcher=fetch):Promise<{status:number;value:unknown}>=>{
  let safeHeaders=true
  request.headers.forEach((_value,key)=>{if(key!=="content-type")safeHeaders=false})
  insist(safeHeaders)
  const url=new URL(request.url)
  insist(!url.username&&!url.password&&!url.search&&!url.hash&&(url.protocol==="https:"||url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname)))
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000)
  let body:ReadableStreamDefaultReader<Uint8Array>|undefined,abort:(()=>void)|undefined
  try{
    return await Promise.race([(async()=>{
      const response=await fetcher(new Request(request,{redirect:"error",credentials:"omit",signal:controller.signal}))
      insist(!controller.signal.aborted&&!response.redirected&&response.body&&Number(response.headers.get("content-length"))<=262144)
      body=response.body.getReader();let total=0,text="";const decoder=new TextDecoder("utf-8",{fatal:true})
      for(;;){const next=await body.read();if(next.done)break;total+=next.value.byteLength;insist(total<=262144);text+=decoder.decode(next.value,{stream:true})}
      return {status:response.status,value:JSON.parse(text+decoder.decode()) as unknown}
    })(),new Promise<never>((_,reject)=>{abort=()=>reject(fail());controller.signal.addEventListener("abort",abort,{once:true})})])
  }catch{throw fail()}finally{clearTimeout(timer);if(abort)controller.signal.removeEventListener("abort",abort);controller.abort();void body?.cancel().catch(()=>{})}
}
const verifiedAgent=async(raw:unknown,a:SetupArgs,fetcher:Fetcher)=>{
  if(a.agentId===undefined)return undefined
  insist(object(raw)&&raw.agentId===a.agentId&&raw.verified===true&&raw.chain==="eip155:5042002"&&same(raw.registry,IDENTITY))
  const rpc=async(method:string,params:unknown[])=>{
    const {status,value}=await publicSetupJson(new Request(ARC_RPC,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})}),fetcher)
    insist(status===200&&object(value)&&value.id===1&&value.jsonrpc==="2.0"&&Object.hasOwn(value,"result")&&!Object.hasOwn(value,"error"));return value.result
  }
  insist(await rpc("eth_chainId",[])==="0x4cef52")
  const abi=parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"])
  const result=await rpc("eth_call",[{to:IDENTITY,data:encodeFunctionData({abi,functionName:"ownerOf",args:[BigInt(a.agentId)]})},"latest"])
  insist(typeof result==="string"&&/^0x[0-9a-fA-F]{64}$/.test(result))
  insist(same(decodeFunctionResult({abi,functionName:"ownerOf",data:result as `0x${string}`}),a.seller))
  return {chainId:5042002,registry:IDENTITY,agentId:a.agentId}
}
const verifySplitter=async(payTo:Hex,seller:Hex,fetcher:Fetcher)=>{
  const rpc=async(method:string,params:unknown[])=>{
    const {status,value}=await publicSetupJson(new Request(ARC_RPC,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})}),fetcher)
    insist(status===200&&object(value)&&value.id===1&&value.jsonrpc==="2.0"&&Object.hasOwn(value,"result")&&!Object.hasOwn(value,"error"));return value.result
  }
  insist(await rpc("eth_chainId",[])==="0x4cef52")
  for(const fn of ["version","seller","usdc","feeBps"] as const){
    const result=await rpc("eth_call",[{to:payTo,data:encodeFunctionData({abi:SPLITTER_VIEWS,functionName:fn})},"latest"])
    insist(typeof result==="string"&&/^0x[0-9a-fA-F]{64}$/.test(result))
    const value=decodeFunctionResult({abi:SPLITTER_VIEWS,functionName:fn,data:result as Hex})
    insist(fn==="version"?value===2:fn==="feeBps"?value===500:fn==="seller"?same(value,seller):same(value,"0x3600000000000000000000000000000000000000"))
  }
}
/** Prepare all records before any namespace write; probes have no wallet/signature. */
export const prepareSkillRecords=async(a:SetupArgs,root:string,fetcher:Fetcher=fetch):Promise<ReadonlyArray<EnsSkillPlan>>=>{
  try{
    insist(a.skillIds.length>0&&a.skillIds.length<=64)
    const plans:EnsSkillPlan[]=[]
    for(const skillId of a.skillIds){
      const name=arcadeSkillName({root,sellerLabel:a.sellerLabel,skillId})
      const response=await publicSetupJson(new Request(`${a.hubUrl}/listings/${skillId}`),fetcher),raw=response.value
      insist(response.status===200&&object(raw)&&same(raw.seller,a.seller)&&raw.delisted===false&&raw.id===skillId)
      const listing=decodePublicListingSync(raw),input=canaryInputFor(listing)
      insist(input.ok)
      const priceAtomic=parsePrice(listing.price),endpoint=`${a.hubUrl}/x/${a.seller}/${skillId}`
      const challenge=await publicSetupJson(new Request(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input.value)}),fetcher)
      insist(challenge.status===402&&object(challenge.value)&&challenge.value.x402Version===2&&Array.isArray(challenge.value.accepts)&&challenge.value.accepts.length>=1&&challenge.value.accepts.length<=8)
      /*
       * A listing may advertise several rails; an ENS leaf describes exactly one route,
       * because it carries one `arcade.payTo` and one `arcade.priceAtomic`. So SELECT the
       * validated FeeSplitterV2 Arc rail rather than assuming the listing offers nothing
       * else — a hub that also offers Gateway is a richer listing, not a malformed one.
       * Selecting is still not guessing: exactly one candidate must match, and it is then
       * held to every check the single-rail form applied.
       */
      const candidates=challenge.value.accepts.filter(a=>object(a)&&object(a.extra)&&a.extra.feeSplitterVersion===2)
      insist(candidates.length===1)
      const req=candidates[0]
      insist(object(req)&&req.scheme==="exact"&&req.network==="eip155:5042002"&&same(req.asset,"0x3600000000000000000000000000000000000000")&&req.amount===priceAtomic.toString()&&req.resource===endpoint&&address(req.payTo))
      // Setup explicitly targets the validated FeeSplitterV2 Arc rail, not a guessed seller payout.
      insist(object(req.extra)&&req.extra.feeSplitterVersion===2&&same(req.extra.feeSplitter,req.payTo))
      await verifySplitter(req.payTo,a.seller,fetcher)
      const agentRegistration=await verifiedAgent(raw.erc8004,a,fetcher)
      const records=skillTextRecords({name,endpoint,payTo:req.payTo,caip2:req.network,priceAtomic,webUrl:`${a.webUrl}/skill/${skillId}`,mcpUrl:a.mcpUrl,context:`${skillId} on ARCADE: a paid x402 endpoint on Arc testnet. USDC pays arcade.payTo on arcade.chain only after valid output.`,...(agentRegistration===undefined?{}:{agentRegistration})})
      plans.push(Object.freeze({skillId,label:skillId,name,priceAtomic:priceAtomic.toString(),records}))
    }
    return Object.freeze(plans)
  }catch{throw fail()}
}

const ZERO=`0x${"00".repeat(20)}` as Hex,ZERO32=`0x${"00".repeat(32)}` as Hex
const VIEWS=parseAbi(["function getResolver(string label) view returns(address)","function getParent() view returns(address parent,string label)","function getAlias(bytes fromName) view returns(bytes)","function roles(uint256 resource,address account) view returns(uint256)"])
/** Official PermissionedResolverLib resource(node,partHash(key)); undefined key is wildcard. */
export const resolverResource=(node:Hex,key?:string):bigint=>{
  insist(/^0x[0-9a-fA-F]{64}$/.test(node)&&(key===undefined||key.length<=256))
  const part=key===undefined?ZERO32:keccak256(stringToHex(key))
  return node===ZERO32&&part===ZERO32?0n:BigInt(keccak256(encodeAbiParameters([{type:"bytes32"},{type:"bytes32"}],[node,part])))
}
const bounded=<T>(work:()=>Promise<T>,ms=5000):Promise<T>=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(fail()),ms)
  Promise.resolve().then(work).then(v=>{clearTimeout(timer);resolve(v)},()=>{clearTimeout(timer);reject(fail())})
})
const uint=(v:unknown,bits=256):v is bigint=>typeof v==="bigint"&&v>=0n&&v<2n**BigInt(bits)
export interface SkillRegistrationRequest {readonly state:EnsState;readonly plans:ReadonlyArray<EnsSkillPlan>;readonly expiry:bigint}
/** Returns public state only after every exact owner/expiry/record/grant readback.
 * Existing historical expired names need owner revival, never a new registration. */
export const registerSkills=async(c:RegistryContext,a:SkillRegistrationRequest,d:RegistryDriver):Promise<EnsState>=>{
  try{
    const state=decodeEnsState(a.state),owner=c.owner.toLowerCase(),daemon=state.daemon
    insist(state.owner===owner&&owner!==state.seller&&daemon!==undefined&&daemon!==owner&&daemon!==state.seller&&state.deploymentSet===c.deployment.set&&state.skills.length===a.plans.length)
    const now=()=>{const t=d.nowSeconds();insist(Number.isSafeInteger(t)&&t>=0);return BigInt(t)}
    insist(uint(a.expiry,64)&&a.expiry>now()&&a.expiry<=now()+BigInt(state.ttlSeconds)+60n)
    const plans=a.plans.map(plan=>{
      const skill=state.skills.find(s=>s.skillId===plan.skillId)
      insist(skill&&skill.label===plan.label&&skill.name===plan.name&&skill.priceAtomic===plan.priceAtomic&&plan.records.length>=6&&plan.records.length<=8)
      const map=new Map(plan.records.map(r=>[r.key,r.value]));insist(map.size===plan.records.length)
      const context=map.get(ENS_TEXT_KEYS.context);insist(typeof context==="string"&&context.includes("\n\n"))
      const registration=plan.records.filter(r=>r.key.startsWith("agent-registration["));insist(registration.length<=1)
      const agentId=registration[0]?.key.match(/^agent-registration\[0x00010000034cef52148004a818bfb912233c491871b3d84c89a494bd9e\]\[(0|[1-9][0-9]{0,77})\]$/)?.[1]
      if(registration.length)insist(agentId!==undefined&&BigInt(agentId)<2n**256n&&registration[0]!.value==="1")
      const records=skillTextRecords({name:skill.name,endpoint:map.get(ENS_TEXT_KEYS.endpoint)??"",payTo:map.get(ENS_TEXT_KEYS.payTo)??"",caip2:map.get(ENS_TEXT_KEYS.chain)??"",priceAtomic:BigInt(skill.priceAtomic),webUrl:map.get(ENS_TEXT_KEYS.web)??"",mcpUrl:map.get(ENS_TEXT_KEYS.mcp),context:context.slice(0,context.lastIndexOf("\n\n")),...(agentId===undefined?{}:{agentRegistration:{chainId:5042002,registry:IDENTITY,agentId}})})
      insist(map.get(ENS_TEXT_KEYS.chain)==="eip155:5042002"&&records.length===map.size&&records.every(r=>map.get(r.key)===r.value)&&new URL(map.get(ENS_TEXT_KEYS.endpoint)!).pathname===`/x/${state.seller}/${skill.skillId}`)
      return {skill,records,node:namehash(skill.name)}
    })
    insist(new Set(plans.map(p=>p.skill.skillId)).size===state.skills.length)
    const chain=async()=>insist(await bounded(d.chainId)===11155111)
    const read=(target:string,abi:Abi,functionName:string,args:readonly unknown[]=[])=>bounded(()=>d.read({address:target as Hex,abi,functionName,args}))
    const send=async(step:string,target:string,abi:Abi,functionName:string,args:readonly unknown[],metadata:Readonly<Record<string,string>>)=>{
      await chain();await bounded(()=>d.checkpoint({step,state:"intent",metadata}))
      const tx=await bounded(()=>d.send(step,{address:target as Hex,abi,functionName,args}),90000)
      insist(/^0x[0-9a-fA-F]{64}$/.test(tx));await bounded(()=>d.checkpoint({step,state:"confirmed",txHash:tx,metadata}))
    }
    await chain()
    await deployUserRegistry(c,arcadeSellerName(state),d,state.skillRegistry as Hex)
    await deployResolver(c,d,state.resolver as Hex)
    const hierarchy=async()=>{
      const rootLabel=state.root.slice(0,-4)
      insist(same(await read(c.deployment.ethRegistry,PERMISSIONED_REGISTRY_ABI,"getOwner",[labelId(rootLabel)]),owner))
      insist(same(await read(c.deployment.ethRegistry,PERMISSIONED_REGISTRY_ABI,"getSubregistry",[rootLabel]),state.sellerRegistry))
      insist(same(await read(state.sellerRegistry,PERMISSIONED_REGISTRY_ABI,"getOwner",[labelId(state.sellerLabel)]),state.seller))
      insist(same(await read(state.sellerRegistry,PERMISSIONED_REGISTRY_ABI,"getSubregistry",[state.sellerLabel]),state.skillRegistry))
      const parent=await read(state.skillRegistry,VIEWS,"getParent")
      insist(Array.isArray(parent)&&same(parent[0],state.sellerRegistry)&&parent[1]===state.sellerLabel)
      for(const [registry,label] of [[c.deployment.ethRegistry,rootLabel],[state.sellerRegistry,state.sellerLabel]]){
        const expiry=await read(registry!,PERMISSIONED_REGISTRY_ABI,"getExpiry",[labelId(label!)])
        insist(uint(expiry,64)&&expiry>=a.expiry&&same(await read(registry!,VIEWS,"getResolver",[label!]),state.resolver))
      }
    }
    await hierarchy()
    const skillState=async(skill:EnsSkillState)=>{
      const s=await read(state.skillRegistry,PERMISSIONED_REGISTRY_ABI,"getState",[labelId(skill.label)])
      insist(object(s)&&[0,1,2].includes(s.status as number)&&uint(s.expiry,64)&&uint(s.resource)&&uint(s.tokenId)&&typeof s.latestOwner==="string")
      insist((s.status===0&&s.expiry===0n&&s.latestOwner===ZERO)||(s.status===2&&same(s.latestOwner,state.seller)&&s.expiry===a.expiry&&s.expiry>now()))
      if(s.status===2)insist(await read(state.skillRegistry,PERMISSIONED_REGISTRY_ABI,"roles",[s.resource,state.seller])===SKILL_SUBNAME_ROLES&&same(await read(state.skillRegistry,PERMISSIONED_REGISTRY_ABI,"getSubregistry",[skill.label]),ZERO)&&same(await read(state.skillRegistry,VIEWS,"getResolver",[skill.label]),state.resolver))
      return s
    }
    const narrow=async(skill:EnsSkillState,node:Hex)=>{
      const renew=await read(state.skillRegistry,PERMISSIONED_REGISTRY_ABI,"roles",[labelId(skill.label),daemon])
      insist(renew===0n||renew===RegistryRoles.RENEW)
      insist(await read(state.skillRegistry,PERMISSIONED_REGISTRY_ABI,"roles",[0n,daemon])===0n)
      for(const resource of [0n,resolverResource(node)])insist(await read(state.resolver,VIEWS,"roles",[resource,daemon])===0n)
      for(const key of Object.values(ENS_TEXT_KEYS)){
        insist(await read(state.resolver,VIEWS,"roles",[resolverResource(ZERO32,key),daemon])===0n)
        const roles=await read(state.resolver,VIEWS,"roles",[resolverResource(node,key),daemon])
        insist(key===ENS_TEXT_KEYS.priceAtomic?(roles===0n||roles===ResolverRoles.SET_TEXT):roles===0n)
      }
      insist(await read(state.resolver,VIEWS,"getAlias",[dnsNameOf(skill.name)])==="0x")
    }
    // Validate every name/grant before creating any of the leaves.
    for(const {skill,node} of plans){await skillState(skill);await narrow(skill,node)}
    for(const {skill,node,records} of plans){
      await hierarchy();await narrow(skill,node)
      let current=await skillState(skill)
      const metadata={name:skill.name,registry:state.skillRegistry,resolver:state.resolver,daemon,expiry:a.expiry.toString()}
      if(current.status===0){
        await send(`register-skill:${skill.name}`,state.skillRegistry,PERMISSIONED_REGISTRY_ABI,"register",[skill.label,state.seller,ZERO,state.resolver,SKILL_SUBNAME_ROLES,a.expiry],metadata)
        current=await skillState(skill);insist(current.status===2)
      }
      const values=await Promise.all(records.map(r=>read(state.resolver,PERMISSIONED_RESOLVER_ABI,"text",[node,r.key])))
      if(records.some((r,i)=>r.value!==values[i])){
        // Never overwrite an already populated different record on a reused name.
        insist(values.every((v,i)=>v===""||v===records[i]!.value))
        await send(`records:${skill.name}`,state.resolver,PERMISSIONED_RESOLVER_ABI,"multicall",[records.map(r=>encodeFunctionData({abi:PERMISSIONED_RESOLVER_ABI,functionName:"setText",args:[node,r.key,r.value]}))],metadata)
        for(const r of records)insist(await read(state.resolver,PERMISSIONED_RESOLVER_ABI,"text",[node,r.key])===r.value)
      }
      if(await read(state.skillRegistry,PERMISSIONED_REGISTRY_ABI,"roles",[current.resource,daemon])===0n){
        await send(`renew-grant:${skill.name}`,state.skillRegistry,PERMISSIONED_REGISTRY_ABI,"grantRoles",[labelId(skill.label),RegistryRoles.RENEW,daemon],metadata)
        insist(await read(state.skillRegistry,PERMISSIONED_REGISTRY_ABI,"roles",[current.resource,daemon])===RegistryRoles.RENEW)
      }
      const priceResource=resolverResource(node,ENS_TEXT_KEYS.priceAtomic)
      if(await read(state.resolver,VIEWS,"roles",[priceResource,daemon])===0n){
        await send(`price-grant:${skill.name}`,state.resolver,PERMISSIONED_RESOLVER_ABI,"authorizeTextRoles",[dnsNameOf(skill.name),ENS_TEXT_KEYS.priceAtomic,daemon,true],metadata)
        insist(await read(state.resolver,VIEWS,"roles",[priceResource,daemon])===ResolverRoles.SET_TEXT)
      }
      await narrow(skill,node)
    }
    return state
  }catch{throw new Error("ENS skill registration refused or outcome uncertain; inspect the private journal before retrying. No automatic resend.")}
}

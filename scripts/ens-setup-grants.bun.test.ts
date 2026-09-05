import { describe,expect,it } from "bun:test"
import { decodeFunctionData,encodeAbiParameters,keccak256,parseAbi,stringToHex,type Hex } from "viem"
import { namehash } from "viem/ens"
import { ALL_ROLES,PERMISSIONED_RESOLVER_ABI,RegistryRoles,ResolverRoles,SKILL_SUBNAME_ROLES,loadEnsDeployments,userRegistrySalt,ownedResolverSalt,skillTextRecords } from "@arcade/core"
import { registerSkills,resolverResource } from "./ens-setup-skills.ts"
import type { RegistryDriver } from "./ens-setup.ts"

const owner=`0x${"11".repeat(20)}` as Hex,seller=`0x${"22".repeat(20)}` as Hex,daemon=`0x${"33".repeat(20)}` as Hex
const sellerRegistry=`0x${"44".repeat(20)}` as Hex,skillRegistry=`0x${"55".repeat(20)}` as Hex,resolver=`0x${"66".repeat(20)}` as Hex,payTo=`0x${"77".repeat(20)}` as Hex
const root="arcade.eth",name="flow.seller.arcade.eth",zero=`0x${"00".repeat(20)}` as Hex
const fixture=()=>{
  const deployment=loadEnsDeployments()[0]!,sends:{step:string;fn:string;args:readonly unknown[]}[]=[],records=new Map<string,string>(),roles=new Map<string,bigint>()
  let registered=false
  const plan={skillId:"flow",label:"flow",name,priceAtomic:"10000",records:skillTextRecords({name,endpoint:`https://hub.example/x/${seller}/flow`,payTo,caip2:"eip155:5042002",priceAtomic:10000n,webUrl:"https://hub.example/skill/flow",context:"flow"})}
  const state={root,sellerLabel:"seller",seller,owner,daemon,deploymentSet:"A",universalResolver:deployment.universalResolver,sellerRegistry,skillRegistry,resolver,ttlSeconds:3600,skills:[{skillId:"flow",label:"flow",name,priceAtomic:"10000"}]}
  const driver:RegistryDriver={chainId:async()=>11155111,nowSeconds:()=>1000,wait:async()=>{},checkpoint:async()=>{},getCode:async()=>"0x6000",simulate:async()=>{throw Error("not needed")},readReceipt:async()=>{throw Error("not needed")},read:async call=>{
    const resolverCall=call.address===resolver
    if(call.functionName==="getVerifiableProxyData")return [keccak256(encodeAbiParameters([{type:"address"},{type:"uint256"}],[owner,resolverCall?ownedResolverSalt(owner):userRegistrySalt("seller.arcade.eth")])),resolverCall?deployment.permissionedResolverImpl:deployment.userRegistryImpl]
    if(call.functionName==="verifiableProxyFactory")return deployment.verifiableFactory
    if(call.functionName==="verifyContract")return call.args[0]===resolver?deployment.permissionedResolverImpl:deployment.userRegistryImpl
    if(call.functionName==="roles")return call.args[1]===owner?ALL_ROLES:call.args[1]===seller?SKILL_SUBNAME_ROLES:roles.get(`${call.address}:${String(call.args[0])}`)??0n
    if(call.functionName==="getOwner")return call.address===deployment.ethRegistry?owner:seller
    if(call.functionName==="getExpiry")return call.address===skillRegistry?4600n:999999n
    if(call.functionName==="getSubregistry")return call.address===deployment.ethRegistry?sellerRegistry:call.address===sellerRegistry?skillRegistry:zero
    if(call.functionName==="getParent")return [sellerRegistry,"seller"]
    if(call.functionName==="getResolver")return resolver
    if(call.functionName==="getAlias")return "0x"
    if(call.functionName==="getState")return {status:registered?2:0,expiry:registered?4600n:0n,latestOwner:registered?seller:zero,tokenId:1n,resource:1n}
    if(call.functionName==="text")return records.get(String(call.args[1]))??""
    throw Error(`unexpected ${call.functionName}`)
  },send:async(step,call)=>{
    sends.push({step,fn:call.functionName,args:call.args})
    if(call.functionName==="register")registered=true
    if(call.functionName==="multicall")for(const data of call.args[0] as Hex[]){const decoded=decodeFunctionData({abi:PERMISSIONED_RESOLVER_ABI,data});if(decoded.functionName==="setText")records.set(decoded.args[1],decoded.args[2])}
    if(call.functionName==="grantRoles")roles.set(`${skillRegistry}:1`,RegistryRoles.RENEW)
    if(call.functionName==="authorizeTextRoles")roles.set(`${resolver}:${resolverResource(namehash(name),"arcade.priceAtomic")}`,ResolverRoles.SET_TEXT)
    return `0x${sends.length.toString(16).padStart(64,"0")}`
  }}
  return {driver,state,plan,sends,records,roles,context:{deployment,owner}}
}
describe("owner-driven exact skill grants",()=>{
  it("registers one leaf, writes atomic records then grants only renewal and one text key",async()=>{
    const s=fixture()
    const result=await registerSkills(s.context,{state:s.state,plans:[s.plan],expiry:4600n},s.driver)
    expect(result).toEqual(s.state)
    expect(s.sends.map(s=>s.fn)).toEqual(["register","multicall","grantRoles","authorizeTextRoles"])
    expect(s.sends[0]!.args).toEqual(["flow",seller,zero,resolver,SKILL_SUBNAME_ROLES,4600n])
    expect(s.sends[3]!.args[1]).toBe("arcade.priceAtomic")
    expect(s.records.get("arcade.payTo")).toBe(payTo)
    await registerSkills(s.context,{state:s.state,plans:[s.plan],expiry:4600n},s.driver)
    expect(s.sends).toHaveLength(4)
  })
  it("refuses chain mismatch, historical expired names, wrong owner or broad daemon rights",async()=>{
    for(const mode of ["chain","expired","owner","wide"]){
      const s=fixture(),read=s.driver.read
      const driver={...s.driver,chainId:async()=>mode==="chain"?1:11155111,read:async(call:Parameters<RegistryDriver["read"]>[0])=>{
        if(mode==="expired"&&call.functionName==="getState")return {status:0,expiry:999n,latestOwner:seller,tokenId:1n,resource:1n}
        if(mode==="owner"&&call.functionName==="getOwner")return daemon
        if(mode==="wide"&&call.functionName==="roles"&&call.args[1]===daemon)return ALL_ROLES
        return read(call)
      }}
      await expect(registerSkills(s.context,{state:s.state,plans:[s.plan],expiry:4600n},driver)).rejects.toThrow()
      expect(s.sends).toHaveLength(0)
    }
  })
  it("refuses malformed plans and alias redirection before creating a name",async()=>{
    const s=fixture(),read=s.driver.read
    await expect(registerSkills(s.context,{state:s.state,plans:[{...s.plan,name:"other.seller.arcade.eth"}],expiry:4600n},s.driver)).rejects.toThrow()
    await expect(registerSkills(s.context,{state:s.state,plans:[s.plan],expiry:4600n},{...s.driver,read:async call=>call.functionName==="getAlias"?"0x00":read(call)})).rejects.toThrow()
    expect(s.sends).toHaveLength(0)
  })
  it("refuses an ineffective record transaction and never retries its broadcast",async()=>{
    const s=fixture(),send=s.driver.send
    await expect(registerSkills(s.context,{state:s.state,plans:[s.plan],expiry:4600n},{...s.driver,send:async(step,call)=>{const tx=await send(step,call);if(call.functionName==="multicall")s.records.clear();return tx}})).rejects.toThrow()
    expect(s.sends.filter(s=>s.fn==="multicall")).toHaveLength(1)
    expect(s.sends.some(s=>s.fn==="grantRoles")).toBe(false)
  })
  it("matches official resource(node,keccak(bytes(key))) encoding",()=>{
    const node=namehash(name),part=keccak256(stringToHex("arcade.priceAtomic"))
    expect(resolverResource(node,"arcade.priceAtomic")).toBe(BigInt(keccak256(encodeAbiParameters([{type:"bytes32"},{type:"bytes32"}],[node,part]))))
  })
})

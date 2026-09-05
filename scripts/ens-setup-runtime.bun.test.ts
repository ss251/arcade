import {describe,expect,it} from "bun:test"
import {decodeEnsState,loadEnsDeployments,skillTextRecords,type EnsState} from "@arcade/core"
import {executeSetup,runEnsSetup} from "./ens-setup-runtime.ts"
import {parseSetupArgs,type RegistryDriver} from "./ens-setup.ts"
import type {SetupSession} from "./ens-setup-driver.ts"

const owner="0x1111111111111111111111111111111111111111",seller="0x2222222222222222222222222222222222222222",daemon="0x3333333333333333333333333333333333333333"
const registry="0x4444444444444444444444444444444444444444",resolver="0x5555555555555555555555555555555555555555",skills="0x6666666666666666666666666666666666666666"
const a=parseSetupArgs(["--seller",seller,"--skills","test-skill","--root-label","arcade","--confirm-root-label","arcade","--owner",owner,"--daemon",daemon])
const d=loadEnsDeployments()[0]!,name="test-skill.0x2222222222222222222222222222222222222222.arcade.eth"
const plans=[{skillId:"test-skill",label:"test-skill",name:`test-skill.${a.sellerLabel}.arcade.eth`,priceAtomic:"10000",records:skillTextRecords({name:`test-skill.${a.sellerLabel}.arcade.eth`,endpoint:`http://localhost:8787/x/${seller}/test-skill`,payTo:registry,caip2:"eip155:5042002",priceAtomic:10000n,webUrl:"http://localhost:8787/skill/test-skill",context:"Test"})}]
const fixture=()=>{
  const events:string[]=[],saved:EnsState[]=[]
  let confirmed=false,available=true,fail=false
  const driver={chainId:async()=>11155111,nowSeconds:()=>1000,read:async(call:any)=>call.functionName==="isAvailable"?available:owner} as RegistryDriver
  const session={driver,journal:{secret:`0x${"ab".repeat(32)}` as const,sellerExpiry:8000000n,skillExpiry:22600n},knownProxy:(kind:string)=>kind==="resolver"?resolver:kind==="registry:arcade.eth"?registry:skills,confirmed:async()=>{events.push("proof");return confirmed},close:async()=>{}} satisfies SetupSession
  const stages:NonNullable<Parameters<typeof executeSetup>[3]>={
    deployUserRegistry:async()=>{events.push("registry");return registry},deployResolver:async()=>{events.push("resolver");return resolver},
    registerParent:async()=>{events.push("parent");return `0x${"cd".repeat(32)}` as const},wireParent:async()=>{events.push("wire")},
    registerSeller:async()=>{events.push("seller");return skills},registerSkills:async(_c:any,request:any)=>{events.push("skills");if(fail)throw Error("uncertain");return request.state},
    writeEnsState:async(value:unknown)=>{const state=decodeEnsState(value);events.push("save");saved.push(state);return state}
  }
  return {events,saved,session,stages,setConfirmed:()=>{confirmed=true;available=false},setTaken:()=>{available=false},setFailure:()=>{fail=true}}
}
describe("complete ENS bootstrap orchestration",()=>{
  it("runs all namespace stages and writes only the fully verified public state",async()=>{
    const f=fixture(),state=await executeSetup(a,{deployment:d,plans,statePath:"/tmp/test-ens.json"},f.session,f.stages)
    expect(f.events).toEqual(["proof","registry","resolver","parent","wire","seller","skills","save"])
    expect(state).toMatchObject({root:"arcade.eth",owner,daemon,seller,sellerRegistry:registry,skillRegistry:skills,resolver,skills:[{name:plans[0]!.name}]})
    expect(f.saved).toEqual([state])
  })
  it("skips reveal only for a freshly re-proven journal parent and still verifies all mounts and records",async()=>{
    const f=fixture();f.setConfirmed()
    await executeSetup(a,{deployment:d,plans,statePath:"/tmp/test-ens.json"},f.session,f.stages)
    expect(f.events).not.toContain("parent");expect(f.events).toContain("wire");expect(f.saved).toHaveLength(1)
  })
  it("does not adopt an already owned namespace without this journal's exact registration proof",async()=>{
    const f=fixture();f.setTaken()
    await expect(executeSetup(a,{deployment:d,plans,statePath:"/tmp/test-ens.json"},f.session,f.stages)).rejects.toThrow()
    expect(f.events).toEqual(["proof"]);expect(f.saved).toHaveLength(0)
  })
  it("never publishes state after an uncertain registration or grant stage",async()=>{
    const f=fixture();f.setFailure()
    await expect(executeSetup(a,{deployment:d,plans,statePath:"/tmp/test-ens.json"},f.session,f.stages)).rejects.toThrow()
    expect(f.events.at(-1)).toBe("skills");expect(f.saved).toHaveLength(0)
  })
  it("requires exact label consent, distinct explicit roles and compatible TTLs before touching key env",async()=>{
    let reads=0
    const env=new Proxy({}, {get(){reads++;throw Error("must not read keys")}})
    for(const patch of [{confirmedLabel:undefined},{confirmedLabel:"another"},{owner:undefined},{daemon:seller},{sellerTtlSeconds:60}])await expect(runEnsSetup({...a,...patch} as any,env)).rejects.toThrow()
    expect(reads).toBe(0)
  })
})

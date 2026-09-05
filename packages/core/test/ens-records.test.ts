import { describe, expect, it } from "vitest"
import { ENS_TEXT_KEYS, decodeEnsState, loadEnsDeployments, skillTextRecords } from "../src/ens.ts"

const seller=`0x${"11".repeat(20)}`, payout=`0x${"22".repeat(20)}`
const base={name:"flow.seller.arcade.eth",endpoint:`https://hub.example/x/${seller}/flow`,payTo:payout,caip2:"eip155:5042002",priceAtomic:50000n,webUrl:"https://arcade.example/skill/flow",mcpUrl:"https://mcp.example/mcp",context:"Checks a wallet's USDC flow on Arc."}
const state=()=>({root:"arcade.eth",sellerLabel:"seller",seller,deploymentSet:"A",universalResolver:loadEnsDeployments()[0]!.universalResolver,sellerRegistry:`0x${"33".repeat(20)}`,skillRegistry:`0x${"44".repeat(20)}`,resolver:`0x${"55".repeat(20)}`,ttlSeconds:3600,skills:[{skillId:"flow",label:"flow",name:base.name,priceAtomic:"50000"}]})
describe("ENS records bind exact integer payment facts",()=>{
  it("records payout independently of route seller, plus ENSIP26 structured context",()=>{
    const values=Object.fromEntries(skillTextRecords(base).map(r=>[r.key,r.value]))
    expect(values[ENS_TEXT_KEYS.payTo]).toBe(payout)
    expect(values[ENS_TEXT_KEYS.endpoint]).toBe(base.endpoint)
    expect(values[ENS_TEXT_KEYS.chain]).toBe(base.caip2)
    expect(values[ENS_TEXT_KEYS.priceAtomic]).toBe("50000")
    expect(JSON.parse(values[ENS_TEXT_KEYS.context]!.split("\n\n")[1]!)).toMatchObject({payTo:payout,chain:base.caip2,priceAtomic:"50000",protocol:"x402",mcp:base.mcpUrl})
  })
  it("does not invent an MCP endpoint or attestation when absent",()=>{
    const records=skillTextRecords({...base,mcpUrl:undefined})
    expect(records.some(x=>x.key===ENS_TEXT_KEYS.mcp)).toBe(false)
    expect(records.some(x=>x.key.startsWith("agent-registration["))).toBe(false)
  })
  it("uses corrected ERC7930 independent byte lengths and optional attestation",()=>{
    const record=skillTextRecords({...base,agentRegistration:{chainId:5042002,registry:"0x8004A818BFB912233c491871b3d84c89A494BD9e",agentId:"167"}}).find(x=>x.key.startsWith("agent-registration["))!
    expect(record.key).toBe("agent-registration[0x00010000034cef52148004a818bfb912233c491871b3d84c89a494bd9e][167]")
    expect(record.value).toBe("1")
  })
  it("never rounds through Number and returns immutable bounded records",()=>{
    const priceAtomic=9007199254740993n, records=skillTextRecords({...base,priceAtomic})
    expect(records.find(r=>r.key===ENS_TEXT_KEYS.priceAtomic)?.value).toBe(priceAtomic.toString())
    expect(Object.isFrozen(records)).toBe(true); expect(records.every(Object.isFrozen)).toBe(true)
  })
  it.each([{payTo:"0x1"},{payTo:`0x${"00".repeat(20)}`},{caip2:"eip155:01"},{priceAtomic:-1n},{priceAtomic:2n**256n},{name:"flow..eth"},{context:"x".repeat(4097)}, {endpoint:`https://user:secret@hub.example/x/${seller}/flow`},{endpoint:`https://hub.example/x/${seller}/flow?secret=1`},{endpoint:`https://hub.example/a/../x/${seller}/flow`},{endpoint:`https://hub.example/x/${seller}/other`},{mcpUrl:"https://user:secret@mcp.example/mcp"}])("rejects unsafe or incoherent payment metadata %#",extra=>{
    expect(()=>skillTextRecords({...base,...extra})).toThrow()
  })
})
describe("ENS state decoding",()=>{
  it("round-trips exact public state into immutable structures",()=>{
    const input=state(), output=decodeEnsState(input)
    expect(output).toEqual(input);expect(Object.isFrozen(output)).toBe(true);expect(Object.isFrozen(output.skills)).toBe(true);expect(Object.isFrozen(output.skills[0])).toBe(true)
  })
  it.each([{seller:"bad"},{root:"a.b.eth"},{deploymentSet:"C"},{universalResolver:"0x1"},{ttlSeconds:59},{ttlSeconds:NaN},{skills:[]},{secret:"DO_NOT_SERIALIZE"},{privateKey:"DO_NOT_SERIALIZE"},{skills:[{skillId:"flow",label:"flow",name:"other.seller.arcade.eth",priceAtomic:"1"}]},{skills:[{skillId:"flow",label:"flow",name:base.name,priceAtomic:"01"}]}])("refuses malformed or secret-bearing state %#",extra=>{
    expect(()=>decodeEnsState({...state(),...extra})).toThrow()
  })
  it("does not invoke accessors or accept duplicate skill identities",()=>{
    let invoked=false
    const input={...state(),get owner(){invoked=true;return seller}}
    expect(()=>decodeEnsState(input)).toThrow();expect(invoked).toBe(false)
    const duplicate=state();duplicate.skills.push(duplicate.skills[0]!);expect(()=>decodeEnsState(duplicate)).toThrow()
  })
})

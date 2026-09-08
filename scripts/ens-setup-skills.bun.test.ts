import { describe,expect,it } from "bun:test"
import { parseSetupArgs } from "./ens-setup.ts"
import { prepareSkillRecords,publicSetupJson } from "./ens-setup-skills.ts"
import {decodeFunctionData,encodeFunctionResult,parseAbi,type Hex} from "viem"

const seller=`0x${"11".repeat(20)}`,splitter=`0x${"22".repeat(20)}`
const args=parseSetupArgs(["--seller",seller,"--seller-label","seller","--skills","flow","--hub","https://hub.example","--confirm-root-label","arcade"])
const listing={id:"flow",version:"0.1.0",serviceName:"Flow",description:"Checks flow",tags:[],price:"$0.01",bounds:{timeoutSec:30},inputSchema:{type:"object",properties:{address:{type:"string"}},required:["address"],additionalProperties:false},outputSchema:{type:"object"},canaryInput:{address:seller},seller,delisted:false}
const SPLITTER_ABI=parseAbi(["function version() view returns(uint8)","function seller() view returns(address)","function usdc() view returns(address)","function feeBps() view returns(uint16)"])
const fixture=(change:Record<string,unknown>={},challengeChange:Record<string,unknown>={},chainChange:Record<string,unknown>={})=>{
  const requests:Request[]=[]
  const fetcher=async(req:Request)=>{
    requests.push(req)
    if(req.url==="https://rpc.testnet.arc.io/"){
      const rpc=await req.json() as {method:string;params?:[{to:string;data:Hex}]}
      let result:unknown=chainChange.chain??"0x4cef52"
      if(rpc.method!=="eth_chainId"){
        if(rpc.params?.[0].to===splitter){
          const decoded=decodeFunctionData({abi:SPLITTER_ABI,data:rpc.params[0].data}),fn=decoded.functionName
          const values={version:2,seller,usdc:"0x3600000000000000000000000000000000000000",feeBps:500,...chainChange}
          result=encodeFunctionResult({abi:SPLITTER_ABI,functionName:fn,result:values[fn] as never})
        }else result=`0x${"0".repeat(24)}${seller.slice(2)}`
      }
      return Response.json({jsonrpc:"2.0",id:1,result})
    }
    if(req.method==="GET")return Response.json({...listing,...change})
    return Response.json({x402Version:2,accepts:[{scheme:"exact",network:"eip155:5042002",asset:"0x3600000000000000000000000000000000000000",payTo:splitter,amount:"10000",resource:req.url,extra:{feeSplitter:splitter,feeSplitterVersion:2},...challengeChange}]},{status:402})
  }
  return {requests,fetcher}
}
describe("ENS skill public preflight",()=>{
  it("uses the real unsigned challenge's splitter payee, never the listing seller",async()=>{
    const f=fixture(),plans=await prepareSkillRecords(args,"arcade.eth",f.fetcher)
    expect(plans[0]!.name).toBe("flow.seller.arcade.eth")
    expect(plans[0]!.priceAtomic).toBe("10000")
    expect(plans[0]!.records.find(r=>r.key==="arcade.payTo")?.value).toBe(splitter)
    expect(plans[0]!.records.some(r=>r.key==="agent-endpoint[mcp]")).toBe(false)
    expect(f.requests.slice(0,2).map(r=>r.method)).toEqual(["GET","POST"])
    // Bun1.3.14 misreports Request.credentials as "include" even for explicit omit;
    // this server-side fetch has no ambient browser cookie jar. Assert actual headers.
    expect(f.requests.every(r=>!["payment-signature","authorization","cookie"].some(h=>r.headers.has(h))&&r.redirect==="error")).toBe(true)
    expect(await f.requests[1]!.json()).toEqual(listing.canaryInput)
  })
  it("selects the FeeSplitterV2 rail when the listing also advertises Gateway",async()=>{
    // The live hub offers eip3009 and gateway for the same listing. An ENS leaf carries one
    // payTo, so the preflight must pick the splitter route rather than refuse the listing.
    const gateway={scheme:"exact",network:"eip155:5042002",asset:"0x3600000000000000000000000000000000000000",
      payTo:seller,amount:"10000",resource:"https://hub.example/x/"+seller+"/flow",
      extra:{name:"GatewayWalletBatched",version:"1",verifyingContract:`0x${"33".repeat(20)}`}}
    const requests:Request[]=[]
    const base=fixture()
    const fetcher=async(req:Request)=>{
      const response=await base.fetcher(req)
      requests.push(req)
      if(response.status!==402)return response
      const body=await response.json() as {accepts:unknown[]}
      return Response.json({...body,accepts:[gateway,...body.accepts]},{status:402})
    }
    const plans=await prepareSkillRecords(args,"arcade.eth",fetcher)
    expect(plans[0]!.records.find(r=>r.key==="arcade.payTo")?.value).toBe(splitter)
    expect(requests.length).toBeGreaterThan(0)
  })
  it("refuses when two accepts both claim to be the FeeSplitterV2 rail",async()=>{
    const base=fixture()
    const fetcher=async(req:Request)=>{
      const response=await base.fetcher(req)
      if(response.status!==402)return response
      const body=await response.json() as {accepts:unknown[]}
      return Response.json({...body,accepts:[...body.accepts,...body.accepts]},{status:402})
    }
    await expect(prepareSkillRecords(args,"arcade.eth",fetcher)).rejects.toThrow()
  })
  it("refuses when no accept is the FeeSplitterV2 rail",async()=>{
    const f=fixture({},{extra:{name:"GatewayWalletBatched",version:"1"}})
    await expect(prepareSkillRecords(args,"arcade.eth",f.fetcher)).rejects.toThrow()
  })
  it("refuses a challenge with more accepts than the bound, before any chain read",async()=>{
    const base=fixture()
    const filler=(i:number)=>({scheme:"exact",network:"eip155:5042002",asset:"0x3600000000000000000000000000000000000000",
      payTo:seller,amount:"10000",resource:"r"+i,extra:{name:"GatewayWalletBatched",version:"1"}})
    const fetcher=async(req:Request)=>{
      const response=await base.fetcher(req)
      if(response.status!==402)return response
      const body=await response.json() as {accepts:unknown[]}
      return Response.json({...body,accepts:[...Array.from({length:8},(_,i)=>filler(i)),...body.accepts]},{status:402})
    }
    await expect(prepareSkillRecords(args,"arcade.eth",fetcher)).rejects.toThrow()
  })
  it("does not admit a decoy whose feeSplitterVersion is the string \"2\"",async()=>{
    // A loose == would make two candidates and refuse; a loose selection would pick the
    // decoy. Strict === keeps exactly one candidate, and it is the real splitter rail.
    const decoy={scheme:"exact",network:"eip155:5042002",asset:"0x3600000000000000000000000000000000000000",
      payTo:`0x${"44".repeat(20)}`,amount:"10000",resource:"decoy",extra:{feeSplitter:`0x${"44".repeat(20)}`,feeSplitterVersion:"2"}}
    const base=fixture()
    const fetcher=async(req:Request)=>{
      const response=await base.fetcher(req)
      if(response.status!==402)return response
      const body=await response.json() as {accepts:unknown[]}
      return Response.json({...body,accepts:[decoy,...body.accepts]},{status:402})
    }
    const plans=await prepareSkillRecords(args,"arcade.eth",fetcher)
    expect(plans[0]!.records.find(r=>r.key==="arcade.payTo")?.value).toBe(splitter)
  })
  it("rejects a hub-asserted splitter whose public Arc contract disagrees",async()=>{
    for(const change of [{chain:"0x1"},{version:1},{seller:splitter},{usdc:splitter},{feeBps:1000}]){
      const f=fixture({},{},change)
      await expect(prepareSkillRecords(args,"arcade.eth",f.fetcher)).rejects.toThrow()
    }
  })
  it("rejects stale, wrong-seller, differently-priced or invalid input before any ENS write",async()=>{
    for(const change of [{seller:splitter},{delisted:true},{id:"other"},{price:"$1e9"},{canaryInput:{invalid:true}}]){
      const f=fixture(change);await expect(prepareSkillRecords(args,"arcade.eth",f.fetcher)).rejects.toThrow()
    }
    for(const change of [{amount:"9999"},{network:"eip155:1"},{asset:splitter},{resource:"https://other.example"},{payTo:seller}]){
      const f=fixture({},change);await expect(prepareSkillRecords(args,"arcade.eth",f.fetcher)).rejects.toThrow()
    }
  })
  it("requires independently verified registration metadata before publishing an ENSIP25 attestation",async()=>{
    const a={...args,agentId:"167"},f=fixture()
    await expect(prepareSkillRecords(a,"arcade.eth",f.fetcher)).rejects.toThrow()
    const good=fixture({erc8004:{agentId:"167",verified:true,chain:"eip155:5042002",registry:"0x8004A818BFB912233c491871b3d84c89A494BD9e"}})
    expect((await prepareSkillRecords(a,"arcade.eth",good.fetcher))[0]!.records.some(r=>r.key.startsWith("agent-registration[")&&r.value==="1")).toBe(true)
  })
  it("does not leak response bodies and bounds oversized content",async()=>{
    for(const fetcher of [async()=>new Response("SECRET",{status:500}),async()=>new Response("SECRET".repeat(50000))]){
      await expect(prepareSkillRecords(args,"arcade.eth",fetcher)).rejects.not.toThrow("SECRET")
    }
  })
  it("refuses credential-bearing requests without contacting the endpoint",async()=>{
    let calls=0
    for(const header of ["authorization","cookie","payment-signature","x-payment"]){
      await expect(publicSetupJson(new Request("https://hub.example",{headers:{[header]:"PRIVATE"}}),async()=>{calls++;return Response.json({})})).rejects.not.toThrow("PRIVATE")
    }
    expect(calls).toBe(0)
  })
})

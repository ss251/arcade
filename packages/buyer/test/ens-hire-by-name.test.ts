import {describe,expect,it,vi} from "vitest"
import {Effect} from "effect"
import {privateKeyToAccount} from "viem/accounts"
import {ARC_CAIP2,USDC_ADDRESS} from "@arcade/core"
import {HEADER_PAYMENT_SIGNATURE} from "@arcade/payments"
import {callSkill} from "../src/index.ts"
import type {EnsReader} from "../src/ens-policy.ts"

const SELLER="0x1111111111111111111111111111111111111111",PAYEE="0x2222222222222222222222222222222222222222"
const NAME="flow.seller.arcade.eth",ENDPOINT=`https://hub.example/x/${SELLER}/flow`
const reader:EnsReader={getEnsText:async({key})=>({"arcade.endpoint":ENDPOINT,"arcade.payTo":PAYEE,"arcade.chain":ARC_CAIP2,"arcade.priceAtomic":"10000"})[key]??null}
const fixture=(change:Record<string,unknown>={},pollUrl="https://hub.example/jobs/job_test/result",wireChange:Record<string,unknown>={})=>{
  const account=privateKeyToAccount(`0x${"01".repeat(32)}`),sign=vi.spyOn(account,"signTypedData")
  const calls:Request[]=[],fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const request=new Request(String(input),init);calls.push(request)
    if(request.method==="GET")return Response.json({job_id:"job_test",status:"succeeded",result:{ok:true},receipt:{settled:true},...wireChange})
    if(request.headers.has(HEADER_PAYMENT_SIGNATURE))return Response.json({job_id:"job_test",poll_url:pollUrl},{status:202})
    return Response.json({x402Version:2,accepts:[{scheme:"exact",network:ARC_CAIP2,amount:"10000",asset:USDC_ADDRESS,payTo:PAYEE,resource:ENDPOINT,mimeType:"application/json",maxTimeoutSeconds:604900,extra:{},...change}]},{status:402})
  }) as typeof globalThis.fetch
  return {account,sign,calls,fetch:fetcher}
}
const run=(f:ReturnType<typeof fixture>,extra:Record<string,unknown>={})=>Effect.runPromise(Effect.either(callSkill({name:NAME,input:{ok:true},account:f.account,ensReader:reader,fetch:f.fetch,pollIntervalMs:1,maxWaitMs:10,...extra})))
describe("hire by ENS name before signature",()=>{
  it("uses the resolved endpoint and splitter, signs once, polls with the same injected fetch and fences the route seller",async()=>{
    const f=fixture(),result=await run(f)
    expect(result).toMatchObject({_tag:"Right",right:{jobId:"job_test",result:{ok:true}}})
    expect(f.calls.map(r=>r.url)).toEqual([ENDPOINT,ENDPOINT,"https://hub.example/jobs/job_test/result"])
    expect(f.sign).toHaveBeenCalledTimes(1);expect(f.calls[1]?.headers.has(HEADER_PAYMENT_SIGNATURE)).toBe(true)
    if(result._tag==="Right")expect(result.right.fencedResult).toContain(SELLER)
    expect(f.calls.every(r=>r.redirect==="error"&&r.credentials==="omit")).toBe(true)
  })
  it.each([{payTo:SELLER},{network:"eip155:1"}])("refuses ENS challenge disagreement before any signature %j",async change=>{
    const f=fixture(change),result=await run(f)
    expect(result).toMatchObject({_tag:"Left",left:{method:"beforeSign",reason:expect.stringContaining("ens_payto_mismatch")}})
    expect(f.sign).not.toHaveBeenCalled();expect(f.calls).toHaveLength(1)
  })
  it.each([{asset:SELLER},{resource:"https://other.example/x/seller/flow"}])("does not sign an unrelated asset/resource even with agreeing ENS payee %j",async change=>{
    const f=fixture(change);expect((await run(f))._tag).toBe("Left")
    expect(f.sign).not.toHaveBeenCalled();expect(f.calls).toHaveLength(1)
  })
  it("does not contact the hub or sign when the name is absent",async()=>{
    const f=fixture(),result=await run(f,{ensReader:{getEnsText:async()=>null}})
    expect(result).toMatchObject({_tag:"Left",left:{_tag:"EnsNameExpired"}})
    expect(f.calls).toHaveLength(0);expect(f.sign).not.toHaveBeenCalled()
  })
  it("pins the expected hub before exposing a sandbox lineage capability on the first probe",async()=>{
    const f=fixture(),result=await run(f,{expectedHubUrl:"https://other.example",lineage:"PRIVATE_CAPABILITY"})
    expect(result).toMatchObject({_tag:"Left",left:{_tag:"RpcFailure"}})
    expect(f.calls).toHaveLength(0);expect(f.sign).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain("PRIVATE_CAPABILITY")
    const same=fixture();expect((await run(same,{expectedHubUrl:"https://hub.example",lineage:"cap.fixture"}))._tag).toBe("Right")
  })
  it("refuses a foreign poll URL without a second purchase or foreign fetch",async()=>{
    const f=fixture({},"https://foreign.example/jobs/job_test/result")
    expect((await run(f))._tag).toBe("Left");expect(f.calls).toHaveLength(2);expect(f.sign).toHaveBeenCalledTimes(1)
  })
  it("preserves the hub's same-origin per-job access token while keeping it out of diagnostics",async()=>{
    const poll=`https://hub.example/jobs/job_test/result?token=${"ab".repeat(16)}`,f=fixture({},poll)
    expect((await run(f))._tag).toBe("Right");expect(f.calls[2]?.url).toBe(poll)
  })
  it.each([{pollIntervalMs:0},{maxWaitMs:0},{maxWaitMs:Infinity},{maxAmountAtomic:-1n}])("validates caller bounds before any request or signature %#",async extra=>{
    const f=fixture();expect((await run(f,extra))._tag).toBe("Left")
    expect(f.calls).toHaveLength(0);expect(f.sign).not.toHaveBeenCalled()
  })
  it("requires a known issuing hub when a by-name caller carries lineage",async()=>{
    const f=fixture();expect((await run(f,{lineage:"PRIVATE_CAPABILITY"}))._tag).toBe("Left")
    expect(f.calls).toHaveLength(0);expect(f.sign).not.toHaveBeenCalled()
  })
  it("reports only the locally authorized amount, overriding forged remote accounting",async()=>{
    const f=fixture({},undefined,{authorizedAmountAtomic:"1"}),result=await run(f)
    expect(result).toMatchObject({_tag:"Right",right:{authorizedAmountAtomic:10000n}})
  })
  it("never accepts a server-supplied authorized amount when no signature was made",async()=>{
    const f=fixture(),fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>init?.method==="POST"
      ? Response.json({job_id:"job_test",poll_url:"https://hub.example/jobs/job_test/result"})
      : Response.json({job_id:"job_test",status:"succeeded",result:{ok:true},receipt:{settled:false},authorizedAmountAtomic:"10000"})) as typeof globalThis.fetch
    const result=await run(f,{fetch:fetcher})
    expect(result._tag).toBe("Right")
    if(result._tag==="Right")expect(result.right).not.toHaveProperty("authorizedAmountAtomic")
    expect(f.sign).not.toHaveBeenCalled()
  })
})

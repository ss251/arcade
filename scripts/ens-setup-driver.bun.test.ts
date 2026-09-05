import { afterEach, describe, expect, it, spyOn } from "bun:test"
import { mkdtemp, readFile, writeFile, stat, chmod, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decodeFunctionData, encodeAbiParameters, encodeErrorResult, encodeEventTopics, encodeFunctionData, keccak256, parseAbi, parseTransaction, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ALL_ROLES, loadEnsDeployments, MOCK_USDC_ABI, USER_REGISTRY_INIT_ABI, VERIFIABLE_FACTORY_ABI, userRegistrySalt } from "@arcade/core"
import { openSetupSession, type SetupSessionOptions } from "./ens-setup-driver.ts"

const key=`0x${"01".repeat(32)}` as Hex,owner=privateKeyToAccount(key).address.toLowerCase() as Hex
const seller=`0x${"22".repeat(20)}` as Hex,daemon=`0x${"33".repeat(20)}` as Hex,binding=`0x${"ab".repeat(32)}` as Hex
const deployment=loadEnsDeployments()[0]!,target=deployment.mockUsdc
const call={address:target,abi:MOCK_USDC_ABI,functionName:"mint",args:[owner,1n]} as const
const blockHash=`0x${"bc".repeat(32)}`,zeroHash=`0x${"00".repeat(32)}`
const dirs:string[]=[],sessions:{close:()=>Promise<void>}[]=[]
afterEach(async()=>{for(const s of sessions.splice(0))await s.close();for(const p of dirs.splice(0))await rm(p,{recursive:true,force:true})})
const fixture=async()=>{
  const dir=await mkdtemp(join(tmpdir(),"ens-setup-driver-"));dirs.push(dir)
  const path=join(dir,"setup.json"),methods:string[]=[],sent:Hex[]=[],transactions=new Map<Hex,Record<string,unknown>>(),logs=new Map<Hex,unknown[]>()
  let timestamp=1000,chain="0xaa36a7",receiptPatch:Record<string,unknown>={},transactionPatch:Record<string,unknown>={},uncertain=false
  let intercept:((method:string,request:Request)=>Promise<Response|undefined>)|undefined
  const fetcher=async(request:Request):Promise<Response>=>{
    const body=await request.clone().json() as {id:number;method:string;params:unknown[]};methods.push(body.method)
    const overridden=await intercept?.(body.method,request);if(overridden)return overridden
    let result:unknown
    switch(body.method){
      case "eth_chainId":result=chain;break
      case "eth_getBlockByNumber":result={number:"0x64",hash:blockHash,parentHash:zeroHash,timestamp:`0x${timestamp.toString(16)}`,baseFeePerGas:"0x1",gasLimit:"0x1c9c380",gasUsed:"0x0",transactions:[],extraData:"0x",miner:owner,nonce:"0x0000000000000000",logsBloom:`0x${"00".repeat(256)}`,receiptsRoot:zeroHash,stateRoot:zeroHash,transactionsRoot:zeroHash,difficulty:"0x0",totalDifficulty:"0x0",size:"0x1",mixHash:zeroHash,uncles:[]};break
      case "eth_getTransactionCount":result="0x0";break
      case "eth_maxPriorityFeePerGas":case "eth_gasPrice":result="0x1";break
      case "eth_estimateGas":result="0x100000";break
      case "eth_call":result=encodeAbiParameters([{type:"uint256"}],[123n]);break
      case "eth_getCode":result="0x6000";break
      case "eth_sendRawTransaction":{
        const raw=body.params[0] as Hex,tx=keccak256(raw),parsed=parseTransaction(raw)
        const journal=JSON.parse(await readFile(path,"utf8")) as {entries:{state:string;txHash:string}[]}
        expect(journal.entries.some(e=>e.state==="submitted"&&e.txHash===tx)).toBe(true)
        sent.push(raw);transactions.set(tx,{hash:tx,from:owner,to:parsed.to,input:parsed.data,value:"0x0",chainId:"0xaa36a7",blockHash,blockNumber:"0x64"})
        if(uncertain)return Response.json({jsonrpc:"2.0",id:body.id,error:{code:-32000,message:`PRIVATE ${key}`}})
        result=tx;break
      }
      case "eth_getTransactionReceipt":{const tx=body.params[0] as Hex;result=transactions.has(tx)?{transactionHash:tx,status:"0x1",from:owner,to:transactions.get(tx)!.to,blockHash,blockNumber:"0x64",logs:logs.get(tx)??[],...receiptPatch}:null;break}
      case "eth_getTransactionByHash":result={...transactions.get(body.params[0] as Hex),...transactionPatch};break
      default:throw new Error(`unhandled fixture method ${body.method}`)
    }
    return Response.json({jsonrpc:"2.0",id:body.id,result})
  }
  const options:SetupSessionOptions={path,privateKey:key,rpcUrl:"https://rpc.invalid",binding,root:"arcade.eth",owner,seller,daemon,ttlSeconds:3600,sellerTtlSeconds:86400,fetch:fetcher,pollMs:1,receiptTimeoutMs:200,rpcTimeoutMs:200}
  const open=async(overrides:Partial<SetupSessionOptions>={})=>{const session=await openSetupSession({...options,...overrides});sessions.push(session);return session}
  return {path,options,open,methods,sent,transactions,logs,setUncertain:()=>{uncertain=true},setTimestamp:(v:number)=>{timestamp=v},setChain:(v:string)=>{chain=v},setReceipt:(v:Record<string,unknown>)=>{receiptPatch=v},setTransaction:(v:Record<string,unknown>)=>{transactionPatch=v},setIntercept:(v:typeof intercept)=>{intercept=v}}
}
describe("private exclusive ENS setup session",()=>{
  it("persists stable chain-derived expiries and private secret, never the wallet key; locks the whole session",async()=>{
    const f=await fixture(),s=await f.open(),first=s.journal
    expect(first.sellerExpiry).toBe(87400n);expect(first.skillExpiry).toBe(4600n)
    expect((await stat(f.path)).mode&0o777).toBe(0o600)
    const bytes=await readFile(f.path,"utf8");expect(bytes).not.toContain(key);expect(bytes).toContain(first.secret)
    await expect(f.open()).rejects.toThrow();await s.close();f.setTimestamp(1500)
    const resumed=await f.open();expect(resumed.journal).toEqual(first)
  })
  it("refuses changed binding/roles, duplicate roles, wrong signer and unsafe or malformed existing documents",async()=>{
    const f=await fixture(),s=await f.open();await s.close()
    for(const override of [{binding:zeroHash as Hex},{seller:owner},{privateKey:`0x${"02".repeat(32)}` as Hex},{daemon:seller}])await expect(f.open(override)).rejects.toThrow()
    const text=await readFile(f.path,"utf8")
    await writeFile(f.path,JSON.stringify({...JSON.parse(text),privateKey:key}),{mode:0o600});await expect(f.open()).rejects.not.toThrow(key)
    await writeFile(f.path,text);await chmod(f.path,0o644);await expect(f.open()).rejects.toThrow()
  })
  it("refuses symlinks and an old prebroadcast intent before any new RPC or write",async()=>{
    const f=await fixture(),s=await f.open();await s.driver.checkpoint({step:"mock-usdc-mint",state:"intent"});await s.close()
    const bytes=await readFile(f.path,"utf8"),count=f.methods.length
    await expect(f.open()).rejects.toThrow();expect(await readFile(f.path,"utf8")).toBe(bytes);expect(f.methods).toHaveLength(count)
    const linked=join(f.path,"..","linked.json");await symlink(f.path,linked);await expect(f.open({path:linked})).rejects.toThrow()
  })
  it("refuses overlapping checkpoint writes rather than losing a durable intent",async()=>{
    const f=await fixture(),s=await f.open()
    const first=s.driver.checkpoint({step:"mock-usdc-mint",state:"intent"})
    await expect(s.driver.checkpoint({step:"mock-usdc-approve",state:"intent"})).rejects.toThrow()
    await first;expect(JSON.parse(await readFile(f.path,"utf8")).entries).toHaveLength(1)
  })
})
describe("actual viem signing against an offline RPC",()=>{
  it("proves only a known exact completed step and never treats an absent or hashless intent as completed",async()=>{
    const f=await fixture(),s=await f.open()
    expect(await s.confirmed("parent-register")).toBe(false)
    await s.driver.checkpoint({step:"mock-usdc-mint",state:"intent"})
    await expect(s.confirmed("mock-usdc-mint")).rejects.toThrow()
    await s.driver.send("mock-usdc-mint",call)
    expect(await s.confirmed("mock-usdc-mint")).toBe(true);expect(f.sent).toHaveLength(1)
    f.setTransaction({input:"0x"});await expect(s.confirmed("mock-usdc-mint")).rejects.toThrow();expect(f.sent).toHaveLength(1)
  })
  it("persists exact call and deterministic hash before one raw broadcast, verifies readback, and never rebroadcasts on resume",async()=>{
    const f=await fixture(),s=await f.open()
    await expect(s.driver.send("mock-usdc-mint",call)).rejects.toThrow();expect(f.sent).toHaveLength(0)
    await s.driver.checkpoint({step:"mock-usdc-mint",state:"intent"})
    const tx=await s.driver.send("mock-usdc-mint",call)
    await s.driver.checkpoint({step:"mock-usdc-mint",state:"confirmed",txHash:tx})
    expect(f.sent).toHaveLength(1);expect(keccak256(f.sent[0]!)).toBe(tx)
    const raw=JSON.parse(await readFile(f.path,"utf8"));expect(raw.entries[0]).toMatchObject({to:target.toLowerCase(),data:encodeFunctionData(call),txHash:tx,state:"confirmed"})
    await s.close();const resumed=await f.open()
    await resumed.driver.checkpoint({step:"mock-usdc-mint",state:"intent"})
    expect(await resumed.driver.send("mock-usdc-mint",call)).toBe(tx);expect(f.sent).toHaveLength(1)
    await expect(resumed.driver.send("mock-usdc-mint",{...call,args:[owner,2n]})).rejects.toThrow()
  })
  it("refuses exact-hash receipt and transaction mismatches, retaining the submitted hash without another broadcast",async()=>{
    for(const patch of [{transactionHash:zeroHash},{from:seller},{to:seller},{status:"0x0"},{blockHash:zeroHash}]){
      const f=await fixture(),s=await f.open();f.setReceipt(patch)
      await s.driver.checkpoint({step:"mock-usdc-mint",state:"intent"});await expect(s.driver.send("mock-usdc-mint",call)).rejects.toThrow();await s.close()
      expect(f.sent).toHaveLength(1);await expect(f.open()).rejects.toThrow();expect(f.sent).toHaveLength(1)
    }
    const f=await fixture(),s=await f.open();f.setTransaction({input:"0x"})
    await s.driver.checkpoint({step:"mock-usdc-mint",state:"intent"});await expect(s.driver.send("mock-usdc-mint",call)).rejects.toThrow()
  })
  it("reconciles a mined transaction after an uncertain send response without signing or broadcasting a second transaction",async()=>{
    const f=await fixture(),s=await f.open();f.setUncertain()
    await s.driver.checkpoint({step:"mock-usdc-mint",state:"intent"})
    await expect(s.driver.send("mock-usdc-mint",call)).rejects.not.toThrow(key);await s.close()
    const before=JSON.parse(await readFile(f.path,"utf8")).entries[0];expect(before.state).toBe("submitted")
    const resumed=await f.open();expect(JSON.parse(await readFile(f.path,"utf8")).entries[0].state).toBe("confirmed")
    expect(await resumed.confirmed("mock-usdc-mint")).toBe(true)
    expect(await resumed.driver.send("mock-usdc-mint",call)).toBe(before.txHash);expect(f.sent).toHaveLength(1)
  })
  it("rejects unrelated receipt log positions",async()=>{
    const f=await fixture(),s=await f.open();f.setReceipt({transactionIndex:"0x0",logs:[{transactionIndex:"0x1"}]})
    await s.driver.checkpoint({step:"mock-usdc-mint",state:"intent"})
    await expect(s.driver.send("mock-usdc-mint",call)).rejects.toThrow()
  })
  it("aborts wallet preparation on close so a delayed fee/nonce response cannot trigger a later broadcast",async()=>{
    const f=await fixture(),s=await f.open();let release:(()=>void)|undefined,signal:AbortSignal|undefined
    f.setIntercept(async(method,request)=>{if(method!=="eth_estimateGas")return;signal=request.signal;await new Promise<void>(resolve=>{release=resolve});return undefined})
    await s.driver.checkpoint({step:"mock-usdc-mint",state:"intent"});const pending=s.driver.send("mock-usdc-mint",call).catch(e=>e)
    for(let n=0;n<100&&!release;n++)await new Promise(r=>setTimeout(r,1))
    expect(release).toBeDefined();await s.close();release!();expect(await pending).toBeInstanceOf(Error)
    await new Promise(r=>setTimeout(r,10));expect(signal?.aborted).toBe(true);expect(f.sent).toHaveLength(0)
  })
  it("checks actual Sepolia before each write and refreshes chain time after wait",async()=>{
    const f=await fixture(),s=await f.open();f.setTimestamp(1001);await s.driver.wait(0);expect(s.driver.nowSeconds()).toBe(1001)
    await s.driver.checkpoint({step:"mock-usdc-mint",state:"intent"});f.setChain("0x1")
    await expect(s.driver.send("mock-usdc-mint",call)).rejects.toThrow();expect(f.sent).toHaveLength(0)
  })
  it("exposes a recovered proxy only after the exact canonical factory call and event are verified",async()=>{
    const f=await fixture(),s=await f.open(),proxy=`0x${"44".repeat(20)}` as Hex,kind="registry:arcade.eth",salt=userRegistrySalt("arcade.eth")
    const implementation=deployment.userRegistryImpl,step=`deploy-proxy:${kind}`
    expect(s.knownProxy(kind)).toBeUndefined()
    f.setIntercept(async(method,request)=>{
      if(method!=="eth_getTransactionReceipt")return
      const body=await request.clone().json() as {params:[Hex]},tx=body.params[0]
      f.logs.set(tx,[{address:deployment.verifiableFactory,
        topics:encodeEventTopics({abi:VERIFIABLE_FACTORY_ABI,eventName:"ProxyDeployed",args:{sender:owner,proxyAddress:proxy}}),
        data:encodeAbiParameters([{type:"uint256"},{type:"address"}],[salt,implementation])}])
      return undefined
    })
    const factoryCall={address:deployment.verifiableFactory,abi:VERIFIABLE_FACTORY_ABI,functionName:"deployProxy",args:[implementation,salt,encodeFunctionData({abi:USER_REGISTRY_INIT_ABI,functionName:"initialize",args:[owner,ALL_ROLES]})]} as const
    await s.driver.checkpoint({step,state:"intent",metadata:{kind,proxy,implementation,salt:String(salt),owner}})
    await s.driver.send(step,factoryCall);expect(s.knownProxy(kind)).toBe(proxy)
    await s.close();const resumed=await f.open();expect(resumed.knownProxy(kind)).toBe(proxy);expect(f.sent).toHaveLength(1)
    await resumed.close();f.setReceipt({logs:[]});await expect(f.open()).rejects.toThrow();expect(f.sent).toHaveLength(1)
  })
  it("never exposes a nominal factory deployment initialized for a different owner",async()=>{
    const f=await fixture(),s=await f.open(),proxy=`0x${"44".repeat(20)}` as Hex,kind="registry:arcade.eth",salt=userRegistrySalt("arcade.eth")
    const implementation=deployment.userRegistryImpl,step=`deploy-proxy:${kind}`
    f.setReceipt({logs:[{address:deployment.verifiableFactory,
      topics:encodeEventTopics({abi:VERIFIABLE_FACTORY_ABI,eventName:"ProxyDeployed",args:{sender:owner,proxyAddress:proxy}}),
      data:encodeAbiParameters([{type:"uint256"},{type:"address"}],[salt,implementation])}]})
    const factoryCall={address:deployment.verifiableFactory,abi:VERIFIABLE_FACTORY_ABI,functionName:"deployProxy",args:[implementation,salt,encodeFunctionData({abi:USER_REGISTRY_INIT_ABI,functionName:"initialize",args:[seller,ALL_ROLES]})]} as const
    await s.driver.checkpoint({step,state:"intent",metadata:{kind,proxy,implementation,salt:String(salt),owner}})
    await expect(s.driver.send(step,factoryCall)).rejects.toThrow();expect(s.knownProxy(kind)).toBeUndefined()
  })
  it("bounds and aborts the complete response body and hides provider diagnostics",async()=>{
    const f=await fixture(),s=await f.open();let cancelled=false,signal:AbortSignal|undefined
    f.setIntercept(async(_method,request)=>{signal=request.signal;return new Response(new ReadableStream({cancel(){cancelled=true}}))})
    await expect(s.driver.getCode(target)).rejects.toThrow();expect(signal?.aborted).toBe(true);expect(cancelled).toBe(true)
    f.setIntercept(async()=>{throw new Error(`secret ${key}`)});await expect(s.driver.getCode(target)).rejects.not.toThrow(key)
  })
  it("never follows CCIP lookup URLs from fixed contract reads or simulations",async()=>{
    const f=await fixture(),s=await f.open(),errorAbi=parseAbi(["error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)"])
    const data=encodeErrorResult({abi:errorAbi,errorName:"OffchainLookup",args:[target,["https://not-approved.invalid/{data}"],"0x12","0x12345678","0x"]})
    f.setIntercept(async(method,request)=>{if(method!=="eth_call")return;const body=await request.clone().json() as {id:number};return Response.json({jsonrpc:"2.0",id:body.id,error:{code:3,message:"execution reverted",data}})})
    let escaped=0
    const blockedFetch=Object.assign(async()=>{escaped++;throw new Error("Offline denied CCIP lookup")},{preconnect:()=>{}})
    const mocked=spyOn(globalThis,"fetch").mockImplementation(blockedFetch)
    try{
      const read={address:target,abi:MOCK_USDC_ABI,functionName:"balanceOf",args:[owner]} as const
      await expect(s.driver.read(read)).rejects.toThrow();await expect(s.driver.simulate(read)).rejects.toThrow()
      expect(escaped).toBe(0)
    }finally{mocked.mockRestore()}
  })
})

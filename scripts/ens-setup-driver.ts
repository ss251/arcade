/** Private, import-safe ENS bootstrap journal and Sepolia wallet boundary. No environment reads. */
import { AsyncLocalStorage } from "node:async_hooks"
import { constants } from "node:fs"
import { lstat, mkdir, open, rename, rmdir, unlink } from "node:fs/promises"
import { basename, dirname, isAbsolute, normalize } from "node:path"
import { createPublicClient, createWalletClient, decodeEventLog, decodeFunctionData, encodeEventTopics, encodeFunctionData, http, keccak256, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { ALL_ROLES, ENS_SEPOLIA_CHAIN_ID, PERMISSIONED_RESOLVER_ABI, USER_REGISTRY_INIT_ABI, VERIFIABLE_FACTORY_ABI, loadEnsDeployments, labelId, ownedResolverSalt, userRegistrySalt } from "@arcade/core"
import type { RegistryDriver, SetupCall, SetupCheckpoint } from "./ens-setup.ts"

export interface SetupSessionOptions {
  readonly path:string;readonly privateKey:Hex;readonly rpcUrl:string;readonly binding:Hex;readonly root:string
  readonly owner:Hex;readonly seller:Hex;readonly daemon:Hex;readonly ttlSeconds:number;readonly sellerTtlSeconds:number
  /** Offline transport seam; production defaults to the platform fetch. */
  readonly fetch?:(request:Request)=>Promise<Response>
  /** Tests may shorten, never enlarge, the production deadlines. */
  readonly rpcTimeoutMs?:number;readonly receiptTimeoutMs?:number;readonly pollMs?:number
}
export interface SetupSession {
  readonly driver:RegistryDriver
  readonly journal:{readonly secret:Hex;readonly sellerExpiry:bigint;readonly skillExpiry:bigint}
  readonly knownProxy:(kind:string)=>Hex|undefined
  /** No namespace adoption: true requires exact on-chain proof of this journal step. */
  readonly confirmed:(step:string)=>Promise<boolean>
  readonly close:()=>Promise<void>
}
interface Entry {
  readonly step:string;readonly state:"intent"|"submitted"|"confirmed";readonly metadata?:Readonly<Record<string,string>>
  readonly to?:Hex;readonly data?:Hex;readonly txHash?:Hex
}
interface Document {
  readonly format:"arcade-ens-setup-v1";readonly chainId:11155111;readonly binding:Hex;readonly root:string
  readonly owner:Hex;readonly seller:Hex;readonly daemon:Hex;readonly ttlSeconds:number;readonly sellerTtlSeconds:number
  readonly createdAt:string;readonly secret:Hex;readonly sellerExpiry:string;readonly skillExpiry:string;readonly entries:readonly Entry[]
}
const FILE_LIMIT=2_097_152,RPC_LIMIT=262_144
const fail=()=>new Error("ENS setup session unavailable or unsafe; reconcile retained journal, transaction hash and lock before retrying; private diagnostics withheld")
function insist(value:unknown):asserts value {if(!value)throw fail()}
const hash=(v:unknown):v is Hex=>typeof v==="string"&&/^0x[0-9a-fA-F]{64}$/.test(v)
const addr=(v:unknown):v is Hex=>typeof v==="string"&&/^0x[0-9a-fA-F]{40}$/.test(v)&&!/^0x0{40}$/.test(v)
const bytes=(v:unknown):v is Hex=>typeof v==="string"&&v.length<=131074&&/^0x(?:[0-9a-fA-F]{2})*$/.test(v)
const same=(a:unknown,b:unknown)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase()
const canonical=(a:Hex)=>a.toLowerCase() as Hex
const uint=(v:unknown,bits=64):v is string=>typeof v==="string"&&/^(0|[1-9][0-9]{0,77})$/.test(v)&&BigInt(v)<2n**BigInt(bits)
const plain=(v:unknown,fields?:readonly string[]):Record<string,unknown>=>{
  insist(typeof v==="object"&&v!==null&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype)
  const result:Record<string,unknown>={}
  for(const key of Reflect.ownKeys(v)){
    insist(typeof key==="string"&&(!fields||fields.includes(key)))
    const d=Object.getOwnPropertyDescriptor(v,key);insist(d&&"value"in d);Object.defineProperty(result,key,{value:d.value,enumerable:true})
  }
  return result
}
const metadata=(v:unknown,key:Hex):Readonly<Record<string,string>>|undefined=>{
  if(v===undefined)return undefined
  const input=plain(v),result:Record<string,string>={};insist(Object.keys(input).length<=12)
  for(const [name,value] of Object.entries(input)){
    insist(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name)&&!/(private|secret|key|credential|password|mnemonic|authorization)/i.test(name)&&
      typeof value==="string"&&value.length<=2048&&!/[\u0000-\u001f\u007f]/.test(value)&&!value.toLowerCase().includes(key.slice(2).toLowerCase()))
    result[name]=value
  }
  return Object.freeze(result)
}
const stepName=(v:unknown):v is string=>typeof v==="string"&&/^[a-z][a-zA-Z0-9:._-]{0,255}$/.test(v)
const decodeEntry=(v:unknown,key:Hex):Entry=>{
  const e=plain(v,["step","state","metadata","to","data","txHash"])
  insist(stepName(e.step)&&(e.state==="intent"||e.state==="submitted"||e.state==="confirmed"))
  insist((e.to===undefined&&e.data===undefined||addr(e.to)&&bytes(e.data))&&(e.state==="intent"?e.txHash===undefined:hash(e.txHash)&&addr(e.to)&&bytes(e.data)))
  const m=metadata(e.metadata,key)
  return Object.freeze({step:e.step,state:e.state,...(m===undefined?{}:{metadata:m}),...(e.to===undefined?{}:{to:canonical(e.to as Hex),data:e.data as Hex}),...(e.txHash===undefined?{}:{txHash:canonical(e.txHash as Hex)})})
}
const decodeDocument=(v:unknown,a:SetupSessionOptions):Document=>{
  const d=plain(v,["format","chainId","binding","root","owner","seller","daemon","ttlSeconds","sellerTtlSeconds","createdAt","secret","sellerExpiry","skillExpiry","entries"])
  insist(d.format==="arcade-ens-setup-v1"&&d.chainId===11155111&&same(d.binding,a.binding)&&d.root===a.root&&same(d.owner,a.owner)&&same(d.seller,a.seller)&&same(d.daemon,a.daemon)&&
    d.ttlSeconds===a.ttlSeconds&&d.sellerTtlSeconds===a.sellerTtlSeconds&&uint(d.createdAt)&&BigInt(d.createdAt)>0n&&hash(d.secret)&&!/^0x0{64}$/.test(d.secret)&&
    uint(d.sellerExpiry)&&uint(d.skillExpiry)&&BigInt(d.sellerExpiry)===BigInt(d.createdAt)+BigInt(a.sellerTtlSeconds)&&BigInt(d.skillExpiry)===BigInt(d.createdAt)+BigInt(a.ttlSeconds)&&
    Array.isArray(d.entries)&&d.entries.length<=512)
  const entries=d.entries.map(v=>decodeEntry(v,a.privateKey));insist(new Set(entries.map(e=>e.step)).size===entries.length)
  return Object.freeze({format:"arcade-ens-setup-v1",chainId:11155111,binding:canonical(a.binding),root:a.root,owner:canonical(a.owner),seller:canonical(a.seller),daemon:canonical(a.daemon),
    ttlSeconds:a.ttlSeconds,sellerTtlSeconds:a.sellerTtlSeconds,createdAt:d.createdAt,secret:d.secret,sellerExpiry:d.sellerExpiry,skillExpiry:d.skillExpiry,entries:Object.freeze(entries)})
}
const readDocument=async(path:string):Promise<unknown|undefined>=>{
  let file:Awaited<ReturnType<typeof open>>
  try{file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)}catch(e){if((e as {code?:string}).code==="ENOENT")return undefined;throw fail()}
  try{
    const info=await file.stat();insist(info.isFile()&&info.nlink===1&&info.size<=FILE_LIMIT&&(info.mode&0o077)===0)
    const buffer=Buffer.alloc(FILE_LIMIT+1);let count=0
    while(count<buffer.length){const r=await file.read(buffer,count,buffer.length-count,count);if(!r.bytesRead)break;count+=r.bytesRead}
    insist(count<=FILE_LIMIT);return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buffer.subarray(0,count))) as unknown
  }finally{await file.close()}
}
const replace=async(path:string,document:Document)=>{
  const text=JSON.stringify(document);insist(Buffer.byteLength(text)<=FILE_LIMIT)
  const temporary=`${path}.${crypto.randomUUID()}.tmp`;let created=false
  try{
    const file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);created=true
    try{await file.writeFile(text);await file.sync()}finally{await file.close()}
    await rename(temporary,path);created=false
    const parent=await open(dirname(path),constants.O_RDONLY);try{await parent.sync()}finally{await parent.close()}
  }finally{if(created)await unlink(temporary).catch(()=>{})}
}
const abortRace=<T>(work:Promise<T>,signal:AbortSignal):Promise<T>=>new Promise((resolve,reject)=>{
  const stop=()=>reject(fail());signal.addEventListener("abort",stop,{once:true})
  work.then(resolve,reject).finally(()=>signal.removeEventListener("abort",stop)).catch(()=>{})
  if(signal.aborted)stop()
})
const pause=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  const stop=()=>{clearTimeout(timer);signal.removeEventListener("abort",stop);reject(fail())}
  const timer=setTimeout(()=>{signal.removeEventListener("abort",stop);resolve()},ms);signal.addEventListener("abort",stop,{once:true});if(signal.aborted)stop()
})

/** Lease covers preparation, broadcast and confirmation. A stale lease is never stolen. */
export const openSetupSession=async(a:SetupSessionOptions):Promise<SetupSession>=>{
  let locked=false,closed=false,document:Document|undefined,chainTime=0,busy=false
  const controllers=new Set<AbortController>(),workset=new Set<Promise<unknown>>(),context=new AsyncLocalStorage<AbortSignal>(),known=new Map<string,Hex>()
  let writeQueue:Promise<void>=Promise.resolve()
  const active=()=>insist(!closed&&!context.getStore()?.aborted)
  const operation=async<T>(work:()=>Promise<T>,ms:number):Promise<T>=>{
    active();const controller=new AbortController();controllers.add(controller)
    const timer=setTimeout(()=>controller.abort(),ms)
    const pending=context.run(controller.signal,()=>Promise.resolve().then(work));workset.add(pending)
    void pending.finally(()=>workset.delete(pending)).catch(()=>{})
    try{return await abortRace(pending,controller.signal)}catch{throw fail()}finally{clearTimeout(timer);controller.abort();controllers.delete(controller)}
  }
  const close=async()=>{
    if(closed)return;closed=true;for(const controller of controllers)controller.abort()
    await Promise.allSettled([...workset]);await writeQueue.catch(()=>{})
    if(locked){locked=false;await rmdir(`${a.path}.lock`)}
  }
  try{
    insist(isAbsolute(a.path)&&normalize(a.path)===a.path&&a.path.length<=2048&&basename(a.path).endsWith(".json")&&!/[\u0000-\u001f\u007f]/.test(a.path))
    insist(hash(a.privateKey)&&hash(a.binding)&&addr(a.owner)&&addr(a.seller)&&addr(a.daemon)&&new Set([a.owner,a.seller,a.daemon].map(canonical)).size===3)
    insist(a.root.endsWith(".eth")&&a.root.split(".").length===2);labelId(a.root.slice(0,-4));insist(a.root===a.root.toLowerCase())
    insist([a.ttlSeconds,a.sellerTtlSeconds].every(n=>Number.isSafeInteger(n)&&n>0&&n<=31_536_000))
    const account=privateKeyToAccount(a.privateKey);insist(same(account.address,a.owner))
    const url=new URL(a.rpcUrl);insist(url.protocol==="https:"&&!url.username&&!url.password&&!url.search&&!url.hash&&a.rpcUrl.length<=2048)
    const rpcMs=a.rpcTimeoutMs??4500,receiptMs=a.receiptTimeoutMs??75000,pollMs=a.pollMs??500
    insist(Number.isInteger(rpcMs)&&rpcMs>=10&&rpcMs<=4500&&Number.isInteger(receiptMs)&&receiptMs>=10&&receiptMs<=75000&&Number.isInteger(pollMs)&&pollMs>=1&&pollMs<=1000)
    await mkdir(dirname(a.path),{recursive:true,mode:0o700});const parent=await lstat(dirname(a.path));insist(parent.isDirectory()&&!parent.isSymbolicLink()&&(parent.mode&0o022)===0)
    await mkdir(`${a.path}.lock`,{mode:0o700});locked=true
    const raw=await readDocument(a.path);if(raw!==undefined){document=decodeDocument(raw,a);insist(document.entries.every(e=>e.state!=="intent"))}
    const transport=http(url.href,{retryCount:0,timeout:rpcMs,maxResponseBodySize:RPC_LIMIT,fetchOptions:{redirect:"error",credentials:"omit"},fetchFn:async(input,init)=>{
      active();const outer=context.getStore();insist(outer&&!outer.aborted)
      const controller=new AbortController(),signal=AbortSignal.any([outer,controller.signal]),timer=setTimeout(()=>controller.abort(),rpcMs)
      let reader:ReadableStreamDefaultReader<Uint8Array>|undefined
      try{return await abortRace((async()=>{
        const request=new Request(input,{...init,signal,redirect:"error",credentials:"omit"}),sent=await request.clone().json() as {id?:unknown}
        active();const response=await (a.fetch??fetch)(request)
        if(signal.aborted||closed){void response.body?.cancel().catch(()=>{});throw fail()}
        insist(response.ok&&!response.redirected&&response.body&&Number(response.headers.get("content-length"))<=RPC_LIMIT)
        reader=response.body.getReader();const decoder=new TextDecoder("utf-8",{fatal:true});let size=0,text=""
        for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;insist(size<=RPC_LIMIT);text+=decoder.decode(next.value,{stream:true})}
        text+=decoder.decode();const received=plain(JSON.parse(text));insist(received.id===sent.id&&received.jsonrpc==="2.0"&&Object.hasOwn(received,"result")!==Object.hasOwn(received,"error"))
        return new Response(text,{headers:{"content-type":"application/json"}})
      })(),signal)}finally{clearTimeout(timer);controller.abort();void reader?.cancel().catch(()=>{})}
    }})
    const pub=createPublicClient({chain:sepolia,transport,ccipRead:false}),wallet=createWalletClient({account,chain:sepolia,transport,ccipRead:false})
    const refresh=async()=>{const block=await pub.getBlock({blockTag:"latest"});insist(block.timestamp>0n&&block.timestamp<=BigInt(Number.MAX_SAFE_INTEGER));chainTime=Number(block.timestamp)}
    const chain=async()=>{const id=await pub.getChainId();if(id===ENS_SEPOLIA_CHAIN_ID)await refresh();return id}
    const persist=async(next:Document)=>{
      active();const checked=decodeDocument(next,a)
      const write=writeQueue.then(async()=>{active();await replace(a.path,checked);document=checked});writeQueue=write
      await write
    }
    const save=async(entry:Entry)=>{insist(document);await persist({...document,entries:[...document.entries.filter(e=>e.step!==entry.step),entry]})}
    const proof=async(entry:Entry,wait:boolean):Promise<Record<string,unknown>>=>{
      insist(entry.txHash&&entry.to&&entry.data)
      let value:unknown
      for(;;){
        active();value=await pub.request({method:"eth_getTransactionReceipt",params:[entry.txHash]})
        if(value!==null)break
        insist(wait);const signal=context.getStore();insist(signal);await pause(pollMs,signal)
      }
      const receipt=plain(value),transaction=plain(await pub.request({method:"eth_getTransactionByHash",params:[entry.txHash]}))
      insist(same(receipt.transactionHash,entry.txHash)&&receipt.status==="0x1"&&same(receipt.from,a.owner)&&same(receipt.to,entry.to)&&hash(receipt.blockHash)&&
        typeof receipt.blockNumber==="string"&&/^0x[0-9a-fA-F]+$/.test(receipt.blockNumber)&&Array.isArray(receipt.logs)&&receipt.logs.length<=512&&
        same(transaction.hash,entry.txHash)&&same(transaction.from,a.owner)&&same(transaction.to,entry.to)&&same(transaction.input,entry.data)&&
        transaction.value==="0x0"&&same(transaction.blockHash,receipt.blockHash)&&transaction.blockNumber===receipt.blockNumber&&
        (transaction.chainId===undefined||transaction.chainId==="0xaa36a7"))
      for(const rawLog of receipt.logs){const log=plain(rawLog);insist((log.removed===undefined||log.removed===false)&&(log.transactionHash===undefined||same(log.transactionHash,entry.txHash))&&
        (log.blockHash===undefined||same(log.blockHash,receipt.blockHash))&&(log.blockNumber===undefined||log.blockNumber===receipt.blockNumber)&&
        (log.transactionIndex===undefined||log.transactionIndex===receipt.transactionIndex))}
      return receipt
    }
    const proxyDetails=(entry:Entry)=>{
      const m=entry.metadata;insist(m&&m.kind&&addr(m.proxy)&&addr(m.implementation)&&uint(m.salt,256)&&same(m.owner,a.owner)&&entry.step===`deploy-proxy:${m.kind}`&&entry.data)
      const manifest=loadEnsDeployments().find(d=>same(d.verifiableFactory,entry.to));insist(manifest)
      insist(m.kind==="resolver"||m.kind.startsWith("registry:"))
      const salt=m.kind==="resolver"?ownedResolverSalt(a.owner):userRegistrySalt(m.kind.slice(9)),implementation=m.kind==="resolver"?manifest.permissionedResolverImpl:manifest.userRegistryImpl
      insist(same(m.implementation,implementation)&&BigInt(m.salt)===salt)
      const decoded=decodeFunctionData({abi:VERIFIABLE_FACTORY_ABI,data:entry.data});insist(decoded.functionName==="deployProxy"&&same(decoded.args[0],implementation)&&decoded.args[1]===salt)
      if(m.kind==="resolver"){
        const initialized=decodeFunctionData({abi:PERMISSIONED_RESOLVER_ABI,data:decoded.args[2]})
        insist(initialized.functionName==="initialize"&&same(initialized.args[0],a.owner)&&initialized.args[1]===ALL_ROLES&&initialized.args[2].length===0)
      }else{
        const initialized=decodeFunctionData({abi:USER_REGISTRY_INIT_ABI,data:decoded.args[2]})
        insist(initialized.functionName==="initialize"&&same(initialized.args[0],a.owner)&&initialized.args[1]===ALL_ROLES)
      }
      return {m,salt,implementation,kind:m.kind,proxy:m.proxy}
    }
    const learnProxy=(entry:Entry,receipt:Record<string,unknown>)=>{
      if(!entry.step.startsWith("deploy-proxy:"))return
      const {m,salt,implementation,kind,proxy}=proxyDetails(entry)
      const topic=encodeEventTopics({abi:VERIFIABLE_FACTORY_ABI,eventName:"ProxyDeployed"})[0];let count=0
      insist(Array.isArray(receipt.logs))
      for(const rawLog of receipt.logs){const log=plain(rawLog);if(!same(log.address,entry.to)||!Array.isArray(log.topics)||!same(log.topics[0],topic))continue
        count++;insist(bytes(log.data));const e=decodeEventLog({abi:VERIFIABLE_FACTORY_ABI,topics:log.topics as [Hex,...Hex[]],data:log.data})
        insist(e.eventName==="ProxyDeployed"&&same(e.args.sender,a.owner)&&same(e.args.proxyAddress,m.proxy)&&same(e.args.implementation,implementation)&&e.args.salt===salt)
      }
      insist(count===1);known.set(kind,canonical(proxy))
    }
    await operation(async()=>{
      insist(await chain()===ENS_SEPOLIA_CHAIN_ID)
      if(!document){
        const random=crypto.getRandomValues(new Uint8Array(32)),secret=`0x${Buffer.from(random).toString("hex")}` as Hex
        await persist({format:"arcade-ens-setup-v1",chainId:11155111,binding:canonical(a.binding),root:a.root,owner:canonical(a.owner),seller:canonical(a.seller),daemon:canonical(a.daemon),
          ttlSeconds:a.ttlSeconds,sellerTtlSeconds:a.sellerTtlSeconds,createdAt:String(chainTime),secret,sellerExpiry:String(BigInt(chainTime)+BigInt(a.sellerTtlSeconds)),skillExpiry:String(BigInt(chainTime)+BigInt(a.ttlSeconds)),entries:[]})
      }else for(const entry of document.entries){
        if(entry.state==="submitted"||entry.step.startsWith("deploy-proxy:")){
          const receipt=await proof(entry,false);learnProxy(entry,receipt)
          if(entry.state==="submitted")await save({...entry,state:"confirmed"})
        }
      }
    },receiptMs)
    const checkpoint=async(input:SetupCheckpoint)=>{
      active();insist(document);const v=plain(input,["step","state","txHash","metadata"]);insist(stepName(v.step)&&(v.state==="intent"||v.state==="confirmed"))
      const m=metadata(v.metadata,a.privateKey),existing=document.entries.find(e=>e.step===v.step)
      if(existing){
        insist(JSON.stringify(existing.metadata??{})===JSON.stringify(m??{}))
        if(v.state==="confirmed")insist(existing.state==="confirmed"&&same(existing.txHash,v.txHash))
        return
      }
      insist(v.state==="intent"&&v.txHash===undefined);await save({step:v.step,state:"intent",...(m===undefined?{}:{metadata:m})})
    }
    const send=async(step:string,call:SetupCall):Promise<Hex>=>{
      active();insist(!busy);busy=true
      try{return await operation(async()=>{
        insist(document&&stepName(step)&&addr(call.address));const data=encodeFunctionData(call);insist(bytes(data))
        let entry=document.entries.find(e=>e.step===step);insist(entry)
        insist(await chain()===ENS_SEPOLIA_CHAIN_ID)
        if(entry.state!=="intent"){
          insist(same(entry.to,call.address)&&same(entry.data,data));const receipt=await proof(entry,false);learnProxy(entry,receipt)
          if(entry.state!=="confirmed")await save({...entry,state:"confirmed"});return entry.txHash!
        }
        insist(entry.to===undefined);entry={...entry,to:canonical(call.address),data}
        if(step.startsWith("deploy-proxy:"))proxyDetails(entry)
        await save(entry)
        const prepared=await wallet.prepareTransactionRequest({account,chain:sepolia,to:call.address,data,value:0n})
        active();insist(prepared.chainId===ENS_SEPOLIA_CHAIN_ID)
        const serialized=await wallet.signTransaction(prepared),txHash=keccak256(serialized)
        // Persist the deterministic signed hash BEFORE broadcast. A crash here is still
        // uncertain and must be reconciled, never sent again automatically.
        entry={...entry,state:"submitted",txHash};await save(entry)
        insist(await pub.getChainId()===ENS_SEPOLIA_CHAIN_ID);active()
        const returned=await wallet.sendRawTransaction({serializedTransaction:serialized});insist(same(returned,txHash))
        const receipt=await proof(entry,true);learnProxy(entry,receipt);await refresh();await save({...entry,state:"confirmed"});return txHash
      },receiptMs)}catch{throw fail()}finally{busy=false}
    }
    const driver:RegistryDriver={
      chainId:()=>operation(chain,rpcMs),nowSeconds:()=>{active();insist(chainTime>0);return chainTime},
      wait:seconds=>operation(async()=>{insist(Number.isSafeInteger(seconds)&&seconds>=0&&seconds<=600);const signal=context.getStore();insist(signal);await pause(seconds*1000,signal);insist(await chain()===ENS_SEPOLIA_CHAIN_ID)},605000),
      read:call=>operation(()=>pub.readContract(call),rpcMs),simulate:call=>operation(async()=>(await pub.simulateContract({...call,account})).result,rpcMs),
      getCode:address=>operation(()=>pub.getCode({address}),rpcMs),
      readReceipt:tx=>operation(async()=>{insist(document&&hash(tx));const entry=document.entries.find(e=>same(e.txHash,tx));insist(entry);return proof(entry,false)},rpcMs),
      checkpoint:async input=>{active();insist(!busy);busy=true;try{await checkpoint(input)}catch{throw fail()}finally{busy=false}},send
    }
    insist(document)
    const confirmed=async(step:string):Promise<boolean>=>{
      active();insist(!busy);busy=true
      try{return await operation(async()=>{
        insist(stepName(step)&&document);const entry=document.entries.find(e=>e.step===step)
        if(entry===undefined)return false
        insist(entry.state!=="intent");insist(await chain()===ENS_SEPOLIA_CHAIN_ID)
        const receipt=await proof(entry,false);learnProxy(entry,receipt)
        if(entry.state!=="confirmed")await save({...entry,state:"confirmed"})
        return true
      },receiptMs)}finally{busy=false}
    }
    return Object.freeze({driver,journal:Object.freeze({secret:document.secret,sellerExpiry:BigInt(document.sellerExpiry),skillExpiry:BigInt(document.skillExpiry)}),
      knownProxy:(kind:string)=>{active();return known.get(kind)},confirmed,close})
  }catch{await close().catch(()=>{});throw fail()}
}

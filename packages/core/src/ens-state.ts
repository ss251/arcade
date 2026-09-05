/** Server/Bun-only IO entry point. Deliberately not re-exported by the browser-safe core. */
import { constants } from "node:fs"
import { mkdir,open,rename,rmdir,unlink } from "node:fs/promises"
import { dirname,isAbsolute,normalize,basename } from "node:path"
import { decodeEnsState,type EnsState } from "./ens.ts"

const LIMIT=262144
const failed=()=>new Error("ENS state unavailable or unsafe; inspect configuration and retained files before retrying")
const checkedPath=(path:string):string=>{
  if(path.length>2048||!isAbsolute(path)||normalize(path)!==path||path==="/"||/[\u0000-\u001f\u007f]/.test(path)||!basename(path).endsWith(".json")) throw failed()
  return path
}
export const ensStatePath=(env:Readonly<Record<string,string|undefined>>=process.env):string=>{
  const path=env.ARCADE_ENS_STATE ?? (env.HOME===undefined?undefined:`${env.HOME}/.arcade/ens.json`)
  if(path===undefined)throw failed()
  return checkedPath(path)
}
/** Only ENOENT means disabled; corrupt/oversized/symlink files are never treated as absent. */
export const readEnsState=async(path=ensStatePath()):Promise<EnsState|undefined>=>{
  checkedPath(path)
  let file:Awaited<ReturnType<typeof open>>
  try{file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)}
  catch(e){if((e as {code?:string}).code==="ENOENT")return undefined;throw failed()}
  try{
    const info=await file.stat()
    if(!info.isFile()||info.size>LIMIT)throw failed()
    const bytes=Buffer.alloc(LIMIT+1)
    let count=0
    while(count<bytes.length){const read=await file.read(bytes,count,bytes.length-count,count);if(read.bytesRead===0)break;count+=read.bytesRead}
    if(count>LIMIT)throw failed()
    return decodeEnsState(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(0,count))))
  }catch{throw failed()}finally{await file.close()}
}
/** Atomic, fsynced, private state publication. Never replace a different namespace or
 * conceal malformed prior state. A crash-owned lock requires manual reconciliation. */
export const writeEnsState=async(value:unknown,path=ensStatePath()):Promise<EnsState>=>{
  const state=decodeEnsState(value);checkedPath(path)
  const lock=`${path}.lock`, temporary=`${path}.${crypto.randomUUID()}.tmp`
  let locked=false, temporaryCreated=false
  try{
    await mkdir(dirname(path),{recursive:true,mode:0o700})
    const deadline=Date.now()+5000
    for(;;){
      try{await mkdir(lock,{mode:0o700});locked=true;break}
      catch(e){if((e as {code?:string}).code!=="EEXIST"||Date.now()>=deadline)throw failed();await new Promise(resolve=>setTimeout(resolve,20))}
    }
    const old=await readEnsState(path)
    if(old){
      const immutable=["root","sellerLabel","seller","deploymentSet","universalResolver","sellerRegistry","skillRegistry","resolver","owner","daemon"] as const
      if(immutable.some(k=>old[k]!==state[k])||old.skills.some(s=>!state.skills.some(t=>t.skillId===s.skillId&&t.name===s.name)))throw failed()
    }
    const bytes=`${JSON.stringify(state,null,2)}\n`
    if(Buffer.byteLength(bytes)>LIMIT)throw failed()
    const file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);temporaryCreated=true
    try{await file.writeFile(bytes);await file.sync()}finally{await file.close()}
    await rename(temporary,path);temporaryCreated=false
    const parent=await open(dirname(path),constants.O_RDONLY)
    try{await parent.sync()}finally{await parent.close()}
    return state
  }catch{throw failed()}finally{
    if(temporaryCreated)await unlink(temporary).catch(()=>{})
    if(locked)await rmdir(lock)
  }
}

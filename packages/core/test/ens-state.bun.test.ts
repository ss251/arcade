import { describe,expect,it } from "bun:test"
import { mkdtemp,readFile,stat,writeFile,symlink,rm } from "node:fs/promises"
import { join } from "node:path"
import { loadEnsDeployments } from "../src/ens.ts"
import { ensStatePath,readEnsState,writeEnsState } from "../src/ens-state.ts"

const state=()=>({root:"arcade.eth",sellerLabel:"seller",seller:`0x${"11".repeat(20)}`,deploymentSet:"A",universalResolver:loadEnsDeployments()[0]!.universalResolver,sellerRegistry:`0x${"33".repeat(20)}`,skillRegistry:`0x${"44".repeat(20)}`,resolver:`0x${"55".repeat(20)}`,ttlSeconds:3600,skills:[{skillId:"flow",label:"flow",name:"flow.seller.arcade.eth",priceAtomic:"50000"}]})
const temporary=async(fn:(path:string)=>Promise<void>)=>{const dir=await mkdtemp("/tmp/arcade-ens-state-");try{await fn(join(dir,"ens.json"))}finally{await rm(dir,{recursive:true,force:true})}}
describe("isolated private ENS runtime state",()=>{
  it("uses an explicit path and is off only for an absent file",async()=>temporary(async path=>{
    expect(ensStatePath({ARCADE_ENS_STATE:path})).toBe(path)
    expect(ensStatePath({HOME:"/public-owner"})).toBe("/public-owner/.arcade/ens.json")
    expect(()=>ensStatePath({})).toThrow()
    expect(await readEnsState(path)).toBeUndefined()
    await writeFile(path,"not JSON PRIVATE")
    await expect(readEnsState(path)).rejects.not.toThrow("PRIVATE")
  }))
  it("durably writes only validated public state with private permissions",async()=>temporary(async path=>{
    await writeEnsState(state(),path)
    expect(await readEnsState(path)).toEqual(state())
    expect((await stat(path)).mode&0o777).toBe(0o600)
    expect(await readFile(path,"utf8")).not.toContain("privateKey")
  }))
  it("preserves existing identity and malformed bytes instead of overwriting them",async()=>temporary(async path=>{
    await writeEnsState(state(),path);const old=await readFile(path,"utf8")
    await expect(writeEnsState({...state(),seller:`0x${"66".repeat(20)}`},path)).rejects.toThrow()
    expect(await readFile(path,"utf8")).toBe(old)
    await writeFile(path,"invalid")
    await expect(writeEnsState(state(),path)).rejects.toThrow()
    expect(await readFile(path,"utf8")).toBe("invalid")
  }))
  it("refuses symlink targets, oversized files and secret-bearing input",async()=>temporary(async path=>{
    const target=path+".other";await writeFile(target,"unchanged");await symlink(target,path)
    await expect(readEnsState(path)).rejects.toThrow()
    await expect(writeEnsState(state(),path)).rejects.toThrow()
    expect(await readFile(target,"utf8")).toBe("unchanged")
    await expect(writeEnsState({...state(),privateKey:"PRIVATE"},target)).rejects.not.toThrow("PRIVATE")
    await writeFile(target,"x".repeat(262145));await expect(readEnsState(target)).rejects.toThrow()
  }))
  it("allows price refresh without changing immutable namespace provenance",async()=>temporary(async path=>{
    await writeEnsState(state(),path)
    const next={...state(),skills:[{...state().skills[0]!,priceAtomic:"70000"}]}
    await writeEnsState(next,path);expect(await readEnsState(path)).toEqual(next)
  }))
})

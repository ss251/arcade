> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F11 runtime independent cancellation/resource checkpoint — September 6, 2026

Verdict: **FINDING — late journal acquisition is not owned by cleanup**.
Narrow start/bounded/close review only, not whole-runtime acceptance.
G14 held runtime source78403107c950be4afd353311b95c73fbdf76c05dbeff920f4dd32ae0dd0a9c70
and journal sourcea39d8681027a62e81ae49b719603b88745c8a9df9b5d1a3d5985cbe24b7924f1
quiescent during the probe. Both before/after hashes match.

Read actual bounded acquisition helper, dependency capture, createFundingOperation
start/execute/failure/close and the journal's acquisition/close implementation.
No production source or shared tests were edited. Only this ignored report is
written. The deterministic reproduction used a trusted journalIO checkpoint and
an actual private owned temporary filesystem; no production namespace,
operational environment, key, signer, RPC/API/network, send, Git or full suite.

## Actual owning-process reproduction

Pause openFundingJournal at header_sync, after it already owns the main journal
FileHandle and account claim. Abort the runtime signal. executeDepositOnce returns
refused/cancelled. Calling operation.close resolves before the paused acquisition
is released. Then release the checkpoint and await the last parent-directory
handle's actual close plus an event-loop continuation so the open finishes.

The main handle's original close method is wrapped only to count calls; actual
close behavior is preserved. After late open completion:
- mainCloseCalls=0 and mainStillOpen=true, verified by FileHandle.stat.
- No clean-close witness or poison marker; active.claim remains.
- RPC, Gateway, acquireSigner, sendRawTransaction and normalTransferPost counts0.
- The fixture manually calls the retained original main close in finally, then
  removes only its own temporary root. Cleanup completed.

Exact observed JSON:
```json
{"status":"refused","code":"cancelled","closeResolvedBeforeOpenReleased":true,"closeBeforeRelease":0,"mainCloseCalls":0,"mainStillOpen":true,"cleanCloseWitness":false,"poison":false,"claimRetained":true,"rpc":0,"gateway":0,"signer":0,"sends":0,"normal":0}
```
Followed by OWNED_FIXTURE_CLEANUP_COMPLETE, exit0: this diagnostic intentionally
asserts the observed defect, rather than representing a passing desired-behavior
test. An initial inline generic-arrow parse error executed no code; it was a
fixture syntax issue, NOT a product Red. Replacing that helper with a generic
function declaration allowed the actual reproduction.

## Cause and scope

start assigns journal only after awaiting bounded(openFundingJournal). bounded
races the open against cancellation, but consumes/discards a late result without
disposing resource-bearing values. Once abort rejects that await, journal stays
undefined. execute's owner resolves through settleFailure; close waits for owner,
finds no journal and resolves. The raw acquisition can subsequently return a
live journal object whose handle has no remaining runtime owner.

This is a material resource ownership/close-result defect in a still-running
owning process (including SDK/library use). It is not observed signing, replay,
fund movement, capability leakage or account-claim retirement. An eventual
process exit would reap OS descriptors, but does not make the preceding facade
close result or long-lived process ownership correct. The retained claim and
missing witness correctly prevent this from becoming unsigned finalization.

Suggested narrow correction: retain/observe the raw journal acquisition and
explicitly adopt or close any resource that resolves after cancellation/closing;
make close account for pending acquisition within its documented cleanup budget,
without allowing later sign/send entry. If bounded cleanup cannot be completed,
report that uncertainty honestly while preserving ownership and a later cleanup
observer. Do not wait indefinitely, retry creation, remove the claim or manufacture
a causal close witness. G14/root own the correction and exact semantics.

## Reproduction command body

Executed through `bun --no-env-file -e` with a non-login shell. No script file was
created; exact inline code follows so the author/parent can reproduce it without
rewriting the desired-versus-observed assertions.

```ts
import { mkdtemp, realpath, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createFundingOperation } from "./packages/buyer/src/gateway-funding-runtime.ts";
import { captureFundingAuthority, operationDigest } from "./packages/buyer/src/gateway-funding.ts";
const root = await realpath(await mkdtemp(join(tmpdir(),"f11-late-open-review-")));
const authority = captureFundingAuthority("0x"+"11".repeat(20));
const request = {kind:"deposit",mode:"exact",amount:1n,gasCapWei:1n} as const;
const operationId = "op_"+"ab".repeat(16), digest = operationDigest(authority,request,operationId);
const accountDir=join(root,".arcade-gateway-funding","v1","eip155-5042002",authority.account);
const abort = new AbortController();
let release!:()=>void, entered!:()=>void, finished!:()=>void;
const paused = new Promise<void>(r=>release=r), arrived = new Promise<void>(r=>entered=r), lateFsDone=new Promise<void>(r=>finished=r);
let main: import("node:fs/promises").FileHandle|undefined, originalClose:(()=>Promise<void>)|undefined;
let released=false, mainCloseCalls=0, rpc=0, gateway=0, signer=0, sends=0, normal=0, op:ReturnType<typeof createFundingOperation>|undefined;
async function bound<T>(p:Promise<T>):Promise<T> {let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([p,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("fixture timeout")),3000)})])}finally{if(timer)clearTimeout(timer)}};
try {
 op=createFundingOperation({authority,request,operationId,journalPath:join(root,"operation.jsonl")},{
  signal:abort.signal,deadlineMs:performance.now()+10000,now:()=>performance.now(),wallNow:()=>1000,
  rpc:async()=>{rpc++;throw Error("unexpected RPC")},gateway:async()=>{gateway++;throw Error("unexpected gateway")},
  acquireSigner:async()=>{signer++;throw Error("unexpected signer")},sendRawTransaction:async()=>{sends++;throw Error("unexpected send")},
  normalTransferPost:async()=>{normal++;throw Error("unexpected normal transfer")},
  journalIO:{testRoot:root,checkpoint:async(point,file)=>{
   if(point==="header_sync"){
    main=file!;originalClose=main.close.bind(main);
    main.close=async()=>{mainCloseCalls++;await originalClose!()};
    entered();await paused;released=true;
   } else if(point==="directory_sync"&&released){
    const close=file!.close.bind(file!);
    file!.close=async()=>{await close();setTimeout(finished,0)};
   }
  }}
 });
 const executing=op.executeDepositOnce();
 await bound(arrived);abort.abort();
 const result=await bound(executing);
 await bound(op.close());
 const closeBeforeRelease=mainCloseCalls;
 release();
 await bound(lateFsDone);
 const entries=await readdir(accountDir);
 let mainStillOpen=false;try{await main!.stat();mainStillOpen=true}catch{}
 const facts={status:result.status,code:result.code,closeResolvedBeforeOpenReleased:true,closeBeforeRelease,mainCloseCalls,mainStillOpen,
  cleanCloseWitness:entries.includes(digest.slice(2)+".clean-close"),poison:entries.includes("poison"),claimRetained:entries.includes("active.claim"),rpc,gateway,signer,sends,normal};
 process.stdout.write(JSON.stringify(facts)+"\n");
 if(!mainStillOpen||mainCloseCalls!==0||facts.cleanCloseWitness||rpc||gateway||signer||sends||normal)throw Error("different reproduction");
} finally {
 release();if(op)await op.close().catch(()=>{});
 if(originalClose)await originalClose().catch(()=>{});
 await rm(root,{recursive:true,force:true});
 process.stdout.write("OWNED_FIXTURE_CLEANUP_COMPLETE\n");
}
```

All callbacks are inert except trusted temporary-file pause/observation hooks.
Deadline timers are cleared; the last completion timer is awaited. No children
were spawned. Reported to root and G14 immediately after reproduction; source
correction/review remains pending, and no whole-runtime CLEAN is claimed.

## Correction checkpoint — September 6, 2026

Verdict: **CLEAN for the narrow late-open cancellation/resource correction**.
The entire preceding finding and diagnostic are preserved verbatim; their
pre-append SHA256 is
`3f1085938af2b5d00db9141d44d26fd0def21706b957f8eb514b0f44bff5d182`.
This supersedes the pending status only for the reproduced late-open defect, not
for the whole funding runtime or other changes included in the author's thaw.

Before and after the independent runs, all three reviewed checkpoint hashes match:

| File | SHA256 |
| --- | --- |
| packages/buyer/src/gateway-funding-runtime.ts | 2b6248aed6beb2541a634cbbb77b757b69dad51d4d048ebe7510834646e6639d |
| packages/buyer/src/gateway-funding-journal.ts | a39d8681027a62e81ae49b719603b88745c8a9df9b5d1a3d5985cbe24b7924f1 |
| packages/buyer/test/gateway-funding-runtime.bun.test.ts | 3525b1095c5ec8f90a23d44c1be8828957be682d024a0ae27e8d3a1ae58c3a52 |

Source inspection confirms the raw opening promise now adopts the journal in its
own continuation, before the cancellation-raced await. If acquisition resolves
after abort, expiry, closing, closure or uncertainty, that continuation attempts
the actual journal close and refuses further work. Facade close also accounts
for the pending opening promise within its bounded cleanup budget. An unresolved
opening makes close reject fixed `FundingFailure("journal_unavailable")`;
late cleanup remains observed. It does not retry acquisition or retire the claim.

Replayed the same actual header_sync pause / abort / execute / close / release
sequence with desired-cleanup expectations. The inline diagnostic above was
changed only to import FundingFailure, require that fixed close rejection, await
the actual witness_close completion instead of directory_sync, and assert one
main close, a closed descriptor, a witness and a retained claim. The actual main
FileHandle.close was still wrapped only for counting. No test file was added.
Observed output, exit0 (1.123 seconds):

```json
{"status":"refused","code":"cancelled","closeRejectedBeforeOpenReleased":true,"closeFailureCode":"journal_unavailable","closeBeforeRelease":0,"mainCloseCalls":1,"mainStillOpen":false,"cleanCloseWitness":true,"poison":false,"claimRetained":true,"rpc":0,"gateway":0,"signer":0,"sends":0,"normal":0}
```

Followed by `OWNED_FIXTURE_CLEANUP_COMPLETE`. The witness was observed only after
the real late-acquired main handle closed; it was not written by the fixture.
The original close method is retained solely for finally cleanup if needed.
All deadline timers were cleared and the witness completion timer awaited;
only the owned temporary root was removed, and no child was created.

Additional independent checks:

- `bun --no-env-file test packages/buyer/test/gateway-funding-runtime.bun.test.ts --test-name-pattern 'owns a real late-open journal'`:
  1 passed, 41 filtered, 0 failed, 5 assertions; exit0 (1.223 seconds).
- TypeScript compiler API with the repository's parsed tsconfig options and
  exactly runtime source, journal source and their shared Bun test as roots:
  `EXACT_ROOTS=3 DIAGNOSTICS=0`, exit0. Imported dependencies remain included by
  TypeScript; this is not a whole-repository gate.

No additional actionable finding in this bounded correction. The readonly UUID
GET addition made in the same author thaw was not independently audited here.
No crash/power-loss experiment, process-kill guarantee, live deployment identity,
Gateway credit, withdrawal, signer or network behavior was tested. No source,
shared test, operational namespace, environment/key, Git or full-suite action.

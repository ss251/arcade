> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E15 private live supervisor — frozen for root review

Frozen 2026-09-05 05:38:43 UTC after the final long-poll regression and private typecheck. This is preparation, not live evidence. No real keys were read, no external requests made, and no transactions submitted during implementation/tests. No tracked source was edited; root's README/runbook changes are outside this task.

Owned files: `e15-live.ts`, `e15-live.test.ts`, `e15-tsconfig.json`, and this ignored report. Entry point is explicitly `bun --no-env-file run internal/task-preparation/e15-live.ts --run-approved-loopback`; it never retrieves keys. Root alone supplies approved keys in a consuming command and executes live. Help/import/invalid usage remain key-free.

## Scope and proof

- Exact approved `arcade` / `usdc-flow-check.scf821769ed.arcade.eth`; canonical skill manifest/run.ts copied into a unique private owned directory. Only the entry wrapper adds parent/deadline guards.
- Setup uses the actual durable production setup driver, 15-minute leaf TTL, explicit label consent, and one listing. Owned hub is loopback/port zero; role environments are allowlisted and no dotenv or owner HOME/config is used.
- Renewal log is only a candidate: actual matching transaction, receipt and changed registration expiry are read back. The line reader handles split chunks with an 8KiB bound.
- Exactly one by-name $0.01 purchase uses the real buyer SDK and local authorized amount. Private hub ledger plus independent actual Arc receipt, ordinary V2 Settled and matching USDC Transfers prove the purchase. No synthetic canary/lineage fields are manufactured. No retry/resend of uncertain sends.
- Renewer is replaced by the same owned serving runner without the daemon key before the price/expiry beats. The 60s ENS watcher must expose the matching name in the catalog (bounded 90s wait); final expiry requires matching detail200 `ensExpired` proof while both services remain alive.
- Actual production price-lock, synthetic tampered-402, and expiry functions are invoked as scoped workers. Price remains bumped and the narrow daemon price grant remains revoked; no restoration/revival/regrant/repoint occurs.
- Parent whole-run fuse is 35 minutes, child independent fuse is 36 minutes plus inherited absolute parent deadline/parent-liveness guard. All owned processes stop before the successful post-chain readback. No owner service is killed.
- Post-cleanup Sepolia reads share a pinned block, recheck the block hash/chain, verify pinned factory/implementations and both parent directions/current owners, exact passive-expiry token/latestOwner/resource progression, all actually written text bytes, root ALL_ROLES for owner and zero root roles for daemon on all three proxies. Same-value owner setText simulations for each written key independently demonstrate retained edit authority without broadcasting.
- Public, fsynced 0600 evidence checkpoints preserve phase outputs, coordinates, hashes and observed facts, never keys or setup journal secret. Temporary URLs are plainly identified as unusable after cleanup or from other machines.

## Regression evidence

Initial missing-module Red was followed by real behavior Reds for actual synthetic result fields, chunk-split renewal output and malformed extra settlement evidence. All fixed.

C1 review caught the real hub's legitimate result long-poll exceeding the initial blanket 5s request bound. At **05:37:37 UTC**, the injected 15s result regression failed (10 pass / 1 fail) against the unchanged 5s behavior. Only buyer GET to the exact owned origin `/jobs/<ASCII-job-id>/result`, optionally with the canonical 32-hex token, now receives min(90s, remaining deadline). Paid POST, RPC, foreign origin and malformed query remain 5s. No polling request causes a paid resend.

At **05:38:43 UTC**:

Historical excerpt (not current operator instructions):
```text
bun --no-env-file test internal/task-preparation/e15-live.test.ts
11 pass / 0 fail / 69 assertions
bun --no-env-file run tsc --noEmit -p internal/task-preparation/e15-tsconfig.json
exit 0
```

The timeout fixture advances an injected clock/signal schedule; it does not wait 15 real seconds or contact a service. Other tests cover exact role environments, successful ordering, uncertainty stopping later phases while cleaning up, watcher false-proof refusal, payment forgery/correlation, owner post-expiry control and actual isolated help/invalid CLI subprocesses. These are offline correctness tests, never live proof.

## Failure / recovery limit

The complete post-cleanup on-chain proof runs only after the full successful sequence. On any failure, the supervisor closes owned processes and retains the private directory/journals and durable public phase/name/transaction checkpoints for root's independent read-only reconciliation. It does not claim PASS, adopt an arbitrary existing namespace, or rerun setup in a new journal. If failure follows partial writes, root must use those retained coordinates/transaction checkpoints to read back actual state manually before deciding any separately authorized recovery. This deliberately avoids automatic writes or interpreting an RPC outage as expiry.

Independent review: root reviewed source; C1 reviewed all phases and post-cleanup proof, with the long-poll finding corrected above. Final narrow re-review pending at freeze.

## Retained-run continuation after separately approved owner renewal

The initial approved live supervisor was executed by root, not this implementer. It completed setup and submitted the actual daemon renewal, then honestly failed/cleaned up when the production writer's original four-read receipt window elapsed before normal Sepolia mining. Root independently verified the exact successful transaction and preserved the original evidence/journal. The first private resume version was never launched; no empty resume marker was created. The production receipt-window fix is a separate tracked change committed by root as `7820ac1`, with 47 focused runner ENS tests and full gates; this private adaptation does not alter that code.

User subsequently authorized exactly one owner/root renewal of the retained leaf for fresh 15 minutes plus gas. C1 owns that separate operation/helper; this supervisor does not execute it. Explicit resume mode now requires `<LIVE_RUN_ARTIFACT>` in agreed format `ens-owner-revive-v1`, status `OWNER_RENEWAL_CONFIRMED`, exact name/owner/seller/registry, previous expiry `1788588119`, new fixed expiry, retained token/live resource, successful transaction hash, Sepolia chain, block/hash/timestamp and `noSetup/noGrants/noPurchases:true`.

The resume independently reads and verifies both actual transactions: original daemon `renew(labelId,1788588119)` and the distinct owner `renew(labelId,newExpiry)`, including complete calldata, signer/target/value/chain, receipt/log correlation and canonical mined block hashes. The owner transaction must follow the original, mine after old expiry, and target no more than 900 seconds beyond its mined block time. The claimed public snapshot block/hash/time is independently checked. A fresh hardened, same-block namespace observation then re-proves proxy implementation/code, parent mounts in both directions, current parent/leaf owner, resolver, token/resource and exactly the new expiry. At least 180 seconds must remain at initial resume and immediately before purchase/price; no deadline bypass, revival fallback or extra renewal exists.

Resume uses the exact retained directory/config/database/canonical skill bytes and port51989, refuses an occupied port unless its OWN newly started hub emitted the bind marker, requires zero jobs and receipts, starts only a seller-key runner without daemon ENS authority, and executes only purchase/price/tampered/expiry/cleanup/post. It creates exclusive `resume-evidence.json`, never overwrites the original failed evidence, and records reused original setup, read-only original daemon renewal and a distinct `owner-revival` checkpoint with fresh chronological observation times. Baseline and final passive-expiry proof use the newly proved owner expiry. The known-mined submitted runner journal is intentionally unchanged and remains separately reconcilable; no journal relabel or resubmission is performed. Whole resume deadline remains20 minutes.

Genuine missing-contract Reds were captured at06:11:44 UTC (owner-proof contract) and06:14:36 UTC (dual-transaction verifier), then **17 private tests /111 assertions plus private tsc passed at06:15:17 UTC**. Tests reject incorrect owner/public revival claims, wrong exact calldata/signer/chain/receipt, replacement leaf, unapproved extra expiry, insufficient180-second runway and incorrect post-revival baseline. Prior private tests remain green. These are offline fixture tests, not live evidence. Source/test/report are frozen for root/C1 review before any owner transaction or resumed live consuming command.

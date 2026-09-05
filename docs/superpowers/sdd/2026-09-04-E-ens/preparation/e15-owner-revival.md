> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# One approved retained-leaf owner renewal

Private command preparation only. The user explicitly approved ONE owner-signed Sepolia renewal of the already retained leaf for a fresh fifteen-minute expiry, plus gas. Root executes only after the production receipt-window fix, main merge gates, and private helper/resume review are green. This author has not fetched a key, opened the recovery journal, chosen the future expiry, or sent a recovery transaction.

## Exact consuming command — root executes once, never a blind retry

Historical command (not current operator instructions):
```text
env -i PATH="$PATH" /bin/bash --noprofile --norc <<'SH'
set +x
set -euo pipefail
cd <REPOSITORY_ROOT>/.claude/worktrees/e-ens
ARCADE_ENS_OWNER_KEY="$(/usr/bin/security find-generic-password -s arcade-ens-owner -w)"
export ARCADE_ENS_OWNER_KEY
exec bun --no-env-file internal/task-preparation/e15-owner-revive.ts --renew-approved-retained-n1M2Nf
SH
```

Only the approved owner key is read inside this consuming command. No daemon, seller, buyer, facilitator or replacement key is used. No HOME override, dotenv loading, secret file or key printing occurs. The process creates no children; its cooperative outer abort is 190 seconds and hard failure fuse is 210 seconds, including initial public-file I/O, inner writer shutdown and final proof flush. A forced exit never claims completion and leaves the same journal for reconciliation.

## Fixed scope and durable uncertainty boundary

- Leaf: `usdc-flow-check.scf821769ed.arcade.eth`; chain11155111 only; namespace owner `0x8260C32f90593f1B3B3bcba0Ec1D40ff8C189469`.
- Exact skill registry `0xdafbdd2d7109d4706999573f60a3d1c17a96bdc6`; retained token `23970333715751076124179036471974348465258195195405327158223653295910559940609`; old current expiry `1788588119`.
- Read only the original public `<LIVE_RUN_ARTIFACT>` and count jobs/receipts in the retained SQLite database. Both counts must be zero. The loopback health route must return an actual connection refusal, not an HTTP response or timeout.
- A fresh pinned Sepolia block must prove the hierarchy, all three proxy implementations, namespace-owner raw ALL roles and daemon root zero, seller/latestOwner/token identity, the precise live-or-expired resource, and every one of the six original written records. Six same-value owner `setText` simulations prove current update authority without broadcasting.
- The only transaction is `skillRegistry.renew(labelId("usdc-flow-check"), fixedExpiry)`. No registration, ownership transfer, namespace/proxy creation, grant/revocation, price/text change, purchase, funding or production re-point is included.
- Dedicated journal: `<LIVE_RUN_ARTIFACT>`. Its stable binding includes the fixed old identity/expiry/records and TTL900, not a moving wall-clock timestamp. On first creation the existing production driver durably fixes `skillExpiry = fresh chain timestamp + 900` before any send. The helper refuses stale expiry rather than shifting it or choosing another journal.
- The production driver persists intent and the deterministically signed transaction hash before its one broadcast. Known submitted hashes are reconciled, not resent. Any error after submission is uncertain until independently reconciled. Never delete/relabel the journal, use a new path, or resend to get around uncertainty. If chain state already has the new expiry, this helper's old-expiry precondition deliberately refuses a second invocation before accessing the supplied key.
- The retained `ens.json` and daemon journal are not read or modified by this helper. Their original daemon checkpoint remains an independent fact. The owner session uses the dedicated recovery journal only.

## Correct expiry/resource semantics

Pinned `PermissionedRegistry.sol` at commit `97a57293f3b4279d94b571e678edb53ce62638f4`, functions `renew`, `_canRevive`, `_constructResource` and `_constructTokenId`, was read from the official ENS source. `renew` only changes stored expiry and emits `ExpiryUpdated`; an expired renewal requires root RENEW. It does not increment token/EAC storage versions or change latestOwner. Therefore the observed expired resource is TOKEN and renewed live resource is TOKEN−1, while token/latestOwner remain unchanged. This is not re-registration or a new grant. The separately scoped daemon is never given root RENEW.

Public proof is written only after confirmed transaction, fresh exact expiry/identity/records readback, zero row counts and completed writer close. File path: `<LIVE_RUN_ARTIFACT>`; status `OWNER_RENEWAL_CONFIRMED`, never a full-demo PASS. It includes `format: ens-owner-revive-v1`, name/owner/seller/skillRegistry, chain11155111, previousExpiry/newExpiry, tokenId/resource, txHash, fresh proof block/hash/timestamp, all unchanged records and `noSetup/noGrants/noPurchases: true`. Its block is the post-renewal readback block, not necessarily the transaction's mined block. Resume independently reads and correlates both blocks and the exact transaction before using this expiry.

Text-only production re-pointing is a separate owner action documented in `e15-owner-repoint.md`; it does not revive an expired leaf. After the resumed demo expires, any further revival, intended price restoration and exact narrow price grant remain separate future approvals—not part of this one renewal.

## Source anchors and offline evidence

- `internal/task-preparation/e15-owner-revive.ts:9`: fixed directory/journal/RPC and identity constants.
- `internal/task-preparation/e15-owner-revive.ts:16`: command-wide cooperative abort/hard fuse.
- `internal/task-preparation/e15-owner-revive.ts:39`: retained live/expired token/resource checks.
- `internal/task-preparation/e15-owner-revive.ts:45`: public zero-row/ownership guard before key use, stable binding, active-before-open.
- `internal/task-preparation/e15-owner-revive.ts:52`: frozen journal expiry and exact sole renewal call.
- `internal/task-preparation/e15-owner-revive.ts:56`: intent, one send, confirmed checkpoint, fresh unchanged readback and shared close.
- `internal/task-preparation/e15-owner-revive.ts:73`: existing proof refusal and durable public output after completion.
- `scripts/ens-setup-driver.ts:217`: first-created durable chain-time expiry; `:242` known-hash no-resend path; `:252` signed hash persisted before broadcast; `:168` exact transaction/receipt proof.
- `internal/task-preparation/e15-postrun-verify.ts:84`: bounded pinned-block public hierarchy/roles/records/simulations collector; explicit expired partial mode never claims full-demo PASS.

Testing used `ts-testing` guidance: behavioral refusal/order tests and actual inert CLI subprocesses, never live payment mocks presented as evidence. Original helper stub produced three genuine failing tests before implementation. The final cancellation/fuse follow-up produced two genuine Reds (writer opened after derived-key cancellation; missing command-wide fuse) before the fix. Added explicit expired-partial coverage is a subsequent coverage check, not claimed as Red-before-implementation. Final focused counts and syntax check are recorded in the parent handoff; no competing full suite or live helper run was performed here.

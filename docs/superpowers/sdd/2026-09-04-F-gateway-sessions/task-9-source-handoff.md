> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F9 source handoff — funding-independent buyer session

September 6, 2026. Readiness only, while the parent runs the frozen F8 full gate.
This note is the sole write. No source/test changes, test execution, Git, network,
keys, signing, funding or live activity. F9 source remains held until the reviewed
F8 commit and parent release. F11 owns explicit funding; F1 authority is consumed.

Read the complete Plan F global constraints and Task 9; all three current F9
readiness/decision/review notes; actual buyer index, payment transport, Gateway
signer, ordinary signing section, core session/receipt/money contracts; frozen F8
routes and pure admission; package exports, Promise tests and native Gateway
transport/replay tests. Inspected existing ENS script import/help guards, public
listing route and test/compiler collection. No runtime findings or Reds are claimed.
The ts-testing skill informed the public-behavior, actual-runtime and regression
matrix below; no new framework or uncollected test lane is proposed.

## Proposed exact ownership for release

Parent approved these eight paths, no shared hub/payment/core/MCP/CLI/dependency edits:

1. NEW `packages/buyer/src/session.ts`: captured SDK authority, one-shot operation
   ownership, lifecycle, conservative issued totals, signing and reconciliation.
2. NEW `packages/buyer/src/session-http.ts`: session-only bounded captured transport
   and cancellation, without changing unrelated legacy diagnostic behavior.
3. NEW `packages/buyer/src/session-wire.ts`: own-data normalization, closed wire
   decoders and exact binding/arithmetic/reference projection.
4. `packages/buyer/src/index.ts`: additive public session re-export only; preserve
   ordinary callSkill and existing typed Promise boundaries byte-for-byte otherwise.
5. NEW `packages/buyer/test/session.test.ts`: public SDK/decoder/lifecycle behavior.
6. NEW `packages/buyer/test/session.bun.test.ts`: actual package/subpath imports,
   owned loopback transport and real hub-facade integration, bounded cleanup.
7. `packages/buyer/test/promise-api.test.ts`: additive public entry-point session
   export checks and Promise success/failure/interruption cases.
8. NEW `packages/buyer/test/fixtures/session-runtime.ts`: one inert owned child/
   preload fixture only for real package import/loopback/runtime evidence.

Prefer leaving `fetch-with-payment.ts` unchanged: its current unbounded challenge
read and internal evaluation-time capture cannot provide this session boundary
merely by appending sessionId. The new session lane can reuse the real exported F2
signing/domain helpers and exact PaymentPayload encoding with its own captured
JSON replay and one-paid-retry policy. Existing F2 Blob/general-request behavior
remains untouched. If actual implementation reveals a needed shared edit, request
that exact addition before touching it. Do not import hub helpers into product SDK.

F9 public surface remains `openSession(args): Effect<BuyerSession, BuyerSessionFailure>`;
BuyerSession exposes immutable `id`, `rail`, `network`, `buyer`, `budgetAtomic`,
plus `call`, bounded read-only `status`, and `close`. Session/token/operation maps
remain closure-private; no global session, exported reset or public credential.
Keep `seller` as the compatible argument naming the URL service segment, NOT a
wallet-address assertion: F8 matches `listing.serviceName`. Validate the actual
lower-case route grammar with the existing 32-character ServiceName bound and
canonical skill ID. Explicitly refuse session ENS/name or hire-lineage arguments
before IO/signing in this first bounded lane; ordinary ENS/hire remain unchanged.

Call args retain input/maxAmountAtomic/maxWaitMs and allow bounded pollIntervalMs;
capture input/authority before awaiting. Effects accept cancellation through the
Effect runtime; operation state is allocated outside evaluation and claimed before
IO. Use a fixed buyer-local tagged error with phase/issuance discriminant and known
atomic exposure, never remote prose or raw Cause. Exact export field spelling is
to freeze with the initial genuine-Red/API checkpoint, before F10 consumes it.
Status reports validated hub values separately from immutable local issued,
confirmed and unresolved-exposure totals; it never pretends those are balances.

## Concrete interface choices

1. **Listing/splitter trust.** F8's challenge contains payTo and optional splitter
   address/version, but no seller wallet, skillVersion or feeBps. The existing
   same-origin GET `/listings/:id` returns seller, serviceName, version and price,
   but not splitter facts. Proposed narrow correlation: bounded listing snapshot,
   exact service/skill/version/price/seller capture; direct Gateway/Test/EIP requires
   challenge payTo equal seller. EIP splitter requires exact challenge payTo equal
   extra.feeSplitter, known version and pinned USDC domain; terminal seller/version
   matches the listing and all fee arithmetic is checked. This is hub-supplied
   splitter routing, NOT independent pre-sign splitter-owner/fee verification.
   No paid RPC, new listing fields or invented fee observation. Parent approved
   this exact choice under existing trusted-hub policy after rereading the route:
   ownership/fee remain hub-handshake assertions, and later receipt arithmetic is
   not retroactive authorization proof. Project only bounded listing authority
   fields; stats/other literal extras are neither instructions nor stored authority.
2. **Dependency-isolated Promise surface.** Existing scripts use root-exported
   callSkillPromise/resolveEnsListingPromise specifically to avoid importing Effect
   from the script environment. Parent approved additive `openSessionPromise` returning a
   capability-private Promise facade with call/status/close, each running the same
   already-issued Effect once and optionally forwarding AbortSignal. Preserve the
   original typed failure (not FiberFailure text), as the existing wrappers do.
   This is not a CLI/session script/deposit command. No automatic cleanup close,
   open, deposit or retry. Test actual root imports without assuming script callers
   share the SDK's Effect dependency/runtime. The facade itself is frozen and
   forwards an explicit optional AbortSignal into the same issued Effect.

## Frozen F7/F8 wire to consume

- Exact origin: HTTPS or literal loopback HTTP, no path/query/fragment/userinfo,
  whitespace/backslash ambiguity. All phases use captured fetch, redirect:error,
  credentials:omit. Session capability never reaches a foreign origin or URL.
- Open POST body buyer/budgetUsd/optional rail; exact 201 has six fields:
  session_id, session_token, rail, network, budget, note. ID is ses_ +32 lowerhex;
  token is 32 lowerhex. Canonical decimal input <=6 fractional places, positive
  uint256 bigint. Dollar wire values must round-trip through exact formatPrice;
  no Number conversion, trimming, coercion or untrusted-note authority.
- Status GET `/sessions/:id`: session_id, rail, network, budget, spent, held,
  remaining, calls array <=100, complete, closed, optional closed_receipt ONLY for
  a persisted closed complete snapshot. Validate IDs, references, sum/arithmetic
  and exact enclosing/closed artifact agreement. Complete does not mean closed.
- Quote/probe and one paid POST `/x/<service>/<skill>` use BOTH session headers;
  the unsigned probe uses the exact captured input bytes. Exact 402 payment
  challenge has one validated requirements entry. Other policy402s never sign.
  Paid202 has exactly job_id, status:queued, poll_url, job_token, price. Require
  locally observed signer entry and issued amount; forged unsigned202 is no proof.
- Poll exact same-origin `/jobs/<original-id>/result`, NO query, with all three
  headers: x-arcade-session, x-session-token, x-job-token. The capability is an
  opaque distinct session-job realm; never extract a query token or call ordinary
  `/jobs/:id`, legacy callSkill polling or receipt-tree recovery.
- Exact pending202 `{job_id,status:pending}` alone may repeat bounded GET. Exact
  uncertain503 `{error:session_settlement_uncertain,settlement_status:uncertain}`
  stops with reconciliation-required exposure; no paid resend or second signature.
- Released200 contains job_id,status:rejected,result:null,detail:session_released,
  receipt. Succeeded200 contains job_id,status:succeeded,result,receipt. Strict
  receipt projection includes atomic decimal strings plus price/sellerShare/fee
  dollar strings and explorer string|null; correlate local job, buyer/session,
  service's captured seller, skill/version, signed amount, rail/network and root
  lineage. Only succeeded correlated evidence releases fenced output. Gateway UUID
  and Test 0xtest references stay unlinked; an EIP hash/category/link is not an
  independent mining proof. Reject gateway-batch in current session completion.
- Close POST empty or {}; no automatic retry. Exact pending409 permits open state;
  missing/invalid/lost response retains capability in close-uncertain, blocks new
  signatures and recovers only through matching status.closed_receipt. Existing
  session_closed409 alone is not a recovered receipt. Close never settles extra.

Proposed transport bounds: request input <=1 MiB with depth64/nodes65536 and early
key/value byte bounds; open/error/challenge/accepted <=16 KiB; status/close <=128 KiB;
listing <=1 MiB; result <=2 MiB+16 KiB (conservative envelope for F8's separately
bounded 1 MiB Job and Receipt, without truncating valid output). Every response
gets fatal UTF-8, content-type/framing checks, closed decoding and a whole-fetch/
body deadline. Proposed 5s per request, limited by call's overall <=15min monotonic
deadline; native late resolve/body cancel/lock cleanup cannot restart work. These
are finite SDK bounds, not a guarantee of remote cancellation or peer TCP EOF.

## State and signing implementation constraints

Capture selected ready chain, account's own address and stable signer callback,
origin, fetch, requested rail and budget once. Recheck F2 ambient selected chain
against that snapshot immediately before signing. Reuse actual F2 Gateway signer
and actual USDC signer behind a captured wrapper that freezes/verifies the exact
typed request, marks conservative issuance at signer ENTRY and locally recovers
the final signature against the captured buyer. A signer can sign then stall/throw;
late completion after timeout/interruption must not send paid bytes.

Prefer the parent-requested monotonic per-session issued total: reserve atomically
before signer entry, never refund issued authority on hub absence/release/close;
track confirmed spend and unresolved exposure as classifications of that total,
not extra purchases. New signatures must satisfy captured budget minus already
issued/reserved authority AND independently validated hub remaining. Known matched
hub held/settled overlap is not added twice; unknown overlap never increases room.
Explicit independent calls remain purchases; repeated/concurrent evaluation of
one issued Effect cannot purchase again. No SDK wallet-wide/persistent guarantee.
F10 must additionally retain its existing cumulative process ceiling and queue.

## Required genuine tests after source release

1. Separate missing-module collection from behavioral Reds. Use public root API
   with actual F2 signer/recovery and genuine F7/F8-shaped fixtures, not stale plan
   ses_1/tok/HTTP200 open fixtures. Include lower-case service-name targets.
2. Wrong authority/closed fields/canonical IDs/money >2^53 and uint256 boundaries;
   duplicate refs, wrong rail/reference category, complete/open and closed recovery;
   malicious note/error/input/token sentinel never appears in exported errors.
3. Actual input bytes and BOTH headers on quote/probe/retry; THREE headers on every
   repeated poll; exact query-free path, foreign origin/redirect/ENS/hire refusal,
   second402 and unsigned202 with zero new signatures/output.
4. Mutable args/account/fetch/headers/chain while queued; repeated/concurrent Effect
   evaluation; aborted probe, signer-entry stall, late fetch/body, elapsed deadline,
   zero-byte chunks and uncooperative cancel. Preserve original interruption cause.
5. Budget10 first signed6 POST lost, then another6 sequential/concurrent: only first
   signer enters. Hub absent/released/closed evidence does not refund it; known held/
   settled overlap and repeated status/close classification do not double count.
6. Close pending/lost/invalid/races, no reopen/close/paid retries, no token loss or
   sessionless fallback. F10 cancellation queue tests remain F10, not claimed here.
7. **Script/SDK surface:** actual Bun root import `@arcade/buyer` and wildcard
   `@arcade/buyer/session` from the root/script-like environment; no env-key reads,
   network/funding/import side effects. Vitest uses the root entry point because
   its prefix alias would misresolve an unconfigured new subpath; do not change
   aliases just to pretend native package exports were tested. Exercise public
   Promise facade success, exact typed failures and optional signal.
   Retain existing Promise/ENS/hire tests and actual ENS demo import/help guards
   as regression targets. No scripts or CLI changes are needed for F9.
8. Owned native loopback + real hub facades prove end-to-end Test receipt and
   Gateway offline-signing transport without external services, credentials or
   funding. Await exact child exit/listener shutdown and refusal after cleanup;
   do not report mere mock JSON as production router evidence.

Vitest already collects packages/*/test/**/*.test.ts; root bun test .bun.test owns
native files. Focused buyer/adjacent tests and exact owned-root TypeScript program
must include fixture and Promise roots explicitly; parent alone owns full gates,
public artifacts and commit. Freeze code/hash/API/report before independent review.

## Readiness input hashes

| Input | SHA-256 |
| --- | --- |
| task9-buyer-readiness.md | 2dc2df3a82d19bdb77bfacbe52342cd8685279daeef0aa5658b724063994d46c |
| task9-parent-decisions.md (including frozen-wire/listing section, before later Promise append) | c0536b9ac76d3c614c8260a7560ea69ca56bc15f93b7795c32cdef7e7b7168ee |
| task9-independent-readiness-review.md | 3651c602bcf7f2020033dbb3a1a208c02567b6c7597374fa75a2324faae2a576 |
| packages/buyer/src/index.ts | 858ad5c6989c9f4aff2d326a0656e4a129f1c2178c01506cac6609a44dc88a7c |
| packages/buyer/src/fetch-with-payment.ts | e8b0a8e1c3936b7fcbd5afa82069248f05e9996e884d1ee81bcc5356b729ab4c |
| packages/buyer/test/promise-api.test.ts | 1ba9bbeb3f886e01df0a3b9a8485a0efba6a3e47e28004cf46abd8631071ebd3 |
| apps/hub/src/server-session-calls.ts | 10b5a25bc9c3ab365e2a9db8b395d67954a7880912bd464d8f1a5f14f007103c |
| apps/hub/src/server-sessions.ts | af7c3467a69c94873200f08cf92f53b50f61d61aab1167841a85548139445968 |

Historical readiness statements about query-token extraction, wallet-only seller
grammar, one mined batch and F9 deposit are superseded above and by parent decisions.
Parent separately approved the eight paths and Promise facade in the final handoff
message. No concrete unresolved choice remains; wait for the F8 commit/source release.

> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F11 strict CLI and session adapter — September 6, 2026

Six-path source checkpoint frozen at 04:42 IST (2026-09-05T23:12Z).
Focused author verification: **19/19 Bun tests, 101 assertions, exit 0**.
Exact integration typing is pending the other author's still-active runtime;
this is not a complete F11 gate or acceptance of that runtime. Parent expressly
allowed this separate freeze with dependency diagnostics identified below.

No operational key, Keychain, external network, RPC, Gateway API, deposit,
approval, transfer, burn, mint, withdrawal, live session, Git mutation, dependency
change or full repository test was performed. F11/F12 live remains NOT RUN.

## Ownership and contracts

Only these six released source/test/doc paths changed in this slice:

- packages/buyer/src/gateway-funding-cli.ts
- packages/buyer/src/session-cli.ts
- packages/buyer/src/cli.ts
- scripts/gateway-withdraw.ts
- docs/sessions.md
- packages/buyer/test/gateway-funding-cli.bun.test.ts

This ignored report is additive. Other authors own the pure codecs/policy,
journal/runtime and their tests. The ts-testing skill guided genuine regression
capture, scoped behavioral tests, bounded child cleanup and exact-root typing.
The full Task 11, global constraints, source handoff, accepted split and current
305-line parent decisions were read. Latest parent decisions supersede the
literal plan's automatic funding and simplified withdrawal examples.

The funding parser is a closed command union. Exact deposit and target shortfall
are distinct modes. Every mutation requires expected address, fresh absolute
journal and explicit amount/aggregate gas policy; withdrawal additionally requires
explicit fee and finite burn-block-delta caps. Amount/uint parsing and closed public
encoding come directly from G3's pure module. No key flags, caller operation ID,
provider endpoint, claim-home override, default movement or withdraw-all exist.

New reserved commands dispatch before the legacy buyer key parser. The legacy
ordinary-buy implementation is wrapped without changing its callSkill behavior;
import.meta.main guards actual dispatch. The seller script requires the same
explicit withdrawal flags. Imports/help/invalid inputs do not launch runtime IO.

Runtime dependency construction is deferred until strict parsing. Read-only
inspection/reconciliation/finalization do not receive acquireSigner. Mutations
receive a lazy role-key callback which checks the exact expected account and
active signal/deadline; the runtime owns its pre-key claim/identity/write-ahead
gates. CLI key sources are buyer or seller role environment only, never flags,
Keychain or an implicit fallback. The callback supplies local viem signing, not
transport; failures have fixed diagnostics. No signer was invoked in these tests.

The synchronous runtime facade and standalone read-only names are the agreed
contracts. Withdrawal invokes request once, validates its closed facts-only
outcome, then invokes mint once only for mint_ready. Observed succeeds only for
balance inspection. Noop/confirmed are successful terminal outputs; partial,
uncertain, refused and intermediate outcomes exit nonzero. Cleanup is once-only,
does not unlock, and cannot leak its exception through exported fundingMain.

The owning process has a 300-second soft/330-second hard fuse, including awaited
stdout and cleanup. The tests shorten only explicitly injected test bounds.
No timeout, stage failure or cleanup failure retries a request/signature/send.

The session adapter captures command/input/config before account acquisition.
It uses the actual existing openSessionPromise by default, with a trusted typed
open seam only for fixtures; it has no second HTTP transport or funding path.
The batch accepts explicit hub/address/budget/call count/skill/service/rail/input,
opens once, calls sequentially and closes once after all calls succeed. It stops
on uncertainty. Ordered local job IDs and authorized amounts must match a fully
decoded closed receipt before it is published. No raw result output is printed.
Status/recoverClosed are deliberate read-only methods on the retained private
handle; lost-close recovery does not send another close. Process exit loses that
capability; a public session ID does not restore it.

## Genuine Red → Green chronology

1. Before modifying legacy cli.ts, actual no-env-file children produced two
   failures (0 pass / 2 fail, 3 assertions): import dispatched usage/exit 2 instead
   of remaining inert; a reserved gateway typo reached the old missing-key error
   instead of fixed strict refusal. Import wrapping/routing made them pass.
2. Initial session feature checks were two collected missing-module failures,
   not behavioral runtime failures. The first draft also incorrectly expected
   19 argv entries instead of the actual 17; both tests failed parsing until that
   fixture-contract mistake was corrected. Neither is claimed as a money bug.
3. A later behavioral capture regression failed (0/1, two assertions before
   failure): mutating the command/service/input while account acquisition waited
   changed the eventual call. Synchronous own-data capture fixed it.
4. Parent's three draft findings reproduced together (0/3, three assertions before
   failure): a conflicting network still entered the key getter; a self-consistent
   receipt substituted a lower per-job amount; another reordered the locally
   observed calls. Pre-key Arc config checks and exact ordered amount binding
   fixed all three. A valid two-call receipt still succeeds.
5. A real exported-entry cleanup regression failed (0/1, two assertions before
   failure): finally rethrew a private close error after the fixed diagnostic.
   Once-only close and failure-path containment now return the fixed failure.
6. An actual child with a stalled stdout callback failed (0/1, one assertion):
   session help exited 0 before output completion, outside the hard-fuse ownership.
   Awaited write completion now keeps that child inside the fuse and exits 124.

Supplemental tests that passed immediately are not called Reds: strict input
matrices; no-op policy parsing; injected keyless inspect/reconcile/finalize;
valid mint_ready versus uncertain/malformed states; no raw capability output;
lost-close status recovery; valid amount/order receipt; deadline/late-account
refusal; explicit session help/import/invalid commands; and hard-fuse cleanup.

The parent's initial hypothesis that unflagged JavaScript `$` accepts a final
newline was disproved by an actual Bun probe and withdrawn. Explicit type/length
guards remain defensive, but no whitespace case is claimed as a demonstrated Red.

## Verification and boundaries

Final focused command:

```sh
bun --no-env-file test packages/buyer/test/gateway-funding-cli.bun.test.ts
```

Result: 19 pass, 0 fail, 101 assertions, 2.66 seconds, exit 0. Actual subprocesses
use the absolute current Bun binary with --no-env-file, minimal PATH-only env,
ignored stdin and bounded output drains. Each exact owned child is awaited and,
if needed, TERM then KILL escalated and reaped. No unrelated PID or service is
controlled. Injected read-only children replace runtime dependencies and forbid
fetch; their facts are synthetic, not actual chain/credit proof. Programmatic
session tests use typed fixture Promise handles, not a paid or real-hub session.
Their transport/exposure guarantees remain those of separately verified F9.

Exact TypeScript check uses the root tsconfig parsed with absolute configFilePath
and cwd as base, then createProgram over these five explicit TS roots:
gateway-funding-cli.ts, session-cli.ts, cli.ts, gateway-withdraw.ts and the new Bun
test, with noEmit:true/incremental:false and all actual dependencies. The latest
check at this checkpoint returned 21 diagnostics: three CLI references to G14's
not-yet-exported reconcile/finalize APIs and 18 diagnostics in his actively edited
runtime. Earlier own union narrowing and throwing-getter annotations were fixed.
There is no claim that exact strict or the full integration gate has passed;
repeat after the runtime freezes. No stubs or casts hide these missing APIs.

Read-only six-file whitespace/personal-path audit: zero trailing-whitespace lines,
zero personal-home path matches. Command examples use non-executable uppercase
policy placeholders and no operational secret material. No public report copies,
Git changes or full gates were made by this agent.

## Current technical limits

Docs explicitly distinguish Wallet USDC/native gas, Gateway available/total/
unknown pending categories, hub accounting and local issued exposure; transfer
UUID is not mined batch proof. The current deployed Minter mismatch refuses
withdrawal before signer/POST. Separately, the reviewed pending-only deposits
feed cannot correlate full Gateway credit to the deposit transaction. Confirmed
deposit plus observed available funds remains credit_pending until supported
exact attribution exists. This is proof/retirement uncertainty, not a claim those
observed available funds are unusable. Neither limit is an owner-only approval
item or authority to retry/redeposit, discard a claim or bypass identity checks.
The latest signed-complete terminal-proof exception to a missing clean-close
witness is documented; unsigned-refusal/no-op still require the witness, and
durable poison still refuses. No arbitrary storage-fault or capability-loss
recovery guarantee is made.

## Frozen SHA-256 inventory

```text
28b3e507f56fe39d2b87f19c933fa17b055eb939a3827a8c5c58626dfcc5b1e5  packages/buyer/src/gateway-funding-cli.ts
556c4174de12784a9019fd0fbeef42152ad8b52f7f8f4d83af82f322245b3b5d  packages/buyer/src/session-cli.ts
20dc11512a3dca0cae0fc2e01a8f44c4b95e95cb335035cd29e6779a756f0070  packages/buyer/src/cli.ts
b49abf063274ae81eff87a98975a8f7661ec42c89d357b94e597a09628f037eb  scripts/gateway-withdraw.ts
83c91143d99e78ff03fc8a2244c7c489c1075fcb036e5eb032f7d4b9b88ee59b  docs/sessions.md
f99baaf0691f57fe2610c7803cf71df2ea5c80174c0a9f354da589e081006516  packages/buyer/test/gateway-funding-cli.bun.test.ts
```

## Parent boundary corrections and refreeze — September 6, 2026

The preceding 165 lines remain byte-identical to the original report, SHA-256
303fc1a09beec717b7e043fe4b0a333b1fb8e13e36ac078d9b6a7e6429d66637.
The following supersedes only the final source/checkpoint inventory and identified
boundary details; it does not rewrite earlier test chronology.

Parent found that the journal's canonical absolute `.jsonl` policy was stricter
than the CLI/templates. Two real exported-entry tests reproduced 0 pass / 2 fail
(two assertions before failure): wrong extension and a tab-containing path both
entered the injected runtime loader. The parser now rejects both before import;
all templates end in `.jsonl` and explicitly require an already existing owned
mode-0700 canonical real parent. The caller's journal does not choose the separate
OS-account claim namespace. After this correction: 21/21 Bun, 107 assertions.

Parent then identified routing/spread occurring before argv own-data capture.
Actual exported fundingMain, buyerMain, withdrawMain and sessionMain children
reproduced four genuine failures: each invoked an index-zero getter and rejected
instead of a fixed refusal. A fifth preservation test already passed, accurately
separating existing behavior from a Red. The five-case run was 1 pass / 4 fail,
11 assertions, with 21 unrelated cases filtered.

All four entry points now capture a dense own scalar argv before indexing/spread.
The common entry envelope is at most 32 arguments, 1 MiB per string and 2 MiB
aggregate, with fixed local failure; it does not invoke argument accessors or
iterators. The funding parser retains its separate 16 KiB policy. Session JSON
keeps its 1 MiB bound, proven by the passing 64 KiB-input test that reaches only
an explicitly throwing fixture key getter (no actual key). The ordinary legacy
payment body is unchanged; only its entry argv is now captured before dispatch.
Its inner implementation is private, not another unguarded exported entry.
This is bounded own-data handling, not a generic hostile-Proxy sandbox guarantee.

Final focused command unchanged: **26/26 Bun, 122 assertions, 3.17 seconds,
exit 0**. No commands remain running. The exact five-root TypeScript program was
repeated after the runtime's standalone exports appeared: **11 diagnostics, all
in the other author's actively edited gateway-funding-runtime.ts; none in these
five roots**. Remaining runtime diagnostics concern its optional acquireSigner/
contextual parameters, serialized transaction narrowing and optional availableBefore.
Complete strict integration still awaits that source's final freeze; no claim of
a passing full strict program or runtime gate is made. Six-file whitespace and
personal-path audit again returned zero matches. No authority or live claim changed.

Refrozen six-path SHA-256 inventory:

```text
08674cc7e82c5c20b6c97f1c35182c9250bf4cfcd4067c84d927cf792cb4cb73  packages/buyer/src/gateway-funding-cli.ts
368027a24eb2620ec242468cb600dcc9e26979d95f4088d21b2308c881f74ded  packages/buyer/src/session-cli.ts
2e81599b91e5c265e0a817ec003cf8c45f48a89f2a2ac42e748d52ef3cc83a90  packages/buyer/src/cli.ts
be7ad3362c29dd79a78f0f3539dc0d855320d285421db83d55ff8594784551e0  scripts/gateway-withdraw.ts
2edc65612c224258b7df982bab801db61d057d96120fd24e2932b7eb2cfffece  docs/sessions.md
49647dbeef96ce66b8f0699450a105bca9984d24d9c526188f103809868b4a5c  packages/buyer/test/gateway-funding-cli.bun.test.ts
```

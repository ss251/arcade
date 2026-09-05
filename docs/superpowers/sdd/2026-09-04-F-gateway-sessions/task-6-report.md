> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F6 thin session facade — author freeze

September 6, 2026, approximately 00:27 IST. F5 is committed as 8b8ebb2; this
separate F6 task changes only apps/hub/src/sessions.ts and
apps/hub/test/sessions.test.ts. Independent F6 review, parent full gate, public
artifacts and commit remain pending. No live evidence is claimed.

Read the full F global/Task6 plan, updated task6-parent-decisions,
task6-readiness-review and task6-implementation-readiness including the explicit
test-category correction. Read the frozen F5 Store/kernel/core contracts, F4
registry and actual rail interfaces. Used ts-testing for existing Vitest tooling,
behavioral assertions, the actual in-repo TestRail and exact nested compiler
options. No unsafe literal aggregate-map or stale-session overload was retained.

## Implemented API and authority

Exports:

- newSessionId(): full UUID-derived ses_ plus 32 lowercase hex digits; no import
  time generation, truncated identity, secret, retry or collision-repair loop.
- sessionReceipt(snapshot): pure fixed-error projection of one validated closed
  complete SessionSnapshot. A complete-but-open snapshot is not a closed receipt.
- makeSessions({store, rails, chain, newId?}): import-safe, stateless facade over
  the actual SessionStore and built Rails. Construction only validates explicit
  trusted chain data; it never contacts a provider or invokes a rail.

Facade methods openSession, snapshot, inFlightAtomic, reserve, beginSettlement,
commit, release, markUncertain and closeSession return typed Effects. The facade
also exposes the same pure sessionReceipt projection. Open input is buyer,
budgetAtomic, optional rail and explicit openedAtMs; the result is the committed
Session. Snapshot is the bounded authoritative SessionSnapshot. Close returns
SessionReceipt from the single Store close result, without a second status read.
Actual repeated Store close remains SessionClosed with the persisted close time.

Reserve delegates full SessionBinding plus queued Job and preserves created/jobId
exactly, including original semantic retry after closure. It never performs an
eager closed-session check or allocates another execution. Begin validates both
IDs, reads one authoritative snapshot to learn its immutable identity/rail, checks
that identity against the requested ID, then calls the atomic F5 begin once.
claimed:false is not another send permit. There is no second ledger, reservation
Map, global reset helper, accounting write, broker or live rail call.

SettledSessionTerminal and ReleasedSessionTerminal use Extract on the frozen
SessionTerminal union. Commit/release have both static variant restrictions and
runtime kind checks after bounded own-data normalization. Neither forces the
input kind nor changes the actual settlement's missing kind or reference. The
complete copied terminal is delegated once to finishSessionJob. F5 remains the
authority for binding, fee, outcome, nonce and terminal persistence validation.

## Input, result and failure boundaries

Open input is copied with the existing bounded own-data serializer before reading
buyer/rail fields. It rejects extra fields, accessor execution, malformed buyer,
budget/time/rail and invalid injected IDs before Store mutation. Buyer case is
normalized deliberately. Reserve/terminal commands reuse normalizeSessionCommand
before any routing field; no user getter is invoked by an object spread or schema
coercion first. F5 still applies the full exact per-field binding/evidence checks.

Explicit chain validation checks its static ready pinned identity and payment
coordinates, never an ambient selector or caller status flag alone. It refuses
accessors before inspecting routing fields. RPC/explorer endpoints are not used
or verified by this facade; a built Rail has no independent network proof.
Known but unbuilt rails yield the existing bounded unavailable error; arbitrary
malformed rail text cannot enter that error's payload.

Only admission/open/begin of non-test rails requires the backend-derived durable
fact. Configuring a real rail does not disable separately selected test sessions.
Terminal evidence, uncertainty marking, reads and close are not blocked by that
admission guard; a prior send must not become an invented nonsettlement. The
facade cannot make memory durable or infer a remote acceptance from a backend flag.

Store invocation is suspended and catches typed failures plus synchronous/Effect
defects. Known SessionError instances survive. Unexpected non-interruption failures
become fixed SessionStorageUnavailable without SQL/provider/input prose. Original
interruption causes, including a composite interrupt cause, are re-failed unchanged.
No error path retries, releases funds, writes compensation or makes a no-charge
claim. A lost response is not evidence that a Store write did not happen.

Returned snapshots/session/receipt/results are fresh frozen whitelisted objects,
not a spread of private Store data. Projection validates bounded calls, exact
spent/held/remaining/complete relationships, positive actual call prices, unique
jobs/references, time ordering, supported ready network and per-rail categories.
It checks consistency without repairing totals, dropping unknown calls or
deduplicating invalid source evidence. This validation is not a parallel ledger
or independent cryptographic verification of the Store's source evidence.

Test references retain the explicit simulated test category and actual 0xtest
locator. EIP hashes remain onchain reference categories, not independent mining
proof; Gateway retains explicit canonical transfer UUIDs with no current batch
terminal path. No explorer, batch-count or withdrawable-credit claim is emitted.

## Genuine Reds and focused verification chronology

1. At 00:17:35 IST, the first six-case suite failed collection because sessions.ts
   did not exist. No behavioral accounting assertion ran; this is a missing-module
   Red only. The initial facade then passed those six cases at 00:20:12 IST.
2. At 00:23:14 IST, the expanded actual draft run had 20 pass / 1 fail. Pure closed
   projection accepted a syntactically valid but foreign network. The following
   zero-price assertion in that same case was not reached, so it was not yet an
   independently observed Red.
3. Before any production fix, those two assertions were split into distinct cases.
   At 00:23:49 IST the focused command had 0 pass / 2 fail / 20 filtered. Both
   foreign-network and zero-priced settled-call evidence were actually accepted
   by the draft despite adjusted matching totals. These are genuine behavioral
   projection Reds, not remote-payment or F5-ledger failures.
4. The narrow fix checks static supported-ready network/rail and positive call
   prices in the copied projection. The full final service suite passed 23/23 at
   00:24:50 IST. Its extra equal-price-sibling case and other adversarial guards
   passed when first added; they are coverage, not claimed additional Reds.

Final focused command at 00:26:23 IST, exit zero:

```sh
bun --no-env-file x --no-install vitest run apps/hub/test/sessions.test.ts apps/hub/test/session-ledger.test.ts packages/core/test/session.test.ts apps/hub/test/rails.test.ts
```

80/80 Vitest across four files: 23 F6, 27 F5 kernel/memory, 20 core and ten F4
registry cases; 5.62 seconds. The facade tests exercise real F5 memory authority,
two facades sharing one Store, equal-price siblings, closure retries, preserved
uncertainty, wrong runtime variants, getter/extra-field refusal, volatile admission
versus evidence recording, authoritative begin identity, original interrupt cause,
fixed defects and fresh private-free projection. One case explicitly executes the
actual offline TestRail challenge/verify/settle outside the service, then passes
its unchanged result through commit and closes the real memory session. Only
simulated local balances change. Fake named Gateway fixtures perform no Gateway IO.

Exact TypeScript createProgram over the TWO owned files and their real dependency
traversal passed with EXACT_F6_DIAGNOSTICS=0. It uses the real root tsconfig options,
noEmit:true and incremental:false, including the nested hub test normally omitted
by the root include. The wrong terminal calls use intentional ts-expect-error
directives whose correctness is checked by this exact program. No compiler flag
was weakened and no test was excluded.

```ts
import ts from "typescript"
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd())
const program = ts.createProgram([
  "apps/hub/src/sessions.ts", "apps/hub/test/sessions.test.ts"
], { ...parsed.options, noEmit: true, incremental: false })
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => process.cwd(), getCanonicalFileName: f => f, getNewLine: () => "\n"
}))
console.log("EXACT_F6_DIAGNOSTICS=" + diagnostics.length)
process.exitCode = diagnostics.length ? 1 : 0
```

All fourteen frozen F5/unchanged rail-result fingerprints still match the F5
correction inventory; no foundation file was edited. The two new files have no
trailing whitespace. No extra SQLite fixture was needed: F6 delegates through
the existing Store seam, and its exercised service properties use real memory
authority plus narrow adversarial Store spies. This run does not claim a new
SQLite restart/crash proof or repeat F5's Bun fixture evidence.

## Frozen source/test fingerprints and handoff

```text
77fd2789d342008cd2629b9bb6e8eea9c39b2bf60bab111529fe355911808c41  apps/hub/src/sessions.ts
220f761cea68b22e4e7d367193c68d8937e35ac078e4c546aefe2b2c92ffa458  apps/hub/test/sessions.test.ts
```

No source/test command remains running at freeze. No full repository suite, Git,
key, network, dependency, F7 source, database or live action was performed. F1's
one-shot authorization remains consumed. F7/F8 still must implement header-only
capability privacy, no-store responses, stable secret/durable admission, public
receipt sessionId exclusion, exact verified-binding closure, pre-barrier terminal
size validation, single sending authority and withheld uncertain output. F6's
successful accounting delegation does not implement those route/pipeline gates.
Parent owns independent review, complete gates, public preparation and commit.

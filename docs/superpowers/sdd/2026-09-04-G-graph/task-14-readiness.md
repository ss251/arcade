> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G14 readiness audit — wallet-risk-note hires counterparty-graph

Read-only audit on 2026-09-05. No source/test/manifest, Plan A artifact, key, account,
network, Graph query, Arc purchase, or Git state was changed. This note does not authorize a
live run.

## Verdict

**Ready for a bounded offline implementation only after the current frozen-tree commits, with
explicit deviations from the literal Task 14 sketch. Not ready for a post-G14 loop-probe/live
lineage claim.** The current broker and G10–12 contracts support the feature, but the existing
wallet helper, trust rule, output-shape sketch, economics, and Plan A proof constants are not
compatible as written.

## Blocking compatibility hazards

1. `skills/wallet-risk-note/run.ts:52-81` turns every hire failure into `process.exit(0)`.
   Wrapping a second call in `.catch(() => null)` cannot make that best-effort: `fail()` exits the
   owning process before the promise rejects. The same module also reads env at import and invokes
   `main()` unconditionally at line 163, so the planned pure-function import test would consume
   stdin/possibly exit. Refactor to a pure exported job function returning a refusal/end-turn
   envelope and guard CLI I/O with `if (import.meta.main)`; no helper used by job logic may call
   `process.exit`.

2. Missing Graph evidence cannot preserve an `"ok"` verdict. G12 production explicitly rejects
   `allow` and nonzero `attesterSettledCount` (`skills/counterparty-graph/run.ts:74-78`) because no
   service-settlement verifier or trusted-validator policy exists. A null/malformed/unsettled Graph
   result therefore makes a healthy flow verdict `caution`, never `ok`. Existing `caution` and
   `unfunded` remain unchanged. The plan's `combineVerdict("ok", null) === "ok"` and clean-allow
   examples are unsafe under the implemented evidence boundary.

3. The actual broker success body is one object, not the plan's implied source array:
   `{skillId,jobId,settled,result,fenced,costUsd,remainingUsd}`
   (`packages/runner/src/hire-broker.ts:241-249`). Current wallet output likewise has one
   `sourcedFrom` object (`run.ts:142-157`; manifest lines 71-85). Preserve that object and its
   existing flow fields; add a bounded nested nullable Graph source rather than spreading it as an
   array. Require `counterparty` in the top-level output schema but permit its value to be null.
   Requiring a nullable key is compatible with a legitimate no-evidence result and prevents
   missing-property ambiguity.

4. A child result is usable only after strict broker correlation and `settled === true`. Validate
   exact requested `skillId`, canonical nonempty job ID, boolean settled flag, exact bounded cost,
   bounded remaining budget, and result shape. Never inspect/use `result` when unsettled. For the
   Graph result validate the exact requested lowercased address; current closed Assessment keys;
   verdict; unique bounded contradiction/evidence codes; bounded identities/sources; and
   `attesterSettledCount === 0`. Reject current-production-impossible `allow`. Only then expose the
   three-field counterparty summary. A settled but unusable Graph child may be recorded as paid but
   must yield `counterparty:null` and `caution`.

5. Do not turn transport uncertainty into fake best-effort null. A parsed 2xx broker body with
   `settled:false` is definite no-charge evidence and may continue as `counterparty:null`. Known
   broker pre-purchase 400/402/403/404 refusals may also be reduced to a fixed unavailable state if
   deliberately classified. Socket failure, timeout, malformed/truncated response, 5xx, or an
   otherwise ambiguous post-send failure can have an unknown payment outcome; refuse the parent
   with fixed prose and do not retry. Never copy broker/provider error text into stdout or stderr.

6. The current helper trusts `res.json()`, TypeScript casts, and `Number(... ?? 0)`
   (`run.ts:77,91,95,104-126,140,152-156`). This manufactures false zero cost, nonce and booleans,
   admits NaN/unsafe balances, and does not bind the flow address/chain. Strictly decode the complete
   flow result: address equal to the normalized input, canonical `balanceAtomic` and exactly matching
   six-decimal `balanceUsdc`, safe nonnegative nonce, boolean `isContract`, chainId 5042002,
   canonical block number and bounded timestamp. Compare `minUsdc` in atomic bigint form; reject
   nonfinite/negative/overprecision thresholds. Missing values refuse rather than defaulting.

7. The wallet's Unix-socket client is currently unbounded and Bun-fetch-specific. Use an
   import-safe Node HTTP socket request (or equivalently cancellable implementation) with a fixed
   `/hire` POST, exact request length, bounded response headers/body, optional-but-exact supplied
   content length, identity encoding, total connect+headers+body deadline, AbortSignal propagation,
   and request/response destruction during timeout/interruption. Account for the broker's duplicated
   `result` plus `fenced` value when selecting the finite response cap. No raw response diagnostic
   should cross the boundary.

8. Timeout/concurrency needs an explicit decision. The proposed wallet bound is 120s, while its
   children declare 30s and 90s. Sequential worst-case leaves no transport/cleanup margin. Parallel
   hires require three active slots for a direct wallet root and four when nested under loop-probe;
   runner defaults or Plan A's `maxConcurrency:3` cannot guarantee the nested case. Prefer sequential
   calls with a justified larger wallet bound, or coordinate capacity and cancellation semantics
   before parallelizing. Do not silently rely on normal fast responses as a bound.

9. Plan A has two compatibility surfaces that must be treated differently:

   - Its historical live proof and exact validator are immutable pre-G14 evidence. They hard-code
     three skills, wallet `$0.05`/60s/0.02, maxConcurrency 3, exactly three jobs/receipts, two
     descendants/reservations, and child total 60,000 (`scripts/e2e-lineage.ts:13,82,85-95,123-169`).
     They do not copy/register `counterparty-graph`. Never update those constants in place or
     reinterpret that evidence as proving the post-G14 topology.
   - Its reusable offline harness/tests are not isolated from today's canonical files.
     `prepareLineageSkills` reads and guards the current manifests and `run.ts` sources directly
     (`scripts/e2e-lineage.ts:236-251`), and the A9 test invokes it both for the canonical-entry test
     and the owned offline cycle (`scripts/e2e-lineage.bun.test.ts:225-239,244-264`). Therefore a
     wallet source/manifest-only G14 edit can break the frozen A9 offline gate even when no live
     replay is attempted.

   After G14, the loop tree is four jobs and three descendants with committed child total 210,000
   atomic (150,000 wallet + 10,000 flow + 50,000 Graph). `skills/loop-probe/arcade.json:13-15` also
   times the root out at 60s while the child would declare 120s or more. Before wallet implementation,
   a separately scoped Plan A compatibility change must preserve the old exact validator/evidence
   and either (a) freeze versioned historical fixture inputs or (b) add an explicit post-G14 harness
   profile with its own four-job/210,000 guards. Parameterizing is acceptable only if the historical
   profile remains exact and the new profile cannot validate old evidence. Until then, do not run or
   claim post-G14 lineage evidence and do not weaken any canonical guard.

10. The literal economics are stale. `usdc-flow-check` is `$0.01`, not `$0.02`; Graph is `$0.05`.
    Maximum ARCADE child cost is therefore `$0.06`, the `$0.15` root seller share after the fixed 5%
    fee is `$0.1425`, and the pre-operating-cost margin is `$0.0825`. The root lineage ceiling check
    is `$0.15 + $0.01 + $0.05 = $0.21 <= $0.25`. G12 `sources[].costAtomic/paymentTx` describe
    bounded Graph-query spend and may be null; they are not another verified wallet child settlement
    and must not be added to this margin. Do not infer model/provider costs or replace unknown with
    zero.

11. Update the wallet listing description: it currently says every call settles twice
    (`arcade.json:5`). Post-G14 it can settle up to three jobs, while a refused Graph child settles
    no Graph receipt. The public copy must describe conditional settled children rather than promise
    an exact count.

12. Task 14's commit command must stage only its owned wallet files/tests. Its literal `git add`
    names Plan A-owned loop-probe and lineage files despite saying not to edit them.

## Recommended minimal output contract

Keep `sourcedFrom` an object and add one nested nullable field, for example:

```ts
sourcedFrom: {
  skillId: "usdc-flow-check",
  paidUsdc: "$0.0100",          // only from a correlated settled broker response
  budgetLeftUsd: "$0.0200",    // only from validated ledger/cost facts
  counterpartyGraph: null | {
    skillId: "counterparty-graph",
    paidUsdc: "$0.0500",
    evidenceUsed: boolean
  }
}
```

The exact remaining amount changes when Graph does not settle. No monetary field should use
`?? 0`, `Number(untrusted)`, or a quoted provider price. Top-level `counterparty` should always be
present as the validated three-field summary or null. Add fixed findings for each validated
contradiction; when evidence is absent/invalid, add a fixed "evidence unavailable; clean allow
withheld" finding without provider prose.

## Recommended offline TDD matrix

Create `skills/wallet-risk-note/test/verdict.test.ts` first and prove a collected Red without
running any live service.

- Import safety: importing `run.ts` performs no env read with effects, stdin read, socket call,
  stdout write, timer, or process exit.
- Pure verdict: manual-review/refuse downgrade `ok`; null also downgrades `ok`; nothing upgrades
  caution/unfunded; unverified `allow` is rejected before combination.
- Happy path: strict settled flow `$0.01` plus strict settled G12 manual-review/refuse `$0.05`
  yields exact object-shaped source data, `$0.06` child cost, non-upgraded verdict and fixed findings.
- Legitimate Graph no-settlement: parsed/correlated 2xx broker response with `settled:false`, null
  result and zero cost continues with `counterparty:null`, a caution floor, no Graph source claim,
  and no raw diagnostic.
- Actual-settlement gate: flip settled, skill ID, job ID, address, cost, remaining, result, verdict,
  attester count, contradictions, evidence flags, identities and sources one at a time. None may
  create usable counterparty evidence or fabricated cost.
- Flow gate: mutate every required flow field, address/chain binding, canonical atomic/decimal
  correlation, unsafe nonce, timestamp, minUsdc and settled/cost fields. Each must refuse the parent
  with no output.
- Ambiguous socket/provider failure: timeout, close, malformed JSON, oversized/truncated body,
  length/encoding conflict and 5xx produce fixed parent refusal, no retry and no reflected body.
- Schema/economy: core-decode the manifest; assert price `$0.15`, exact bound/capability, nullable
  required counterparty, object-shaped source extension, actual child manifests `$0.01` + `$0.05`,
  5% seller share and `$0.0825` margin. Explicitly exclude `sources[].costAtomic` from that math.

Add one actual Bun/owned-Unix-socket test only if needed for the transport seam: chunked success,
oversized/stalled response cancellation, exact headers/body, and owned server/socket teardown.
Use fake broker outputs or `startHireBroker` with an injected purchase function; no real hub, payer
key, Graph gateway, RPC, account, or chain. An integration fixture using the real broker should
assert its object response contract and two exact settled child prices, but must not imply an Arc
settlement.

## Release boundary

No Task 14 implementation should begin while root's frozen G7/G13 gates/commits are in progress.
It also should not begin as a wallet-only source change until a separately scoped Plan A compatibility
task makes the existing offline gate safe while retaining the immutable historical proof described
above. After that release, modify only the Task 14 wallet manifest/source/tests. Do not run the plan's
live purchase, read a real key, query Graph/Arc, or alter Plan A's loop-probe/lineage artifacts without
a separate owner-authorized coordination task.

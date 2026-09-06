> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F14 independent readiness review — September 6, 2026

Verdict: **buildable starting scope, with three concrete additions below before
source release.** Read-only source evidence, not executed Reds or implementation
acceptance. F14/H source remains held; only this ignored note was written.

Read the complete93-line handoff and actual Plan F Task14, core Receipt/child and
chain manifests/loader, FROOT public feed and receipt UI/tests, ordinary and F8
private result projections, relevant pipeline child construction, held H1
whitelist and H4 receipt decoder/formatter. Reviewed the existing HTTP fixture
boundaries without running them. No tests, source edits, network, keys, Git,
dependency, signer, rendering or live action occurred. All shell login:false.

## Three actionable readiness additions

1. **Receipt-level link fixes do not fix the page's aggregate provenance claim.**
   FROOT ui.ts:429–467 branches only on data.rail === test, otherwise saying every
   row is a real Arc transaction and statistics come from on-chain receipts.
   server.ts:803–843 supplies all persisted receipts but only the default rail;
   its registry also exposes Gateway when that default is EIP-3009. Thus a mixed
   EIP/Gateway session feed would retain a false page-wide mining claim even with
   every UUID unlinked. Extend the already-owned ui.ts/ui.test.ts scope to honest
   receipt-based or neutral mixed-rail copy, including the opposite test-default
   mixed-feed case. A short neutral reference-column label is sufficient; no
   redesign or new aggregate provenance system. Preserve simulation disclosure
   without claiming all historical rows share the current default rail.

2. **The no-public-job-ID guarantee needs the actual child fallback scrub.**
   pipeline.ts:224–235 sets ReceiptChild.skillId to childJobId when no matching
   receipt is available. FROOT ui.ts:174 and receipts-feed.ts:54 output that value
   even though the explicit jobId key is removed. H1 already handles precisely
   this alias at receipts-feed.ts:104. Include the narrow c.skillId === c.jobId
   -> unknown-skill guard in F14's existing public feed AND SSR child renderer;
   private authenticated receipts should retain their real identifiers. Add an
   assertion that the literal fallback handle appears nowhere in public JSON or
   HTML. No whole H1 whitelist transplant, pipeline edit or new schema is needed.

3. **Kind-qualified link authority must survive the later H projection chain.**
   H1 PublicReceiptRow/scrubReceipt currently omit settleRefKind. H4's row type and
   decodeReceipts:257–274 also omit it, and format.ts:49–61 ignores it. Merely
   making H1's explorer null plus adding the session boolean is insufficient if
   a later H consumer recomputes txLink(tx, decodedReceipt): a hash-shaped EIP
   receipt with a conflicting kind has become indistinguishable from permitted
   legacy kind-absent evidence. This is a concrete source-compatibility risk,
   not a currently exercised public exploit or a claimed runtime failure.
   Preserve a validated safe reference-kind field through H1 and H4 and require
   the same kind gate in H4's formatter/child path. Unknown or malformed present
   kind must refuse/suppress link authority, never silently become eligible
   legacy absence. Alternatively preserve an equally strict explicit link
   authority projection; choose one contract before the H merge. Keep all
   existing whitelist exclusions and H4 own-data/size/accounting checks.

## Minimal F14 implementation contract

The handoff's ten starting paths are sufficient: four hub source paths (new
receipt-reference.ts plus ui.ts/receipts-feed.ts/server.ts), three hub test paths
(new receipt-reference.test.ts plus ui.test.ts/receipts-feed.test.ts), and three
docs. Findings1–2 stay in those paths; finding3 is a recorded later H integration
delta, not permission to edit H now. Keep docs/sessions.md with F11 and defer
actual SDK/MCP/CLI names until their final frozen APIs exist.

Make the new helper independently import-safe: use the explicit local chain
config loader, not the core barrel's eagerly selected ambient chain. Accept only
the configured ready manifest with positive agreeing chainId/CAIP-2 and safe
explorer base, settled=true, rail=eip3009, nonzero full32-byte hash, kind absent
or onchain. Choose and test case policy explicitly; current legacy receipts allow
hex case while F8 session references are canonical lowercase. Do not accidentally
reject legitimate legacy uppercase hashes or relax the stricter F8 wire decoder.

For compact child rows, pass the trusted root's rail/network/kind context and
the CHILD'S settled/reference fields; never accept a child's arbitrary extra
network/rail field or infer provenance from the process environment. Root failure
does not prove a separately settled child failed. Children are the pipeline's
flat recorded descendants, not newly reconstructed direct edges. F8's admitted
session receipt deliberately has no children/tree; its seller-funded child is an
ordinary independent receipt, as session-call.bun.test.ts:199–208 records. Do not
invent session membership or carry the parent's boolean onto that child.

Derive session from trusted receipt.sessionId only: typeof string, length36 and
the exact ses_ plus32 lowercase-hex grammar. The length check makes a trailing
newline fail even with JavaScript's dollar-anchor behavior. Explicitly overwrite
any rest-projected session extra with the computed boolean; otherwise a forged
preexisting true can survive an absent/malformed ID. SSR emits only the literal
label when that predicate is true, never the ID in text/title/data attributes.
H1 later adds this computed boolean explicitly; H4 retains only an optional real
boolean via its existing own-data reader, rejecting coercions/getters. Preserve
canary independently, including both labels together and released receipts.

The two server.ts explorer replacements are the ordinary authenticated root/
child projection at1282/1297. F8's separate server-session-calls.ts:93 already
has its own strict rail/network/kind/hash gate after authoritative membership
validation. Leave that source untouched in the ten-path scope unless parent
explicitly requests uniform-helper consolidation; do not imply it was replaced.

## Focused future proof, not execution evidence

Use positive fixtures with real-shaped nonzero EIP hashes and explicit known
network. Existing receipts-feed.test.ts:79/90 instead demands links for malformed
0xchildtx/0xdeadbeef on TestRail; preserve money/tree/privacy assertions while
changing those expectations, and record actual Reds only when later run.
The matrix must include mixed default/receipt rails, Gateway UUID AND shaped
hash, TestRail, released root/settled child distinction, every conflicting kind,
unknown/pending network, zero/malformed hash, child identity alias, escaping and
canonical/malformed/forged session markers. No reference link asserts fresh mining.

Do not use lineage-http.test.ts as if it verifies returned receipts: its runner
intentionally leaves jobs queued. Existing pipeline-attest-http.test.ts does
exercise ordinary successful/failed result responses with a controlled preload;
it is a concrete candidate for the handoff's optional extra integration-test
path. If selected, parent must release that exact path first and ensure its
child runs --no-env-file with bounded owned cleanup. It currently does not prove
child explorer projection, so do not claim that coverage without an explicit
fixture/test addition. Pure root/child projection tests plus exact wiring review
are the minimal initial scope, not a substitute for later owned rendered QA.

## Inspected-source SHA-256 pins

```text
ba2caf41ef109f9ed8c3db66c06a229dd7146cc760961223bf9290a4212723e0  task-14-source-handoff.md
74059ddbbe271c48c0f86d9fa90a730c45095b33e1c68de60af270ecdc4782d6  FROOT apps/hub/src/ui.ts
33c1eec2ba00d91f5817c905f88baa6c06b198e4bc060f7c741c4065a8500ff4  FROOT apps/hub/src/receipts-feed.ts
b0a9a2d8ffee922cf2e0a695e4ce27ab4ad40159cf275bd34bba6bbed5446e22  FROOT apps/hub/src/server.ts
10b5a25bc9c3ab365e2a9db8b395d67954a7880912bd464d8f1a5f14f007103c  FROOT apps/hub/src/server-session-calls.ts
91fdc4768350f24ae1ae70f3de2eae8cb65d09fe4d2781bd96e2b154fd3a07cd  FROOT packages/core/src/receipt.ts
fc0894559b2660ed7c5cd4800e6fe421f87ee40efa98269701f381ac061caa4b  FROOT packages/core/src/chain-config.ts
6d7348c526a5964caced5ced8593d01cd5be0822499faefe9482f682eb365ffe  HROOT apps/hub/src/receipts-feed.ts
7c90180e386f7599521bea71e29ff6a979f015638c500b7e44dd09b18a20e0d9  HROOT apps/web/src/lib/hub-decode.ts
dc42a2645802908226f3b3a464c9b693322fbec99f1261dbd6b69b7f6585a8eb  HROOT apps/web/src/lib/format.ts
```

HROOT is the sibling h-web worktree. No H merge or acceptance is inferred from
reading its held files. F1 remains consumed; live F12 NOT RUN and no-new-spend
still control documentation. F14 is not yet implemented or visually verified.

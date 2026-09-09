> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H8 current listing-page readiness — September 6, 2026

Read-only preparation; **no H8 implementation release**. Fully read actual Task8
(including its tests/page/CSS), H3 private tree route/producer, H4 shapes/decoder
and bounded client, H6 catalog/decisions, current formatter and E13 Confirm/tests.
Read H9's upcoming browser job-store interface. No source/public/test, Git, network,
browser, credential or process work occurred. H7 geometry remains frozen.

## Smallest honest implementation

Retain the listing-detail page, public schemas/bounds, pay-test history, qualified
ERC-8004/ENS evidence and recent public receipt records. **Do not implement the
literal receiptsToTree converter or draw invented edges from public descendants.**
H7 remains for authorized H3 TreeViews, consumed later through the buyer's own
capability flow. This is a necessary plan-interface correction, not a new hub API.

Proposed release paths:

- NEW `apps/web/src/routes/skill.$name.tsx`: actual Start GET loader/route and page.
- NEW `apps/web/src/components/evidence.tsx`: pure Evidence and SchemaBlock;
  route may re-export those names. Keep pure SSR tests independent of router boot.
- MODIFY only `.skill-page`-scoped rules in `apps/web/src/styles.css`.
- Regenerate `apps/web/src/routeTree.gen.ts` through the installed router/build,
  not manual route declarations or a fake placeholder path.
- NEW `apps/web/test/skill-page.test.tsx`: pure rendering/DTO boundary cases.
- NEW `apps/web/test/skill-route.test.ts` and
  `apps/web/test/fixtures/skill-server.ts`: one bounded owned actual Start/H4 fixture,
  inline data, exact request accounting, teardown. No extra fixture data path needed.

No H3/H4/hub/payment/Confirm/Chat/Nav edits, new dependency, Graph read or token
store belongs to this minimum. H6 already links `/skill/<encoded-id>`; its old
reference to future H9 is historical numbering, since listing detail is H8.

## Exact data and loader contract

Use `hub.describeSkill(id): Promise<ListingDetail>` and
`hub.listingReceipts(id,20): Promise<ReadonlyArray<PublicReceiptRow>>` once each,
in parallel after any validated ENS lookup. Preserve a good detail when receipts
fail and vice versa, with independent fixed error tags and one observedAtMs.
The known H4 bounds remain: detail25s, other reads10s, body131072bytes. An ENS
lookup can precede detail, so do not claim a25s total ceiling. No poll/retry/cache
or immediate upstream-cancellation claim; H6's router signal only cancels its
server-function request, while H4 reads own their finite deadlines.

Validate an own bounded string name before `.includes`/IO: direct canonical skill
ID or valid ENS name. Include ENS resolution inside the fixed-error boundary.
Typed EnsNameExpired means observed expiry; outages remain unavailable. For an
ENS path, bind the resolved skillId/seller to the resulting detail before showing
it as that resolved listing. Never derive a payment target from these page props.
`describeSkill` deliberately collapses404/outages into HubUnreachable; without
changing H4, say “listing unavailable,” not a definite “No such listing.”

Important SSR privacy correction: H4 PayTest permits and retains canonical
`jobId`, and actual detail/payTestHistory currently return those IDs. The literal
`return {listing,receipts}` serializes them into Start hydration even if JSX does
not print them. Before server-function return, explicitly project payTested and
each history item to atMs/ok/optional reference, with `jobId:""` only if preserving
the existing H6 compatibility shape. Never correlate that empty field. Do not
serialize raw provider objects, errors, job IDs, tokens or future unknown fields.

## Concrete unsafe exemplar assumptions

1. Public `children` is a **flat recorded-descendant list**, not direct children.
   It has no parent IDs, depth, token or authorized root job ID. The converter
   invents0→every-child edges, latency0 and an empty rootJobId; it also omits
   current complete/evidenceFlags and can set root hop>0. Adding fake flags or
   normalizing hops would not make the ancestry true. Render records and flat
   descendants as such, no connectors. Empty recent history means no returned
   records, not “this skill has never hired.” H3 `/trees/:root` checks the exact
   root capability before ledger reads and marks all responses private/no-store;
   H4 sends x-job-token with no-store/no-referrer. H8 must not call it publicly,
   recover a job ID from pay-test history or ask the server to keep browser tokens.
2. Missing agentId means no identity evidence available, not proof “not registered.”
   Present agentId with agentVerified false is announced/unverified. Preserve
   evidenceStale; absent counts stay unavailable, never `??0`. Explicit validated
   zero is displayable. Registration hash remains announced metadata: fresh
   ownerOf verifies seller ownership, not the announced mint transaction.
3. Actual D listing-evidence/evidenceFor counts are bounded: matching configured
   validator/tag answered entries among the latest20 unique validation requests;
   response100 counts as pass. Feedback is configured-attester/tag/value1/decimals0,
   unrevoked agent-wide records, capped4096. State that provenance; not all finished
   jobs, not necessarily this skill's payments, not an independently checked
   receipt-proof tally. Keep “settlement evidence” as a qualified section label,
   not score/rating/gate. G's different observed registry counts/canonical-link
   policy are not D's fields; this page consumes neither listing.graph nor
   `/graph/stats` and must not substitute their counters.
4. PayTest has no network/rail. Follow H6: no explorer link even for a hash-shaped
   reference. History absence means unavailable; empty means no recorded history,
   not guaranteed canary scheduling or “has not had its turn.” Avoid duplicate
   React keys from atMs alone; use a bounded positional key when times collide.
5. Current `txLink(tx,context)` and `addrLink(address,network)` return null without
   explicit authority context. The literal one-argument calls fail; hardcoded
   Arcscan pay-test URLs invent it. ListingDetail also drops D's chain/registry
   context, so minimum H8 displays seller/announced registration refs unlinked.
   Do not fabricate EIP-3009 payment context for a registry registration tx.
   A later explicit link-context contract is separate from this minimum.
6. H4 synthesizes registrationUri as hub-relative `/listings/<id>/agent-registration.json`;
   a same-origin anchor would target the web server, which has no such route.
   Minimum: show it as a path, not a broken link. If parent requires the clickable
   document now, narrowly approve a loader-created absolute URL from validated
   hubOrigin plus this exact path (never arbitrary advertised URI), including its
   browser-reachability fixture; no token or extra request is needed. Do not claim
   that announced document contents or docHash were independently verified here.
7. ENS true is hub-reported expiry, not proof the runner stopped renewing; false
   is not independent current liveness. Unknown stays unknown. Expired/delisted
   detail may be informational, but must not imply purchase availability or use
   an expired name as a verified title. Preserve E13: Confirm's optional ensName
   comes only from the independently correlated quote; keep full payout address,
   hold-to-approve, blocked state and signed-uncertainty wording unchanged. H8 adds
   no purchase/signing shortcut; a normal `/chat` navigation needs no prefilled API.
8. JSON schemas come from H4's bounded plain-JSON projection. Render escaped text,
   never HTML or arbitrary object's toJSON. Use supplied observation time for
   history ages to avoid SSR/hydration drift. Existing `.wrap` fixes chat height
   to100dvh and H6 styles are `.market`-scoped: add a `.wrap.skill-page` content-flow
   override, shrinking grid/min-width0 and local schema overflow, not global
   `.wrap section h2`/`.dim` changes that can disturb Chat/Confirm/H7.

## Focused acceptance after release

Prewrite behavior assertions; missing-module/route failures are setup, not claimed
executed product Reds. Real H4-decoded fixtures should cover complete/unverified/
stale/absent/explicit-zero identity evidence; escaped schemas/prose; raw-private
fields and PayTest IDs absent from **both rendered HTML and serialized loader
data**; unavailable versus empty receipt/history states; flat grandchildren never
become direct edges; mixed-rail public links only from existing decoded explorer;
no pay-test/unknown-context links; duplicate timestamps; malformed/expired/changed
ENS targets and fixed error text. Assert exact one/two/three allowed GET counts,
zero trees/quote/paid calls, partial detail/receipt failures, and no secret-bearing
input fields. Preserve unchanged H4/H6/E13/H7 regressions.

Then exact nested web strict, actual client/SSR route generation/build and owned
desktop/mobile/both-scheme/keyboard validation with bounded cleanup. Parent owns
full gate/review/publication/commit. None were executed in this readiness task.

H9 remains browser-only job-token persistence; H10 may consume those capabilities
for an authenticated buyer tree. Neither requires H8 to invent ancestry or store
tokens. Finish canonical G→H integration and H7 acceptance before H8 source release.

Source pins: hub-decode7c90180e386f7599521bea71e29ff6a979f015638c500b7e44dd09b18a20e0d9;
hub506b21a5585be87fc2b4523fa9d2fb686bbef2fa1f60fa49bff0b48afc1abb99;
formatdc42a2645802908226f3b3a464c9b693322fbec99f1261dbd6b69b7f6585a8eb;
listing-evidenced30b6086a9d2594589661a413bfccf76de35a5986450816540d402e3f2f06919;
Confirm52d599d0d1208d1ae7be74298e15eb104c7204cbf7ade8e081336c0a28b4b52c.

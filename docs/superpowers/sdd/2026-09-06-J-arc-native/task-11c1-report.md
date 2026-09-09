# J11C1 — declared rail labels and catalog filter

Implements the [bounded web brief](task-11c1-brief.md) after
[J11B2](task-11b2-report.md), using the existing ARCADE design system.

## Implemented

- Browser-inert descriptor-based rail projection: one to three unique known
  declarations, cloned/frozen in Gateway/exact/escrow order. Missing, malformed,
  inherited, hidden, accessor, sparse, extra-key or foreign-prototype metadata
  stays unavailable. No default rails inferred and no malformed optional
  declaration erases the otherwise valid listing.
- Both the public hub decoder and the separate skill-page serialization
  boundary carry only this projection. Card and detail labels say Accepts
  (declared), with fixed public names rather than arbitrary seller strings.
  Detail explicitly disclaims current availability and browser escrow purchases.
- The native labeled catalog filter uses already fetched data only. All,
  Gateway, Exact, Escrow and Declaration unavailable are distinct. A live
  result count and separate no-match/empty/outage messages preserve provenance;
  recorded marketplace totals do not become filtered totals. No wallet,
  storage, payment/challenge probe, route or upstream behavior change.
- Additive token-based CSS preserves every pre-J11 byte. Controls retain44px
  targets, visible keyboard focus, wrapping and existing card grids/typography.
  No new semantic colors, dependencies, hero redesign or signing surface.

## Verification

Initial tests reproduced three genuine missing-projection/label assertions.
An older H8 CSS test incorrectly inspected every later stylesheet section;
its scope now ends at the actual next section, retaining the old prefix hash.
A new test pins all pre-J11 CSS bytes. One actual route assertion was adjusted
for React's inert HTML comment separators; no production workaround was added.
Malformed-array test tables explicitly wrap rows so Vitest does not spread
array values into multiple arguments.

Final213focusedVitest8PASS6.41s, including actual Start route integration run
sequentially. Final eleven-root strict0. The custom check initially used root
instead of web libraries, then omitted the config-file resolution context for
Node types. Using TypeScript's project-aware parser for the existing web config
resolved both harness issues; no application or compiler setting changed.
Twenty-two-path freeze:143 local links, no privacy matches, empty index.
Sole full gate94612 PASS:5,281Vitest241/69.17s;1,362Bun92/11,711assert190.66s;
root/web strict and client/SSR361ms/190ms. All stages sequential and bounded
to four workers/concurrent tests. Sixteen frozen source/test pins rechecked
before atomic commit and exact-one main fast-forward, without a full gate
replay, squash or push.

The [browser observation](../../../evidence/J/declared-rails-browser.md)
records actual native selection, keyboard operation, mobile/desktop screenshot
inspection, the shared-harness permission failure, separate in-app fallback,
catalog hard-cutoff limitation and independently checked process/port cleanup.
This does not replace H14 owner live-wallet/visual acceptance.

## Remaining

J11C2 bounded read-only escrow receipt/terminal evidence; live escrow sources,
Studio redeploy and Task10 proof remain blocked by the missing usable approved
deployment. J4/J5 live and J6 treasury/size pauses remain. No owner keys, real
RPC, spends/sends/deployments, approvals replay, payment-validity/cap/replay
changes, browser escrow signer or push.

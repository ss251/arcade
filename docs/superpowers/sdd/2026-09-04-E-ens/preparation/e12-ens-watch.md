> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E12 read-only preparation

Prepared after reading complete Plan E Task 12 and current E8 reader, hub store/server,
agent registration, and E5 setup label handling. No task source or collected tests edited.

## Agreed compatibility corrections

- Consume the hardened E8 reader, not stock viem text reads. An ancestor wildcard can
  retain records after a leaf expires. E8 checks exact registration via on-chain
  `findOwner` before reading text. Its registration/preflight cache lasts only one
  concurrent record session; subsequent sweeps recheck the chain.
- Preserve `ensName` and `ensExpired` wire fields, but describe `ensExpired` as the
  last observed missing/unresolvable name, not proof that a runner stopped renewing.
  Empty required records may also mean unregistered or misconfigured. A malformed
  record, denied CCIP origin, RPC error, timeout, or disabled root is not proven expiry.
- `handleNames` distinguishes missing required records (`ens_name_expired`, 404) from
  unavailable/unsafe resolution (`ens_resolution_unavailable`, e.g. 503), with safe
  fixed diagnostics. Preserve optional bigint price as decimal string/null.
- Setup allows `--seller-label`; Hello currently has no name/label announcement.
  Root approved explicit bounded public `ARCADE_ENS_SELLER_LABELS` JSON mapping full
  lowercase seller addresses to validated labels. Use the mapping or address-derived
  default, never guess a handle. Document the hub mapping requirement for custom labels.
- Keep existing `EnsWatch` exports, with optional seller argument on `isExpired` so
  server callers check the current listing owner. State must not carry an old seller's
  expiry onto a replacement listing with the same ID before the next sweep.
- Imports should use the buyer's exported public ENS symbols, avoiding the Vitest
  bare-package alias/subpath trap.

## Bounded sweep and lifecycle

- No RPC on import or disabled-root operation. Keep one shared reader/watch per hub.
- Safe finite interval bounds; no zero/NaN/overflow timer loops. Singleton scheduling,
  single-flight sweeps, bounded listing count/fanout and overall/read deadlines.
- `start` cleanup increments a generation and clears its timer. Late listing reads or
  resolver completions must not alter state, write metadata, log a relist, or schedule
  another sweep after stop. A second start must not create a duplicate worker.
- Prefer sequential or small bounded fanout: E8 shares a 24-RPC session budget across
  concurrent reads; unconstrained four-record lookup fanout can exhaust it.
- Prune vanished listing identities and preserve existing observations on transient
  read failure. Log only bounded public names and fixed reasons, never provider causes.
- Never await ENS resolution in the paid/settlement path. Server finalizers stop the
  watch alongside server/fiber shutdown; startup observation does not block listening.

## Metadata writeback and discovery

- An optional onResolved hook can carry the snapshot identity. Before `putListing`,
  reread the current record and compare seller, runner ID and publication identity.
  Preserve all current fields; do not spread a stale snapshot over reconnection,
  verified identity, canary evidence, or the newer seller. Prefer one synchronous
  Effect sequence for final read/check/write, not separate awaited runs.
- Validate that any resolved paid path actually identifies the expected seller/skill
  before associating the name with that listing; existence of another endpoint is
  not a verified binding to this listing.
- Chain the ENS filter after Plan C delisting. Preserve D detail evidence fields and
  existing listing serialization. Keep detail visible with observation status.
- Plan expressly leaves OpenAPI builders using store listings; root should document
  this choice or filter the server's shared discovery input consistently if desired.
  Do not silently change builder APIs or settlement authorization during this task.

## High-value TDD cases once collection is released

1. Genuine missing-module Red, then disabled root: zero reads/timers/writes.
2. Default address-derived and explicit custom label mappings; invalid/private config
   values rejected with fixed diagnostics before any reader work.
3. Missing -> live -> missing -> restored; outage/malformed read preserves prior state.
4. Old seller missing result released after same-ID replacement never expires or
   annotates the replacement; same seller reconnect metadata is not overwritten.
5. Concurrent sweeps/start calls do not multiply RPC work; stopped/stuck work cannot
   mutate or restart; oversized list and invalid intervals are bounded.
6. Resolver HTTP handler returns exact public 200 shape and distinguishable 404/503
   refusals, with no raw causes or credentials; malformed/overlong names cause no read.
7. Actual hub HTTP fixture: existing canary-delisted filtering remains, name state is
   exposed on detail, D registration gains only verified/current ens metadata, and
   slow/unavailable ENS does not stall a normal paid job or server cleanup.

E10 remains frozen. E9 local-authorized-amount patch independently reviewed clean:
remote `authorizedAmountAtomic` is removed before spreading wire fields and only the
locally signed payment amount can populate it. Root owns corresponding tests/gates.

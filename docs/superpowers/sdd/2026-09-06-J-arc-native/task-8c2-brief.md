# J8C2 — actual request-bound escrow HTTP

Continue from the [typed pipeline](task-8d4-report.md). Wire the budget/root
transport and dedicated rail selection before a separate explicit boot checkpoint.
No escrow-to-legacy payload casts, default rail/session changes, owner keys,
external RPC, spending, existing authorization/cap/replay changes or push.
Single executor, four workers, one sequential full gate, exact fast-forward.

- Keep a dedicated typed escrow registry entry. Only actual request input,
  current verified public listing/agent and opt-in may produce an escrow quote.
  Strip escrow fields for closed legacy rails. Discovery has no actual input;
  omit a signable escrow accept rather than fabricate its input commitment.
- Budget POST accepts exactly input plus the J7 capability payment envelope,
  not the original plan's unauthenticated bare job ID. Independently derive the
  paid root URL, listing/price/agent/input terms and verify budget capability
  through the guarded rail. Recheck listing after async verification. Refuse
  children/session/ambiguous headers, bound body and active/retained requests,
  throttle verified payers before signing/gas; failures never restore attempts.
- Budget response gives confirmed budget/token/escrow/hash and the last funding
  cutoff implied by the unchanged expiry minus timeout minus600 rule. No raw
  capability, provider signature, private diagnostic or claimed settlement.
- Root branches before exact decode, verifies actual funded capability and
  current terms, then atomically admits one hub job before acknowledging its
  hub-scope-owned pipeline fiber. Still-funded identical retries retain the
  original job/token. Never replay inference after admission, including failure
  to start. No request cancellation after admission may orphan the handoff.
- Stop new requests on shutdown, interrupt/await verification and budget action
  cleanup, then interrupt/await accepted job cleanup before journal closure.
  No detached escrow execution. Startup remains unarmed until pinned config,
  concrete durable action journal and signer/broker composition are implemented.

Verify real owned SQLite, dedicated challenge factory, actual owned loopback
transport, disabled server boot, malformed/getter/current listing refusals,
quota/concurrency boundaries, duplicates, cancellation/private failures and
unchanged root/child rails. Synthetic ports/proofs are explicitly not chain
verification or live evidence. Task9 buyer lifecycle follows pinned boot.

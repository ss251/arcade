# J11C2 — synthetic public escrow receipt browser observation

Read-only local QA, 2026-09-08 IST, against the owned actual Start/H4 fixture.
These are synthetic Receipt values passed through the real hub scrubReceipt
projection, not live deployment, funding, completion, refund or chain evidence.

- Native in-app browser: valid settled/refunded/uncertain rows reached the page.
  Settled displayed seller $0.114 and fee $0.006; refund displayed principal
  $0.12 without claiming recovery of gas; uncertain established no terminal
  movement and explicitly denied a zero-charge/refund inference.
- At390×844, existing address/hash wrapping and narrow record layout remained
  readable. Sixteen Tab presses reached the settled record's native disclosure;
  Return opened quoted allocation with a visible focus outline. Quote was
  explicitly separate from a transfer. No payment control or wallet opened.
- At1280×900, lower outcome records and disclosures were readable. The first
  immediate resize capture retained a stale/cropped surface; a subsequent
  screenshot showed the settled desktop layout. No CSS workaround was needed.
- A fresh tab against malformed amounts showed three evidence-unavailable
  records, no complete/refund/contract links and no inferred paid/refund claim.
- Both modes independently recorded detail1/receipts1/names0/other0. No external
  explorer links were followed, no live RPC or credentials were used, and no
  signing, spending, publish or deployment occurred.
- Both owned tabs closed, viewport override reset, fixture SIGTERM joined with
  exit0. Independent checks verified the exact owned PID gone and both loopback
  ports refused connections. URLs served only during this run and stopped after
  cleanup. Inline screenshots were inspected; no PNG files were exported.

This is offline UI evidence only. H14 owner live-wallet/visual acceptance and
J4/J5/J6/Task10 live work remain separate and unconsumed.

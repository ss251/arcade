> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F11 CLI/session parent review — September 6, 2026

Scope: the six frozen CLI/session source, test and documentation paths only.
This does not accept the still-active funding runtime or a complete F11 gate.

The parent read the entire author report (including its unchanged chronology
and correction appendix), the final funding CLI, session CLI, withdrawal script,
sessions documentation, all 26 collected tests and the complete legacy-entry
diff. Source hashes below are the author's final frozen inventory; exact
integration typing and full repository gates remain pending runtime freeze.

Parent focused rerun at approximately 05:00 IST:

```sh
bun --no-env-file test packages/buyer/test/gateway-funding-cli.bun.test.ts
```

Result: 26 pass, zero fail, 122 assertions, 3.16 seconds, exit 0. The actual
owned subprocess tests cover inert import, reserved command refusal, keyless
help/read-only seams, fixed diagnostics and process fuse ownership. Synthetic
Promise handles and injected funding facades are explicitly not a live hub,
actual chain validator, payment or funding proof. No operational keys, external
requests, signatures, spending, Git mutation or full repository suite ran here.

Earlier parent findings retained as genuine Reds in the author's report/tests:
pre-key contradictory-network refusal, exact per-call price and order binding,
journal extension/control-character rejection before runtime selection, and
own-data argv capture before exported routing/spread. The parent's JavaScript
newline-regex hypothesis was disproved and withdrawn, not counted as a Red.

The final entry snapshot rejects accessors without reading them, retains the
session input allowance and leaves the existing ordinary payment body private
and otherwise unchanged. Funding commands remain closed, explicit and without
movement defaults. The seller script selects the seller environment role only.
The session adapter keeps funding separate, captures its input before the key
await, opens once, stops on uncertainty and only closes after successful calls.
Its explicit retained-handle recovery uses status, not a second close request.

Documentation correctly distinguishes accounting from escrow, Gateway transfer
UUID from a mined batch, deposit confirmation from correlated credit, destination
delivery from source debit and a technical identity refusal from lack of owner
approval. It explains the OS-account claim namespace, canonical private journal
parent, no automatic claim retirement and the signed-complete/lost-ACK proof
exception without claiming arbitrary storage-fault recovery. Current production
deposit credit attribution and withdrawal identity limits remain explicit.

No further blocking issue found in this six-path scope. Acceptance is conditional
on unchanged hashes and passing final integration/full gates.

```text
08674cc7e82c5c20b6c97f1c35182c9250bf4cfcd4067c84d927cf792cb4cb73  packages/buyer/src/gateway-funding-cli.ts
368027a24eb2620ec242468cb600dcc9e26979d95f4088d21b2308c881f74ded  packages/buyer/src/session-cli.ts
2e81599b91e5c265e0a817ec003cf8c45f48a89f2a2ac42e748d52ef3cc83a90  packages/buyer/src/cli.ts
be7ad3362c29dd79a78f0f3539dc0d855320d285421db83d55ff8594784551e0  scripts/gateway-withdraw.ts
2edc65612c224258b7df982bab801db61d057d96120fd24e2932b7eb2cfffece  docs/sessions.md
49647dbeef96ce66b8f0699450a105bca9984d24d9c526188f103809868b4a5c  packages/buyer/test/gateway-funding-cli.bun.test.ts
```

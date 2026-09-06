# G historical archive completeness checkpoint

September 6, 2026. Seven previously uncopied readiness, decision and local
checkpoint records are archived here. This is an archive-gap closure, not a claim
that all Plan G tasks, live gates or integrations are complete.

Every copy begins with the existing G6 historical banner and then preserves its
original body bytes, including EOF. Six copies have zero substitutions; G15 has
exactly four approved literal privacy replacements. Original records were not
modified. No test, build, deployment, query, payment or approval was performed by
this copying operation.

The September 5 local progress record intentionally retains its original order,
old commit identifiers, pending gates and later checkpoints. Readiness proposals,
release language, source hashes and commands describe their recorded moment,
not current execution authority. In particular, the filename containing
`current` does not make its archived G8/G9 note a new release, and the G15 note
does not authorize Base or Arc spending. Use the [current runbook](../../../runbook.md)
for current behavior, approvals and operator commands.

## Exact byte inventory

SHA256 values cover complete original files and complete bannered public files.
The common 388-byte UTF-8 banner has SHA256
`7334bc6a6acf1ee1bf5d39001f6a7552f815a0b2c1778d114fe8ec9d2a4a31a6`.

| Public artifact | Original SHA256 | Public SHA256 | Literal replacements |
| --- | --- | --- | ---: |
| [task-2-readiness.md](task-2-readiness.md) | `56672936aaa5c16c8bc95132ce65ddbcc6ad221416c0316e2833d8cad6eea714` | `edfe9b454aac9d3533fe45306dc71b3e6096b847a950b4ec78701ee20f19d2c6` | 0 |
| [task-2-parent-decisions.md](task-2-parent-decisions.md) | `e19b04f79bd00c096213f59d5f394a1f22d731e81068baa82a93a54437e1d810` | `e75bb24ad06212a77bd54b525ba324971db9a0df091072e2dcbfb01e33ef5f89` | 0 |
| [task-14-readiness.md](task-14-readiness.md) | `c710d676146bf36aaafdcaf9ac151db1ead08c7b10064f3c3d78462eb991c3ad` | `a39a05718bd8e50450886732081f89a45063110fed8a6c221aec5550b45b83d0` | 0 |
| [task-8-integration-readiness-current.md](task-8-integration-readiness-current.md) | `119656fe29173b3436bb5c54bbe882a5aa2a2b34a6e27bff8b3e59b0a9f1c08e` | `305ccee270e0cae6c0bfc5ff1aefe8ccb75ce15b4d6e7c98225d7e010a4567d2` | 0 |
| [task-15-readiness.md](task-15-readiness.md) | `961f064115f6d28a262a7d7ddf794b9b5419ee3ddfb96f821817193b6c926abc` | `e1c44f2faab752d3040eed4da22381d42c89de8637cdeb9e8631f35f83c1a702` | 4 |
| [task-6-root-checkpoint.md](task-6-root-checkpoint.md) | `1b7f889e1f40b5dfb7e8ae22a9935ae13074cdf06a5b004b7a5079520ef1cd0a` | `0136581ef4ea8607ba580a74a763e8286f7dc5c0ce571b91d8e6438ea4afd7ec` | 0 |
| [local-progress-2026-09-05.md](local-progress-2026-09-05.md) | `312dbffc65ac4034082a7665f19ecba99a0eeb3329620a61c06c33445ad4d48d` | `ebcbb211bcc45b3be9c9b2270d4b29f3f87be247043b03c4185c885d22cc3525` | 0 |

## G15 scrub manifest

Each replacement occurred exactly once, only in task-15-readiness.md. Exact
private source locators and identity selectors are deliberately not restated here;
the original and public file hashes above pin the approved transformation.

| Original category | Exact replacement text | Occurrences |
| --- | --- | ---: |
| Private authorization document locator | `[retained private authorization reference]` | 1 |
| Expected payer address | `[EXPECTED_BASE_PAYER]` | 1 |
| Keychain service selector | `[APPROVED_PAYER_KEYCHAIN_SERVICE]` | 1 |
| Keychain account selector | `[APPROVED_PAYER_KEYCHAIN_ACCOUNT]` | 1 |

All remaining body bytes are unchanged. These copies add historical coverage
only; existing README/progress records are outside this archive-copy change.

## Later parent gate

The sole archive-commit full test/typecheck invocation exited0:2941 Vitest/131
files,829 Bun/51 files/5770 expect calls, root/web strict0. Independent initial
publication review was CLEAN:7 exact copies,4 substitutions,83 local links
across the eight new files and two parent index appends. No source change,
unchanged full-gate repeat, live query, payment or deployment belongs to this
archive operation. Final small gate-note audit and atomic commit follow.

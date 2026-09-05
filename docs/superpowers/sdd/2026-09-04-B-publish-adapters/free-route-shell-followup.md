> Sanitized execution/review checkpoint, September 5, 2026. This is local fixture evidence, not live provider or payment evidence. Original private source retained unchanged; later dated records can supersede pending statements.

# B13 shell dotenv boundary follow-up

2026-09-05; local fixture evidence only, not live GLM evidence.

## Requirement and implementation

The user-approved free-route run must use only its explicitly supplied API key and
base URL. Clearing the launch environment is insufficient if a Bun child reloads
repository `.env` files. All four shell call sites now use `bun --no-env-file run`.
The three preview call sites invoke `packages/runner/src/cli.ts` directly: the
`arcade` package script itself launches another Bun process without the flag.
The ordinary package script remains unchanged.

## Genuine Red and Green

- 13:17:46 IST: two actual-shell/fake-Bun tests failed because observed command
  arguments omitted `--no-env-file`. They continue to verify exact argument
  forwarding and pipeline failure exit 23; the fake only removes the observed
  leading flag before its pre-existing simulated failure match.
- 13:19:44 IST: all 31 evidence tests passed after adding the flag to shell calls.
  This checkpoint did not demonstrate transitive package-script isolation.
- Independent review and root inspection both found the nested Bun gap.
- 13:29:50 IST: a new real-Bun fixture copied the actual shell into an owned
  temporary repository, retained the real `arcade` package-script value, and
  installed inert local entry points plus dummy dotenv sentinels. The real shell
  exited 71 because its nested package-script Bun reloaded dotenv. No network,
  real provider credential, or real repository dotenv was accessed by the fixture.
- 13:30:16 IST: all 32 evidence tests passed after preview calls switched to the
  direct CLI source. The new fixture verified six clean invocations. `bash -n`
  and `git diff --check` also passed.

## Scope and pending checks

Independent final shell review was CLEAN at 13:33:59 IST: the reviewer reran all
32 evidence tests and `bash -n` successfully, without changing either file.

Only `scripts/e2e-publish-adapters.sh` and
`packages/runner/test/publish-adapters-evidence.test.ts` changed in this slice.
The fixtures are not an OS sandbox, a live provider proof, an output-schema gate,
or a payment proof. Whole-repository gates and the
authorized live three-adapter run remain pending.

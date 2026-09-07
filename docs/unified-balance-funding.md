# Owner-delegated Unified Balance funding

Code/offline integration is implemented; the approved J5 live proof is **not
run**. This is normal Gateway funding, not a change to batched x402 payment
validity. J4 Circle services-pay remains paused.

The pinned Unified Balance Kit1.6.0 and Viem adapter1.17.1 move an explicit
amount from an owner's Gateway custody to its distinct delegate on Arc testnet.
Sources are exactly Arc_Testnet or Base_Sepolia. No mainnet, automatic deposit,
grant, forwarder, auto-allocation, withdraw-all, custom fee or retry is enabled.
See Circle's [delegate quickstart](https://docs.arc.io/app-kit/quickstarts/unified-balance-delegate-deposit-and-spend).

## Commands

Both `arcade fund` and `arcade-buy fund` accept the same strict command:

```sh
bun --no-env-file packages/runner/src/cli.ts fund --help
bun --no-env-file packages/runner/src/cli.ts fund --from-unified-balance \
  --owner "$OWNER_ADDRESS" --delegate "$DELEGATE_ADDRESS" \
  --source Arc_Testnet --amount 0.25 --dry-run
```

The addresses above are public input, not keys. Dry-run never reads a key or
observes a network. Omit delegate and the preview explicitly says unresolved.
Without dry-run, an explicit delegate keeps readiness reads keyless; otherwise
the consuming process derives its address from ARCADE_BUYER_KEY.

Status none/pending prints the exact owner-signed `cast send ... addDelegate`
command with interactive key entry and exits2. Pending means **wait for the
existing grant**, not repeat it. The SDK's logical isDelegate action maps to
the on-chain `isAuthorizedForBalance(token,depositor,addr)` getter. Readiness
checks that getter at latest and at Gateway's processed height.

An owner grant permits future source spending; it is not a per-call cap and
does not expire merely because this command stops. This CLI never grants,
deposits or revokes for the owner. These remain separate explicitly authorized
actions. A grant alone does not ensure sufficient available Gateway balance.

Ready spends additionally require a fresh absolute `--journal ...jsonl` in an
existing owned0700 directory and an explicit finite
`--max-burn-block-delta INTEGER`. Choose the bound from current source-chain
withdrawal delay/estimate; no value is silently extended or rewritten to fit.
Default `--fee-cap` is0.05USDC; default `--gas-cap-wei` is100000000000000000,
or0.10nativeUSDC on Arc. They are funding ceilings, not expected charges.
The delegate must already hold the destination gas ceiling before owner signing.
Its key is read only inside the consuming process; never pass it as a CLI flag.

## Safety and evidence boundaries

The owned command uses anonymous pinned URLs, bounded JSON/body/deadlines,
redirect refusal and one transfer POST. Provider retries are set to one attempt;
the network boundary independently refuses repeat dispatch. SDK analytics/error
reporting are disabled and raw events/errors/signatures are never printed.
Do not run the process-local SDK fetch scope inside a shared application server.

Final burn terms bind owner, source, delegate, recipient, contracts/token,
amount, finite block height and fee ceiling. The mint must commit that exact
spec and respect the destination gas ceiling. A prepared transaction hash is
fsynced before one broadcast; raw signed transactions are not persisted. Receipt
polling makes one request per tick, never a viem replacement/block-search loop.

The new runtime pins official SDK coordinates, checks chain/domain/paused/token/
delegation state and observes stable contract code during its run. This is
**not** a compiled deployment-bytecode review or an independent receipt-effects
proof. It does not replace or relax F11's separate deployment identity checks.
J5C must independently inspect current deployment state and source/destination
accounting before claiming live proof; historical F11 Minter identity concerns
are not declared resolved by using a new SDK.

SDK success prints sdk_returned and independentlyConfirmed:false. Failure after
signing/dispatch is uncertain. Keep the private hash-chained journal and reconcile
its prepared hash/readbacks; never retry by deleting it or choosing a new file.
The journal is file-level evidence, not an account-wide lock. The separate live
proof supervisor must enforce the owner's one-shot action budget.

Exit0 means help/dry-run or an SDK return, **not** independent settlement.
Exit2 means input/refusal or owner delegation needed; exit1 means unavailable or
uncertain. The owning CLI hard fuse exits124 on a stalled operation/cleanup.

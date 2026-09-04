import { explorerTxUrl, formatPrice, type Receipt } from "@arcade/core"

/**
 * Shapes a `Receipt` for the PUBLIC `/receipts` feed.
 *
 * A pure function rather than inline in the route handler so it can be unit-tested without
 * importing `server.ts` — that module boots a real `Bun.serve` and runs `preflight()` (which
 * can `process.exit`) as a side effect of being imported, so pulling it into a test means
 * spawning a subprocess (see `lineage-http.test.ts`). This has none of that.
 *
 * The feed is evidence that settlement happens, not a directory of who bought what, and not
 * an oracle for a stranger's call tree. Nothing that IS a job id leaves this function, at
 * any depth:
 *  - `jobId` (top level AND on every child) — the identifier `/jobs/:id` and
 *    `/jobs/:id/result` are keyed on.
 *  - `rootJobId` / `parentJobId` — for a ROOT receipt `rootJobId` is literally the same
 *    string as its own (already-redacted) `jobId`; leaving it in would undo the redaction
 *    for every root. `hop` and `ancestors` (a list of SKILL ids, not job ids) stay, because
 *    they describe shape without naming a call.
 *  - `buyer` — a wallet address plus a skill id is a purchase history.
 *  - `authorizationNonce` — the EIP-3009 nonce backing the settlement, scoped to whoever
 *    holds the job token, not the public.
 */
export const publicReceipt = (r: Receipt) => {
  const {
    jobId: _jobId,
    buyer: _buyer,
    authorizationNonce: _authorizationNonce,
    rootJobId: _rootJobId,
    parentJobId: _parentJobId,
    children,
    ...rest
  } = r
  return {
    ...rest,
    priceAtomic: r.priceAtomic.toString(),
    sellerAtomic: r.sellerAtomic.toString(),
    feeAtomic: r.feeAtomic.toString(),
    price: formatPrice(r.priceAtomic),
    sellerShare: formatPrice(r.sellerAtomic),
    fee: formatPrice(r.feeAtomic),
    explorer: r.settleTx === undefined ? null : explorerTxUrl(r.settleTx),
    ...(r.treeCeilingAtomic === undefined ? {} : { treeCeilingAtomic: r.treeCeilingAtomic.toString() }),
    ...(r.treeCommittedAtomic === undefined ? {} : { treeCommittedAtomic: r.treeCommittedAtomic.toString() }),
    ...(children === undefined
      ? {}
      : {
          // No `jobId` here either — a public reader gets the shape of the tree (which
          // skill, how much, whether it settled) and nothing that identifies the call.
          children: children.map((c) => ({
            skillId: c.skillId,
            priceAtomic: c.priceAtomic.toString(),
            settled: c.settled,
            ...(c.settleTx === undefined ? {} : { settleTx: c.settleTx }),
            explorer: c.settleTx === undefined ? null : explorerTxUrl(c.settleTx)
          }))
        })
  }
}

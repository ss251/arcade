> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

### Task 8: Runner and buyer forward the capability

**Merge notes.** `packages/buyer/src/fetch-with-payment.ts` is edited by **A** (`PayFetchOptions.lineage`, this task), **E** (`PayFetchOptions.beforeSign`, its Task 9) and **F** (session header, its Task 9); `packages/buyer/src/index.ts` by A, E and F; `packages/runner/src/hire-broker.ts` by A (`PurchaseArgs.lineage`) and E (`PurchaseArgs.name`); `packages/runner/src/daemon.ts` by A, D (`Hello.agents`) and E (the ENS liveness ticker). Land A → D → E → F. Each adds an optional field to the same options object and one line at a different point in the request path, so the rebases are additive — but note the ordering *inside* `fetchWithPayment`: A's `lineage` header is set on both the probe and the retry, E's `beforeSign` refusal runs immediately above `signAuthorization`, and F's session header is set beside A's. E's refusal is last because it is the final gate before a signature exists.

**Files:**
- Modify: `packages/runner/src/daemon.ts:217-226`, `packages/runner/src/hire-broker.ts` (`HireBroker.openJob`, `PurchaseArgs`, `defaultPurchase`), `packages/buyer/src/fetch-with-payment.ts`, `packages/buyer/src/index.ts`
- Test: `packages/runner/test/hire-broker.test.ts` (new cases), `packages/buyer/test/fetch-with-payment.test.ts` (new case)

**Interfaces:**
- Produces: `HireBroker.openJob(jobId, budgetUsd, hireCapability?: string)`; `PurchaseArgs.lineage?: string`; `PayFetchOptions.lineage?: string` → header `x-arcade-hire-capability` on probe and paid retry; `CallSkillArgs.lineage?: string`.

- [ ] **Step 1: Write the failing broker test**

Add to `packages/runner/test/hire-broker.test.ts`:

Historical excerpt (not current operator instructions):
```ts
  it("forwards the hub capability to the purchase", async () => {
    let seen: string | undefined
    const purchase: PurchaseFn = async (args) => { seen = args.lineage; return { jobId: "job_sub", settled: true, result: {}, fenced: "", paidAtomic: 0n } }
    const b = start(purchase)
    const token = b.openJob("job_p", 1, "cap.abc")
    const res = await call("/hire", { "x-job-id": "job_p", "x-job-token": token }, { skillId: "child", input: {} })
    expect(res.status).toBe(200)
    expect(seen).toBe("cap.abc")
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run packages/runner/test/hire-broker.test.ts`
Expected: FAIL — `openJob` takes two args / `lineage` undefined.

- [ ] **Step 3: Implement**

`hire-broker.ts`: `Ledger` gains `hireCapability?: string`; `openJob: (jobId, budgetUsd, hireCapability?) => string` stores it; `PurchaseArgs` gains `readonly lineage?: string`; the `/hire` handler passes `...(ledger.hireCapability === undefined ? {} : { lineage: ledger.hireCapability })` into `purchase(...)`; `defaultPurchase` forwards `lineage` into `callSkill`.

`daemon.ts`: `token: broker!.openJob(msg.jobId, skill.manifest.bounds.maxSubSpendUsd, msg.hireCapability)`.

`packages/buyer/src/fetch-with-payment.ts`: `PayFetchOptions` gains `readonly lineage?: string`; when set, `headers.set(HIRE_CAPABILITY_HEADER, options.lineage)` on the probe headers (before the probe) and on `retryHeaders`. `packages/buyer/src/index.ts`: `CallSkillArgs.lineage?: string` passed through.

- [ ] **Step 4: Write and run the buyer test**

Add to `packages/buyer/test/fetch-with-payment.test.ts` a case using the existing stubbed `fetch` that asserts both requests carry `x-arcade-hire-capability: cap.abc` when `lineage: "cap.abc"` is passed, and neither carries it when it is not.

Run: `bunx vitest run packages/runner packages/buyer && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

Historical command (not current operator instructions):
```text
git add packages/runner/src packages/buyer/src packages/runner/test/hire-broker.test.ts packages/buyer/test/fetch-with-payment.test.ts
git commit -m "feat(runner,buyer): forward the hub hire capability on child purchases"
```

---

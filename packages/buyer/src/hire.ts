import { Effect } from "effect"
import { privateKeyToAccount } from "viem/accounts"
import { fenceResult, formatUsdc, parsePrice } from "@arcade/core"
import { callSkill } from "./index.ts"

/**
 * `hire` — one skill buying from another, mid-run.
 *
 * This is what makes the marketplace an economy rather than a listing site. An API never
 * buys another API, so supply and demand there are separate populations that must both be
 * recruited. An agent hires other agents: every seller is also a buyer the moment its work
 * needs something it cannot produce, and each hop settles on its own.
 *
 * Runs inside the sandbox, so it deliberately depends on nothing but environment variables
 * the RUNNER granted:
 *
 *   ARCADE_HUB               where to buy
 *   ARCADE_SUBBUY_KEY        the seller's sub-purchase wallet — NOT their payout key
 *   ARCADE_SUB_BUDGET_USD    ceiling for this whole job, from `bounds.maxSubSpendUsd`
 *
 * None of them are grantable through `secrets`: `ARCADE_` is a reserved prefix, so a
 * manifest cannot ask for them. They appear only when the manifest declares the
 * `hire-skills` capability, which means the ability to spend is visible in
 * `arcade publish` alongside everything else a skill can reach.
 *
 * **The wallet is the real bound.** The budget below is enforced honestly for code that
 * goes through this function, and a seller's own skill could always bypass it and use the
 * key directly — the sandbox protects sellers from the platform, not sellers from
 * themselves. What genuinely caps the loss is that `ARCADE_SUBBUY_KEY` is a separate
 * wallet holding what the seller is willing to have their skills spend. The runner refuses
 * to start if it is the same key as the payout address, because that one also proves
 * listing ownership.
 */

export interface HireOptions {
  /** Narrow the per-call ceiling for this purchase. Cannot widen the job's budget. */
  readonly maxAmountUsd?: number
  readonly hubUrl?: string
}

export interface Hired {
  readonly skillId: string
  readonly jobId: string
  readonly settled: boolean
  /** Parsed output, for code. */
  readonly result: unknown
  /**
   * The same output, fenced.
   *
   * A hired skill's result is a stranger's text arriving in YOUR agent's context — the
   * identical problem the buyer has one level up, and easier to forget here because the
   * caller chose the seller. Put this in a prompt; use `result` in code.
   */
  readonly fenced: string
  readonly costUsd: number
}

export class HireRefused extends Error {
  readonly _tag = "HireRefused"
}

let spentAtomic = 0n

/** What this job has spent hiring, in USD. Read by the harness into the cost report. */
export const subSpendUsd = (): number => Number(spentAtomic) / 1e6
export const __resetSubSpend = (): void => {
  spentAtomic = 0n
}

const budgetAtomic = (): bigint => {
  const raw = process.env["ARCADE_SUB_BUDGET_USD"]
  // Absent means zero, never unlimited. A seller who forgets `maxSubSpendUsd` gets a skill
  // that cannot spend, which is the safe way round to be wrong.
  //
  // "0" is the runner's literal default in exactly that case, and `parsePrice` rejects it —
  // its floor is $0.000001, since a *price* of zero is meaningless. A budget of zero is
  // perfectly meaningful, so it is handled here rather than letting a valid configuration
  // surface as "Invalid price".
  if (raw === undefined || raw === "") return 0n
  const numeric = Number(raw.replace("$", ""))
  if (!Number.isFinite(numeric) || numeric <= 0) return 0n
  return parsePrice(raw)
}

export const hire = async (
  skillId: string,
  input: unknown,
  options: HireOptions = {}
): Promise<Hired> => {
  const hubUrl = options.hubUrl ?? process.env["ARCADE_HUB"]
  const key = process.env["ARCADE_SUBBUY_KEY"]

  if (hubUrl === undefined || key === undefined || key === "") {
    throw new HireRefused(
      "this skill cannot hire other skills. Add \"hire-skills\" to engine.capabilities in " +
        "arcade.json and set bounds.maxSubSpendUsd, then make sure the runner has " +
        "ARCADE_SUBBUY_KEY set to a funded sub-purchase wallet."
    )
  }

  const budget = budgetAtomic()
  const remaining = budget > spentAtomic ? budget - spentAtomic : 0n
  if (remaining === 0n) {
    throw new HireRefused(
      `sub-spend budget exhausted for this job (${formatUsdc(budget)} total, ` +
        `${formatUsdc(spentAtomic)} spent). Nothing was signed. Raise bounds.maxSubSpendUsd ` +
        "if this skill genuinely needs to subcontract more than that per call."
    )
  }

  const requested =
    options.maxAmountUsd === undefined ? remaining : parsePrice(String(options.maxAmountUsd))
  // Only ever narrows: a value chosen inside the skill cannot widen the job's budget.
  const cap = requested < remaining ? requested : remaining

  const seller = await (async () => {
    const res = await fetch(`${hubUrl}/listings/${skillId}`)
    if (!res.ok) {
      throw new HireRefused(`cannot hire "${skillId}": hub returned ${res.status}`)
    }
    return ((await res.json()) as { seller: string }).seller
  })()

  const out = await Effect.runPromise(
    callSkill({
      hubUrl,
      seller,
      skillId,
      input,
      account: privateKeyToAccount(key as `0x${string}`),
      maxAmountAtomic: cap
    })
  )

  const receipt = out.receipt as Record<string, unknown>
  const settled = receipt["settled"] === true
  const paidAtomic = settled ? parsePrice(String(receipt["price"] ?? "$0")) : 0n

  // Only settled work is charged: an unsettled sub-purchase cost the seller nothing, and
  // counting it would shrink the budget for work that never happened.
  spentAtomic += paidAtomic

  return {
    skillId,
    jobId: out.jobId,
    settled,
    result: out.result,
    fenced: fenceResult(out.result, seller),
    costUsd: Number(paidAtomic) / 1e6
  }
}

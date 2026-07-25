import { Effect, Schedule } from "effect"
import type { Account } from "viem"
import { RpcFailure } from "@arcade/core"

export * from "./fetch-with-payment.ts"
import { fetchWithPayment } from "./fetch-with-payment.ts"

/**
 * `callSkill` — the one function a buyer agent needs.
 *
 * Handles the whole shape: probe, 402, offline signature, retry, then poll the async job
 * until a receipt exists. Skills legitimately take 2s–7min, so polling is the contract,
 * not a workaround.
 */

export interface CallSkillArgs {
  readonly hubUrl: string
  readonly seller: string
  readonly skillId: string
  readonly input: unknown
  readonly account: Account
  readonly maxAmountAtomic?: bigint
  readonly pollIntervalMs?: number
  readonly maxWaitMs?: number
}

export interface SkillResult {
  readonly jobId: string
  readonly status: string
  readonly result: unknown
  readonly receipt: Record<string, unknown>
}

export const callSkill = (args: CallSkillArgs) =>
  Effect.gen(function* () {
    const url = `${args.hubUrl}/x/${args.seller}/${args.skillId}`

    const paid = yield* fetchWithPayment(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args.input)
      },
      {
        account: args.account,
        ...(args.maxAmountAtomic === undefined ? {} : { maxAmountAtomic: args.maxAmountAtomic })
      }
    )

    if (!paid.response.ok && paid.response.status !== 202) {
      const text = yield* Effect.promise(() => paid.response.text())
      return yield* new RpcFailure({
        method: "callSkill",
        reason: `hub returned ${paid.response.status}: ${text.slice(0, 300)}`
      })
    }

    const accepted = (yield* Effect.promise(() => paid.response.json())) as {
      job_id: string
      poll_url: string
    }

    const pollInterval = args.pollIntervalMs ?? 1000
    const maxWait = args.maxWaitMs ?? 15 * 60_000
    const attempts = Math.ceil(maxWait / pollInterval)

    const poll = Effect.gen(function* () {
      const res = yield* Effect.tryPromise({
        try: () => fetch(accepted.poll_url),
        catch: (e) => new RpcFailure({ method: "poll", reason: String((e as Error)?.message ?? e) })
      })
      const body = (yield* Effect.promise(() => res.json())) as SkillResult & { status: string }
      if (res.status === 202 || body.status === "pending") {
        return yield* new RpcFailure({ method: "poll", reason: "pending" })
      }
      return body
    })

    return yield* poll.pipe(
      Effect.retry({
        schedule: Schedule.spaced(`${pollInterval} millis`).pipe(Schedule.compose(Schedule.recurs(attempts))),
        while: (e) => e.reason === "pending"
      })
    )
  })

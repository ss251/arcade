import { request } from "node:http"

/**
 * `hire` — one skill buying from another, mid-run.
 *
 * This is what makes the marketplace an economy rather than a listing site. An API never
 * buys another API, so supply and demand there are separate populations that must both be
 * recruited. An agent hires other agents: every seller is also a buyer the moment its work
 * needs something it cannot produce, and each hop settles on its own.
 *
 * **There is no key in this module, and none in the sandbox.** An earlier version handed
 * `ARCADE_SUBBUY_KEY` to the skill and enforced the budget here, which made the budget
 * advisory — the code holding the key was the code being bounded, so an injection that
 * reached the agent could spend past the ceiling and the only real cap was the wallet
 * balance. Now the runner keeps the key and this asks it to buy, over a Unix socket, with
 * a per-job token. The ledger lives in the runner. An injected agent can spend exactly
 * `maxSubSpendUsd` and not a cent more, because it never holds the means to.
 *
 * Three variables, all granted by the RUNNER and none reachable through `secrets` — the
 * `ARCADE_` prefix is reserved, so a manifest cannot ask for them:
 *
 *   ARCADE_HIRE_SOCKET   the runner's broker socket
 *   ARCADE_JOB_ID        which job is asking
 *   ARCADE_JOB_TOKEN     HMAC over the job id; useless for any other job, and revoked
 *                        when the job ends
 *
 * They appear only when the manifest declares `hire-skills`, so the ability to spend shows
 * up in `arcade publish` beside everything else a skill can reach.
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

export const hire = async (
  skillId: string,
  input: unknown,
  options: HireOptions = {}
): Promise<Hired> => {
  const socketPath = process.env["ARCADE_HIRE_SOCKET"]
  const jobId = process.env["ARCADE_JOB_ID"]
  const jobToken = process.env["ARCADE_JOB_TOKEN"]

  if (socketPath === undefined || jobId === undefined || jobToken === undefined) {
    throw new HireRefused(
      'this skill cannot hire other skills. Add "hire-skills" to engine.capabilities in ' +
        "arcade.json and set bounds.maxSubSpendUsd, then make sure the runner has " +
        "ARCADE_SUBBUY_KEY set to a funded sub-purchase wallet (kept by the runner — it is " +
        "never placed in this sandbox)."
    )
  }

  // `node:http` over the socket rather than `fetch`'s Bun-only `unix` option, so this is
  // the same code path under Bun and Node and can be tested against a real broker.
  const { status, text } = await new Promise<{ status: number; text: string }>(
    (resolve, reject) => {
      const payload = JSON.stringify({
        skillId,
        input,
        ...(options.maxAmountUsd === undefined ? {} : { maxAmountUsd: options.maxAmountUsd })
      })
      const req = request(
        {
          socketPath,
          path: "/hire",
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
            "x-job-id": jobId,
            "x-job-token": jobToken
          }
        },
        (res) => {
          let acc = ""
          res.on("data", (c) => (acc += String(c)))
          res.on("end", () => resolve({ status: res.statusCode ?? 500, text: acc }))
        }
      )
      req.on("error", reject)
      req.end(payload)
    }
  )

  const body = ((): Record<string, unknown> => {
    try {
      return JSON.parse(text)
    } catch {
      return {}
    }
  })()

  if (status < 200 || status >= 300) {
    // The broker's refusals are already phrased for whoever has to act on them; passing
    // them through unchanged beats restating them one layer up with less information.
    throw new HireRefused(String(body["error"] ?? `hire failed with ${status}`))
  }

  // The broker's ledger is the one that binds. This accumulator only feeds the harness's
  // cost report, so it follows the broker rather than deciding anything.
  spentAtomic += BigInt(Math.round(Number(body["costUsd"] ?? 0) * 1e6))

  return {
    skillId,
    jobId: String(body["jobId"] ?? ""),
    settled: body["settled"] === true,
    result: body["result"],
    fenced: String(body["fenced"] ?? ""),
    costUsd: Number(body["costUsd"] ?? 0)
  }
}

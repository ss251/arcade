import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { createServer } from "node:http"
import { unlinkSync } from "node:fs"
import { privateKeyToAccount } from "viem/accounts"
import { normalize } from "viem/ens"
import { formatUsdc, parsePrice } from "@arcade/core"
import { looksLikeEnsName } from "@arcade/buyer"

/**
 * The hire broker — why the sub-purchase key never enters the sandbox.
 *
 * The first version of `hire-skills` handed `ARCADE_SUBBUY_KEY` to the skill and enforced
 * `maxSubSpendUsd` inside the sandbox. That made the budget advisory: the code holding the
 * key is the code being bounded, so a prompt injection that reached the agent could ask it
 * to spend past the ceiling, and the only real cap was how much sat in the wallet.
 *
 * Now the runner keeps the key and the sandbox gets a **per-job token** over a Unix domain
 * socket. The ledger lives in this process. An injected agent can spend exactly
 * `maxSubSpendUsd` and not one cent more, because it never holds the means to — the bound
 * is enforced by a process it does not control.
 *
 * A Unix socket rather than a localhost port: no port to collide or be scanned, and reach
 * is governed by filesystem permissions instead of by anything listening on 127.0.0.1.
 *
 * The token is `HMAC(secret, jobId)` with a secret generated at runner start, mirroring the
 * hub's job tokens: nothing to store, nothing to expire, and a token from one job is
 * useless for another. It is compared in constant time.
 *
 * What this does NOT defend against, deliberately: a seller whose own skill goes looking
 * for the socket. That is their machine and their wallet — a seller "stealing" from
 * themselves is not a threat, and conflating it with the injection case is what made the
 * earlier residual read worse than it was.
 */

export interface HireBrokerOptions {
  readonly hubUrl: string
  readonly subBuyKey: string
  readonly socketPath: string
  /** Injected so tests do not need a chain. Defaults to the real buyer SDK. */
  readonly purchase?: PurchaseFn
}

export interface PurchaseArgs {
  readonly hubUrl: string
  readonly seller: string
  readonly skillId: string
  /** When set, skillId is the canonical name and seller is an unused placeholder. */
  readonly name?: string
  readonly input: unknown
  readonly privateKey: string
  readonly maxAmountAtomic: bigint
  readonly lineage?: string
}

export interface PurchaseResult {
  readonly jobId: string
  readonly settled: boolean
  readonly result: unknown
  readonly fenced: string
  readonly paidAtomic: bigint
}

export type PurchaseFn = (args: PurchaseArgs) => Promise<PurchaseResult>

interface Ledger {
  budgetAtomic: bigint
  spentAtomic: bigint
  hireCapability?: string
}

export interface HireBroker {
  readonly socketPath: string
  /** Called before a job starts: fixes that job's ceiling and returns its token. */
  readonly openJob: (
    jobId: string,
    budgetUsd: number | undefined,
    hireCapability?: string
  ) => string
  /** Called when a job ends, so a token cannot outlive the work it was issued for. */
  readonly closeJob: (jobId: string) => void
  readonly spentUsd: (jobId: string) => number
  readonly stop: () => void
}

const defaultPurchase: PurchaseFn = async (args) => {
  // Imported lazily so the broker stays testable without pulling the payment stack in.
  const { callSkill } = await import("@arcade/buyer")
  const { fenceResult } = await import("@arcade/core")
  const { Effect } = await import("effect")

  const out = await Effect.runPromise(
    callSkill({
      ...(args.name === undefined
        ? { hubUrl: args.hubUrl, seller: args.seller, skillId: args.skillId }
        : { name: args.name, expectedHubUrl: args.hubUrl }),
      input: args.input,
      account: privateKeyToAccount(args.privateKey as `0x${string}`),
      maxAmountAtomic: args.maxAmountAtomic,
      ...(args.lineage === undefined ? {} : { lineage: args.lineage })
    })
  )
  const receipt = out.receipt as Record<string, unknown>
  const settled = receipt["settled"] === true
  return {
    jobId: out.jobId,
    settled,
    result: out.result,
    fenced: fenceResult(out.result, args.name ?? args.seller),
    paidAtomic: settled ? parsePrice(String(receipt["price"] ?? "$0")) : 0n
  }
}

export const startHireBroker = (options: HireBrokerOptions): HireBroker => {
  const secret = randomBytes(32)
  const ledgers = new Map<string, Ledger>()
  const purchase = options.purchase ?? defaultPurchase

  const tokenFor = (jobId: string): string =>
    createHmac("sha256", secret).update(jobId).digest("hex")

  const tokenValid = (jobId: string, presented: string): boolean => {
    const expected = Buffer.from(tokenFor(jobId), "utf8")
    const got = Buffer.from(presented, "utf8")
    return expected.length === got.length && timingSafeEqual(expected, got)
  }

  try {
    unlinkSync(options.socketPath)
  } catch {
    /* no stale socket to clear */
  }

  // `node:http` rather than `Bun.serve`: identical under Bun and Node, so the ledger —
  // which is the whole enforcement mechanism now — is testable under both runners instead
  // of only the one the runner happens to use.
  const server = createServer((req, res) => {
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" })
      res.end(JSON.stringify(body))
    }

    void (async () => {
      if ((req.url ?? "") !== "/hire" || req.method !== "POST") {
        return json({ error: "not_found" }, 404)
      }

      const jobId = String(req.headers["x-job-id"] ?? "")
      const token = String(req.headers["x-job-token"] ?? "")
      const ledger = ledgers.get(jobId)

      // An unknown or finished job has no ledger, so a token cannot outlive its work.
      if (ledger === undefined || !tokenValid(jobId, token)) {
        return json({ error: "this job is not authorised to hire" }, 403)
      }

      const raw = await new Promise<string>((resolve) => {
        let acc = ""
        req.on("data", (c) => (acc += String(c)))
        req.on("end", () => resolve(acc))
      })
      const body = ((): Record<string, unknown> => {
        try {
          const parsed: unknown = JSON.parse(raw)
          return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {}
        } catch {
          return {}
        }
      })()
      // Presence, not truthiness: even a null/empty second target makes the request
      // ambiguous. Only broker-owned routing/lineage/key fields are passed to purchase.
      const hasName = Object.hasOwn(body, "name")
      const hasSkillId = Object.hasOwn(body, "skillId")
      if (hasName === hasSkillId) {
        return json({ error: "exactly one skillId or ENS name is required" }, 400)
      }
      const target = hasName ? body["name"] : body["skillId"]
      if (typeof target !== "string" || (hasName
        ? !looksLikeEnsName(target)
        : target.length > 64 || !/^[a-z0-9][a-z0-9-]*$/.test(target))) {
        return json({ error: "invalid skillId or ENS name" }, 400)
      }
      const name = hasName ? normalize(target) : undefined
      const skillId = name ?? target

      const remaining =
        ledger.budgetAtomic > ledger.spentAtomic ? ledger.budgetAtomic - ledger.spentAtomic : 0n
      if (remaining === 0n) {
        return json(
          {
            error:
              `sub-spend budget exhausted for this job (${formatUsdc(ledger.budgetAtomic)} total, ` +
              `${formatUsdc(ledger.spentAtomic)} spent). Nothing was signed.`
          },
          402
        )
      }

      // A cap named by the sandbox may only narrow what the manifest allowed.
      let requested = remaining
      if (Object.hasOwn(body, "maxAmountUsd")) {
        try {
          const amount = body["maxAmountUsd"]
          if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new Error()
          requested = parsePrice(String(amount))
        } catch {
          return json({ error: "maxAmountUsd must be a positive USDC amount with at most six decimal places" }, 400)
        }
      }
      const cap = requested < remaining ? requested : remaining

      // ENS resolution happens exactly once in the buyer SDK. Its expectedHubUrl guard
      // refuses foreign origins before any capability-bearing probe or signature.
      let seller = ""
      if (name === undefined) {
        try {
          const res = await fetch(`${options.hubUrl}/listings/${skillId}`)
          if (!res.ok) return json({ error: `cannot hire "${skillId}": hub returned ${res.status}` }, 404)
          seller = ((await res.json()) as { seller: string }).seller
        } catch (e) {
          return json({ error: `cannot reach the hub: ${String((e as Error)?.message ?? e)}` }, 502)
        }
      }

      try {
        const out = await purchase({
          hubUrl: options.hubUrl,
          seller,
          skillId,
          ...(name === undefined ? {} : { name }),
          input: body["input"] ?? {},
          privateKey: options.subBuyKey,
          maxAmountAtomic: cap,
          ...(ledger.hireCapability === undefined ? {} : { lineage: ledger.hireCapability })
        })
        // Only settled work is charged: an unsettled purchase cost nothing, and counting it
        // would shrink the budget for work that never happened.
        if (out.settled) ledger.spentAtomic += out.paidAtomic

        return json({
          skillId,
          jobId: out.jobId,
          settled: out.settled,
          result: out.result,
          fenced: out.fenced,
          costUsd: Number(out.paidAtomic) / 1e6,
          remainingUsd: Number(ledger.budgetAtomic - ledger.spentAtomic) / 1e6
        })
      } catch (e) {
        return json({ error: String((e as Error)?.message ?? e) }, 502)
      }
    })()
  })

  server.listen(options.socketPath)

  return {
    socketPath: options.socketPath,
    openJob: (jobId, budgetUsd, hireCapability) => {
      ledgers.set(jobId, {
        // Absent means zero, never unlimited: a seller who declares `hire-skills` and
        // forgets the bound gets a skill that cannot spend.
        budgetAtomic: budgetUsd === undefined || budgetUsd <= 0 ? 0n : parsePrice(String(budgetUsd)),
        spentAtomic: 0n,
        ...(hireCapability === undefined ? {} : { hireCapability })
      })
      return tokenFor(jobId)
    },
    closeJob: (jobId) => {
      ledgers.delete(jobId)
    },
    spentUsd: (jobId) => Number(ledgers.get(jobId)?.spentAtomic ?? 0n) / 1e6,
    stop: () => {
      server.close()
      try {
        unlinkSync(options.socketPath)
      } catch {
        /* already gone */
      }
    }
  }
}

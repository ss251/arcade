#!/usr/bin/env bun
/**
 * wallet-risk-note — a skill that BUYS from another skill.
 *
 * Skill contract, same as every other listing: read `{ jobId, input }` as JSON on stdin,
 * write `{ output, stopReason }` on stdout, log to stderr.
 *
 * ## Why this exists
 *
 * Every other listing is a leaf: it does its own work and returns. This one is a composite —
 * it needs on-chain facts about an address and, rather than reading the chain itself, it
 * BUYS them from `usdc-flow-check`, a different listing owned by a different seller. One
 * buyer action therefore produces two settlements on Arc.
 *
 * That is the thing an ordinary API marketplace cannot do. A marketplace of APIs has one
 * seller per call; here a seller is also a buyer, and the money splits again at each hop.
 *
 * ## It never holds a key
 *
 * The obvious way to buy would be to hand this process a funded private key. That would make
 * `maxSubSpendUsd` advisory, because the code holding the key is the code being bounded — a
 * prompt injection reaching an agent-backed skill could simply ask it to spend more.
 *
 * Instead the runner keeps `ARCADE_SUBBUY_KEY` in its own process and hands the sandbox a
 * per-job token over a Unix socket. This file can spend exactly what the manifest declared
 * and not one cent more, because the ledger lives somewhere it cannot reach. The three
 * variables below are the entire grant, and they are useless after the job ends.
 */

const SOCKET = process.env["ARCADE_HIRE_SOCKET"]
const JOB_ID = process.env["ARCADE_JOB_ID"]
const JOB_TOKEN = process.env["ARCADE_JOB_TOKEN"]

interface Payload {
  jobId: string
  input: { address?: string; minUsdc?: number }
}

interface FlowCheck {
  address: string
  balanceUsdc: string
  balanceAtomic: string
  nonce: number
  isContract: boolean
  chainId: number
  blockNumber: string
  checkedAt: string
}

const fail = (reason: string): never => {
  process.stdout.write(JSON.stringify({ stopReason: "refusal", error: reason }))
  process.exit(0)
}

/** Buy one call of another listing through the runner's broker. */
const hire = async (skillId: string, input: unknown, maxAmountUsd: number) => {
  if (SOCKET === undefined || JOB_ID === undefined || JOB_TOKEN === undefined) {
    fail(
      "no hire grant in this environment — the runner did not start a broker, which means " +
        "ARCADE_SUBBUY_KEY is unset. This skill cannot produce a note without buying its facts."
    )
  }
  const res = await fetch("http://localhost/hire", {
    method: "POST",
    // Bun routes this over the Unix socket rather than TCP; the host in the URL is ignored.
    unix: SOCKET,
    headers: {
      "content-type": "application/json",
      "x-job-id": JOB_ID!,
      "x-job-token": JOB_TOKEN!
    },
    body: JSON.stringify({ skillId, input, maxAmountUsd })
  } as RequestInit & { unix: string })

  const body = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    fail(`hiring ${skillId} failed: ${String(body["error"] ?? res.status)}`)
  }
  return body
}

const main = async () => {
  const raw = await Bun.stdin.text()
  const { input } = JSON.parse(raw) as Payload
  const address = input.address
  if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    fail("address must be a 0x-prefixed 40-hex-character EVM address")
  }
  const minUsdc = typeof input.minUsdc === "number" ? input.minUsdc : 1

  console.error(`hiring usdc-flow-check for ${address}`)
  const bought = await hire("usdc-flow-check", { address }, 0.02)
  const facts = (bought["result"] ?? {}) as FlowCheck

  // Settle-on-success applies to the SUB-purchase too. A hop that did not settle produced
  // no facts and cost nothing, and saying so is better than assessing an address from an
  // empty object.
  if (bought["settled"] !== true) {
    fail("the sub-purchase did not settle, so there are no facts to assess — nothing was charged")
  }

  if (typeof facts.balanceUsdc !== "string") {
    fail("usdc-flow-check returned no balance — cannot assess this address")
  }

  // The assessment itself. Deliberately mechanical: every finding is a statement about a
  // fact that was bought, so nothing here is a claim this skill invented.
  const balance = Number(facts.balanceUsdc)
  const findings: Array<string> = []

  if (facts.isContract) {
    findings.push("Address is a contract, not an externally owned account.")
  } else {
    findings.push("Externally owned account — no contract code at this address.")
  }

  const everTransacted = (facts.nonce ?? 0) > 0
  findings.push(
    everTransacted
      ? `Has sent ${facts.nonce} transaction(s); the key is in use.`
      : "Has never sent a transaction — no signing history at all."
  )

  const funded = balance >= minUsdc
  findings.push(
    funded
      ? `Holds ${facts.balanceUsdc} USDC, at or above the ${minUsdc} required to settle.`
      : `Holds only ${facts.balanceUsdc} USDC, below the ${minUsdc} required to settle.`
  )

  const verdict = !funded ? "unfunded" : everTransacted ? "ok" : "caution"

  const output = {
    address,
    verdict,
    findings,
    balanceUsdc: facts.balanceUsdc,
    isContract: Boolean(facts.isContract),
    everTransacted,
    // Naming the source, and what it cost, is the point of the whole listing: the buyer can
    // see that a second seller was paid inside the job they paid for.
    //
    // These are the broker's OWN field names — `costUsd`, `jobId`, `remainingUsd`. The first
    // draft read `paidUsdc` and `settleTx`, which the broker does not return, so the note
    // would have shipped empty strings for exactly the two figures that prove a hop
    // happened. The settlement transaction is not the sandbox's to report anyway: it lands
    // on the hub's public receipt feed, where a reader can see both hops side by side.
    sourcedFrom: {
      skillId: "usdc-flow-check",
      paidUsdc: `$${Number(bought["costUsd"] ?? 0).toFixed(4)}`,
      subJobId: String(bought["jobId"] ?? ""),
      budgetLeftUsd: `$${Number(bought["remainingUsd"] ?? 0).toFixed(4)}`
    }
  }

  process.stdout.write(JSON.stringify({ output, stopReason: "end_turn" }))
}

void main()

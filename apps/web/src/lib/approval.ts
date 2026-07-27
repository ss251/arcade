import { parsePrice } from "@arcade/core"

/**
 * When a purchase needs the visitor's explicit confirmation.
 *
 * This is the conditional edge of the purchase graph, expressed as **policy** rather than
 * as UI. AI SDK 7 moved approval from a boolean on the tool to a call-level `toolApproval`
 * function precisely so the decision can depend on the call's arguments — and here the
 * argument that matters is the price. Vercel's own migration guide says the codemods cannot
 * decide approval policy placement, so this is hand-written on purpose.
 *
 * ## The default is to ask
 *
 * `decide` returns `"user-approval"` for anything it does not positively recognise as
 * costless. A policy that fell through to `"approved"` on a shape it failed to parse would
 * be a gate that opens when confused, which is the failure mode this whole edge exists to
 * prevent — and the confusing input is exactly what an injected seller description would
 * try to produce.
 *
 * ## There is no auto-approve branch, and that is a finding rather than an omission
 *
 * The first draft auto-approved zero-cost calls, on the reasoning that a confirmation people
 * click through is worse than none because it launders consent. That reasoning is sound and
 * inapplicable here: `parsePrice` rejects `$0` outright — the floor is `$0.000001` — so a
 * free purchase cannot be expressed in this system at all. The branch was guarding a case
 * that cannot occur, and an unreachable path in a money gate is worse than no path, because
 * it implies an approval route that does not exist.
 *
 * So the policy has exactly two outcomes: `denied` above the ceiling, `user-approval` for
 * everything else. Every purchase on this marketplace costs something, therefore every
 * purchase asks. `$0.0005` is a real spend on a marketplace whose whole argument is that
 * sub-cent payments are the point.
 */

/** What the SDK expects back from a per-tool approval function. */
export type ApprovalDecision = "approved" | "denied" | "user-approval" | "not-applicable"

export interface PurchaseArgs {
  readonly skillId?: unknown
  readonly maxAmountUsd?: unknown
}

/**
 * The per-call ceiling. A quote above this is DENIED outright rather than sent to the
 * visitor: a card offering to spend more than the configured maximum is asking permission
 * for something the system has already decided it will not do, and showing it would make
 * the ceiling advisory.
 */
export const hardCeilingAtomic = (env: Record<string, string | undefined>): bigint =>
  parsePrice(env["ARCADE_MAX_CALL_USD"] ?? "$1.00")

export const decide = (
  args: PurchaseArgs,
  env: Record<string, string | undefined> = process.env
): ApprovalDecision => {
  if (typeof args.skillId !== "string" || args.skillId === "") return "user-approval"

  const raw = args.maxAmountUsd
  // A missing or unparseable amount means we do not know what this costs. Ask.
  if (typeof raw !== "string" && typeof raw !== "number") return "user-approval"

  let atomic: bigint
  try {
    atomic = parsePrice(typeof raw === "number" ? `$${raw}` : String(raw))
  } catch {
    // Unparseable includes zero and negatives, which `parsePrice` rejects. Every one of
    // those means "we do not know what this costs", and the answer to that is to ask.
    return "user-approval"
  }

  // Above the ceiling is refused outright rather than shown: a card offering to spend more
  // than the configured maximum asks permission for something the system has already
  // decided against, which would make the ceiling advisory.
  return atomic > hardCeilingAtomic(env) ? "denied" : "user-approval"
}

import { validateJson } from "./validate.ts"

/**
 * Input is validated BEFORE any payment work. Previously the hub verified the buyer's
 * authorization, then parsed the body and swallowed a malformed one as `{}` — a verified
 * authorization attached to garbage input, i.e. the "paid, got a 400" class one layer in.
 *
 * Split out of `server.ts` (rather than defined inline as the brief shows) because
 * `server.ts` runs `Bun.serve` and `Effect.runPromise(... Effect.never)` at module load —
 * importing it from a test would start a real server and hang. This module is pure and
 * side-effect-free, so both `server.ts` and `input-gate.test.ts` import it safely.
 */
export const inputGate = (
  listing: { readonly id: string; readonly inputSchema: unknown },
  body: unknown
): { error: "input_invalid"; detail: string } | null =>
  validateJson(body, listing.inputSchema)
    ? null
    : { error: "input_invalid", detail: `body does not satisfy the listing's inputSchema for ${listing.id}` }

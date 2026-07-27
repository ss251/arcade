import { describe, expect, it } from "vitest"
import { splitterRefusal } from "../src/splitter.ts"

/**
 * A splitter must pay the seller that announced it.
 *
 * `FeeSplitter.seller` is immutable, and `ARCADE_FEE_SPLITTER` is a runner ENVIRONMENT
 * variable read at `packages/runner/src/daemon.ts:135` — not part of the config. So the two
 * move independently: change `sellerAddress` and the announced splitter does not follow.
 * The handshake previously checked only `feeBps()`, so a mismatched pairing was accepted,
 * the listings published under the new seller, and every buyer payment routed into a
 * contract paying the old one.
 *
 * Not hypothetical. The pilot splitter `0xf95c8afe…` has `seller()` = `0x3b2Bbb84…`, an
 * address whose key nobody holds. Repointing the runner to a signable seller while leaving
 * `ARCADE_FEE_SPLITTER` set would have published listings naming one address while paying
 * an unspendable other — every purchase in a recording landing somewhere unrecoverable.
 *
 * The shape is new to this repo's tally: two facts that must agree, one immutable on chain
 * and one an environment variable. The usual answer is to delete the second copy; here the
 * on-chain copy is beyond anyone's reach to change, so the only move left is to refuse the
 * combination.
 */

const DEAD = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const SIGNABLE = "0xcf821769ED3c0E55e152745377bb833d7155A78a"
const SPLITTER = "0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206"

describe("splitter must pay the announcing seller", () => {
  it("refuses the exact live pairing that would have misrouted the video", () => {
    // The real one: runner repointed to the signable address, ARCADE_FEE_SPLITTER still
    // naming the contract bound to the dead one.
    const refusal = splitterRefusal(SIGNABLE, DEAD, SPLITTER)
    expect(refusal).toBeDefined()
    expect(refusal).toContain(DEAD)
    expect(refusal).toContain(SIGNABLE)
    // The message must say WHY it cannot be worked around, and what to do instead.
    expect(refusal).toContain("immutable")
    expect(refusal).toContain("unset ARCADE_FEE_SPLITTER")
  })

  it("accepts a splitter bound to the announcing seller", () => {
    // The inverse. A guard that refused every splitter would take the take-rate offline,
    // which is worse than the bug — and it would pass the test above.
    expect(splitterRefusal(SIGNABLE, SIGNABLE, SPLITTER)).toBeUndefined()
  })

  it("compares case-insensitively, since checksum casing is not identity", () => {
    // A refusal here would be a false positive on a correctly-bound splitter whose address
    // came back from an RPC in different casing.
    expect(splitterRefusal(SIGNABLE.toLowerCase(), SIGNABLE.toUpperCase(), SPLITTER)).toBeUndefined()
    expect(splitterRefusal(SIGNABLE.toUpperCase(), SIGNABLE.toLowerCase(), SPLITTER)).toBeUndefined()
  })

  it("fails OPEN when the contract cannot be read", () => {
    // Deliberate, and the same posture the feeBps check already takes: an RPC that will not
    // answer must not take a seller offline. Unreadable is "unknown", not "wrong".
    expect(splitterRefusal(SIGNABLE, undefined, SPLITTER)).toBeUndefined()
  })

  it("names the splitter, so the operator knows which contract to replace", () => {
    expect(splitterRefusal(SIGNABLE, DEAD, SPLITTER)).toContain(SPLITTER)
  })
})

import { describe, expect, it } from "vitest"
import { captureFundingAuthority, FundingFailure } from "../src/gateway-funding"
import { captureTransferSpec, encodeTransferSpec, encodeBurnIntent, encodeWithdrawalAttestation, encodeWithdrawalAttestationSet, hashTransferSpec, decodeAndBindWithdrawalAttestation, captureBurnIntent, validateBurnHeight, burnIntentTypedData } from "../src/gateway-withdrawal"
import { keccak256, hashMessage, hashTypedData } from "viem"

const authority = captureFundingAuthority(`0x${"11".repeat(20)}`)
const spec = () => captureTransferSpec({ version: 1, sourceDomain: 26, destinationDomain: 26, sourceContract: authority.wallet, destinationContract: authority.minter,
  sourceToken: authority.token, destinationToken: authority.token, sourceDepositor: authority.account, destinationRecipient: authority.account,
  sourceSigner: authority.account, destinationCaller: `0x${"00".repeat(20)}`, value: 123456n, salt: `0x${"22".repeat(32)}`, hookData: "0x" }, authority)

describe("unsigned pinned Gateway withdrawal codecs", () => {
  it("matches all four independently retained packed vectors", () => {
    const s = spec(), intent = captureBurnIntent({ maxBlockHeight: 1120n, maxFee: 50n, spec: s }, authority)
    const payload = encodeWithdrawalAttestation(s, 1010n)
    const vectors = [
      [encodeTransferSpec(s), 340, "0x9d6e6e7a00b22d847aa3e4ff5f82be38c71d91abb0e7e19a57953c66d478dd63"],
      [payload, 380, "0x5a8b520f5d8098067e7ae3a385de7b9a8c6a1e6f97d3ee7d70c4d6620f0e4d16"],
      [encodeWithdrawalAttestationSet(s, 1010n), 388, "0x0bdb9e7b79bdbdc3b400677e8b068640e38a80ecc0eee67ca281ee8bbd2c5893"],
      [encodeBurnIntent(intent), 412, "0xcff5ca655c547053771881b65a99f441c4fe589dab9a4f9940b8654ae22e91cf"]
    ] as const
    for (const [bytes, length, hash] of vectors) { expect((bytes.length - 2) / 2).toBe(length); expect(keccak256(bytes)).toBe(hash) }
    expect(hashTransferSpec(s)).toBe(vectors[0][2])
  })
  it("accepts inclusive destination expiry but not one block later", () => {
    const s = spec(), bytes = encodeWithdrawalAttestation(s, 1010n)
    expect(decodeAndBindWithdrawalAttestation(bytes, s, 1010n).maxBlockHeight).toBe(1010n)
    expect(() => decodeAndBindWithdrawalAttestation(bytes, s, 1011n)).toThrow(FundingFailure)
  })
  it("requires complete byte equality for every captured spec byte", () => {
    const s = spec(), bytes = encodeWithdrawalAttestation(s, 1010n)
    for (let offset = 40; offset < 380; offset++) {
      const at = 2 + offset * 2, changed = `${bytes.slice(0, at)}${bytes.slice(at, at + 2) === "ff" ? "00" : "ff"}${bytes.slice(at + 2)}`
      expect(() => decodeAndBindWithdrawalAttestation(changed, s, 1000n)).toThrow(FundingFailure)
    }
  })
  it("rejects wrapper ambiguity, trailing bytes and unbounded payloads", () => {
    const s = spec(), bytes = encodeWithdrawalAttestationSet(s, 1010n)
    expect(decodeAndBindWithdrawalAttestation(bytes, s, 1000n).wrapper).toBe("singleton-set")
    for (const value of [bytes + "00", bytes.slice(0, -2), bytes.slice(0, 10) + "00000002" + bytes.slice(18), "0x", "0x" + "ab".repeat(389), bytes + "\n"]) {
      expect(() => decodeAndBindWithdrawalAttestation(value, s, 1000n)).toThrow(FundingFailure)
    }
  })
  it("keeps finite source delay and maximum delta distinct from destination expiry", () => {
    expect(validateBurnHeight(1120n, 1000n, 100n, 120n)).toBe(1120n)
    expect(() => validateBurnHeight(1120n, 1021n, 100n, 120n)).toThrow(FundingFailure)
    expect(() => validateBurnHeight((1n << 256n) - 1n, 1000n, 100n, 120n)).toThrow(FundingFailure)
  })
  it("constructs the separate immutable unsigned BurnIntent typed data", () => {
    const intent = captureBurnIntent({ maxBlockHeight: 1120n, maxFee: 50n, spec: spec() }, authority)
    const data = burnIntentTypedData(intent, authority)
    expect(data.domain).toEqual({ name: "GatewayWallet", version: "1" })
    expect(data.primaryType).toBe("BurnIntent")
    expect(data.message.spec.sourceContract).toBe(`0x${"00".repeat(12)}${authority.wallet.slice(2)}`)
    expect(data.message.spec.destinationCaller).toBe(`0x${"00".repeat(32)}`)
    expect(Object.isFrozen(data.types.TransferSpec)).toBe(true)
    expect(Object.isFrozen(data.message.spec)).toBe(true)
    expect(hashTypedData(data)).toBe("0xcdee87b0f59d3a094bb511d5e3feb29b2f7f73d90e7cfb6486abc8aed4a460fd")
  })
  it("derives attester personal-message hash from raw payload hash only", () => {
    const s = spec(), payload = encodeWithdrawalAttestationSet(s, 1010n)
    const parsed = decodeAndBindWithdrawalAttestation(payload, s, 1000n)
    expect(parsed.attesterMessageHash).toBe(hashMessage({ raw: keccak256(payload) }))
    expect(parsed.attesterMessageHash).not.toBe(hashMessage(keccak256(payload)))
    expect(parsed.attesterMessageHash).not.toBe(hashMessage({ raw: payload }))
  })
})

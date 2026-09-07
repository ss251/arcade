import { describe, expect, it } from "vitest"
import { privateKeyToAccount } from "viem/accounts"
import { decodeFunctionData, encodeAbiParameters, hashTypedData, keccak256, parseAbiParameters, toHex, type Hex } from "viem"
import { ERC8183_ABI } from "../src/erc8183-abi.ts"
import { encodeSetBudgetRelay, encodeSubmitRelay, packProviderNonce, providerAuthorizationDeadline,
  randomProviderNonce, setBudgetAuthorization, submitAuthorization } from "../src/erc8183-auth.ts"
const account = privateKeyToAccount(("0x" + "11".repeat(32)) as Hex)
const address = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Hex
const base = { chainId: 5042002, escrow: address(1), signer: account.address, jobId: 7n, nonce: 19n, deadline: 1600n }
const budget = { ...base, token: address(2), amount: 300000n }
const submit = { ...base, deliverable: keccak256(toHex("output")) }
describe("pinned provider authorizations", () => {
  it("hashes the exact source SetBudget type with the ERC8183/1 domain", () => {
    const typed = setBudgetAuthorization(budget, 1000)
    const domainHash = keccak256(encodeAbiParameters(parseAbiParameters("bytes32,bytes32,bytes32,uint256,address"), [
      keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
      keccak256(toHex("ERC8183")), keccak256(toHex("1")), 5042002n, base.escrow
    ]))
    const structHash = keccak256(encodeAbiParameters(parseAbiParameters("bytes32,address,uint256,address,uint256,bytes32,uint72,uint256"), [
      keccak256(toHex("SetBudgetAuthorization(address signer,uint256 jobId,address token,uint256 amount,bytes32 optParamsHash,uint72 nonce,uint256 deadline)")),
      base.signer, 7n, budget.token, 300000n, keccak256("0x"), 19n, 1600n
    ]))
    expect(hashTypedData(typed)).toBe(keccak256(("0x1901" + domainHash.slice(2) + structHash.slice(2)) as Hex))
    expect(Object.isFrozen(typed.message)).toBe(true)
    expect(Object.isFrozen(typed.types.SetBudgetAuthorization[0])).toBe(true)
  })
  it("uses all nine random nonce bytes and the exact signer/padding/uint72 packing", () => {
    expect(randomProviderNonce(bytes => { bytes.fill(255); return bytes })).toBe((1n << 72n) - 1n)
    expect(packProviderNonce(address(1), (1n << 72n) - 1n)).toBe(address(1) + "000000" + "ff".repeat(9))
    expect(() => packProviderNonce(address(1), 1n << 72n)).toThrow("escrow_facts_refused")
    expect(providerAuthorizationDeadline(1000)).toBe(1600n)
  })
  it("rejects foreign chains, expired/overlong windows, invalid integers and zero fields", () => {
    for (const delta of [{ chainId: 1 }, { deadline: 1000n }, { deadline: 1601n }, { nonce: -1n },
      { nonce: 1n << 72n }, { jobId: 0n }, { amount: 0n }, { amount: 1n << 256n },
      { escrow: address(0) }, { signer: address(0) }, { token: address(0) }]) {
      expect(() => setBudgetAuthorization({ ...budget, ...delta }, 1000)).toThrow("escrow_facts_refused")
    }
    expect(() => submitAuthorization({ ...submit, deliverable: ("0x" + "00".repeat(32)) as Hex }, 1000)).toThrow("escrow_facts_refused")
  })
  it("recovers a real seller signature and encodes exactly the authorization tuple", async () => {
    const signature = await account.signTypedData(setBudgetAuthorization(budget, 1000))
    const result = decodeFunctionData({ abi: ERC8183_ABI, data: await encodeSetBudgetRelay(budget, signature, 1001) })
    expect(result.functionName).toBe("setBudgetWithAuthorization")
    expect(result.args).toEqual([7n, budget.token, 300000n, "0x",
      { signer: account.address, nonce: 19n, deadline: 1600n, sig: signature }])
    const signedSubmit = await account.signTypedData(submitAuthorization(submit, 1000))
    const submitted = decodeFunctionData({ abi: ERC8183_ABI, data: await encodeSubmitRelay(submit, signedSubmit, 1001) })
    expect(submitted.functionName).toBe("submitWithAuthorization")
    expect(submitted.args).toEqual([7n, submit.deliverable, "0x",
      { signer: account.address, nonce: 19n, deadline: 1600n, sig: signedSubmit }])
  })
  it("rejects changed signed job/token/amount/domain/nonce/deadline and wrong or malformed signatures", async () => {
    const signature = await account.signTypedData(setBudgetAuthorization(budget, 1000))
    for (const delta of [{ jobId: 8n }, { token: address(3) }, { amount: 300001n }, { escrow: address(3) },
      { signer: address(3) }, { nonce: 20n }, { deadline: 1599n }]) {
      await expect(encodeSetBudgetRelay({ ...budget, ...delta }, signature, 1001)).rejects.toThrow("escrow_facts_refused")
    }
    await expect(encodeSetBudgetRelay(budget, "0x", 1001)).rejects.toThrow("escrow_facts_refused")
    await expect(encodeSetBudgetRelay(budget, signature, 1600)).rejects.toThrow("escrow_facts_refused")
    await expect(encodeSubmitRelay(submit, signature, 1001)).rejects.toThrow("escrow_facts_refused")
  })
})

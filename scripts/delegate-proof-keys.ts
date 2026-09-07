/** Explicit owned proof Keychain reads. Never called during import/help/tests. */
import { execFile } from "node:child_process"
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"
import { DELEGATE_PROOF as P, proofCheck, proofFail, proofAddress } from "./delegate-funding-proof.ts"
export const PROOF_FACILITATOR = "0xbe8efcca100f618bd1e6c694f865069eadae5f8b" as Hex
const roles = Object.freeze({
  owner: { service: "arcade-buyer-key", address: P.owner },
  delegate: { service: "arcade-gateway-buyer-key", address: P.delegate },
  seller: { service: "arcade-seller-key", address: P.seller },
  facilitator: { service: "arcade-facilitator-key", address: PROOF_FACILITATOR }
})
export type ProofKeyRole = keyof typeof roles
export async function proofPrivateKey(role: ProofKeyRole): Promise<Hex> {
  proofCheck(Object.hasOwn(roles, role))
  const selected = roles[role]
  try {
    const text = await new Promise<string>((resolve, reject) => {
      execFile("/usr/bin/security", ["find-generic-password", "-s", selected.service, "-w"],
        { encoding: "utf8", timeout: 5000, maxBuffer: 256 }, (error, out) => error ? reject(Error("proof_key_unavailable")) : resolve(out))
    })
    const key = text.trim()
    proofCheck(/^0x[a-fA-F0-9]{64}$/.test(key) && proofAddress(privateKeyToAccount(key as Hex).address) === selected.address)
    return key as Hex
  } catch { return proofFail() }
}
export function lazyProofAccount(role: ProofKeyRole) {
  let cached: Promise<ReturnType<typeof privateKeyToAccount>> | undefined
  return () => cached ??= proofPrivateKey(role).then(privateKeyToAccount)
}

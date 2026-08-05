import { EIP712_DOMAIN, TRANSFER_TYPES } from "@arcade/payments"
import { GATEWAY_MIN_VALIDITY_SECONDS } from "@arcade/core"
import type { Eip1193Provider } from "./wallet.ts"

/**
 * The signature, produced in the visitor's browser by the visitor's own wallet.
 *
 * This is the sentence the whole product rests on, executed: ARCADE never holds a key, so
 * the only place an authorization can be signed is here. What travels afterwards is a
 * signed message, and a signed EIP-3009 authorization names its payee, its amount and its
 * expiry inside the signature — so nothing downstream can redirect it, raise it, or replay
 * it past `validBefore`. That is what makes it safe for anything to carry.
 *
 * ## The domain is IMPORTED, never restated
 *
 * `EIP712_DOMAIN` and `TRANSFER_TYPES` come from `@arcade/payments` — the same values the
 * hub verifies against and the buyer CLI signs with. A local copy would be the most
 * dangerous second copy in this repo: EIP-712 signatures are recovered, not compared, so a
 * domain that disagreed by one character would produce a perfectly valid signature that
 * recovers to a DIFFERENT address. The hub would reject it as "not signed by the buyer",
 * which is a true statement about the wrong problem, and nothing would point at the domain.
 *
 * ## Why `eth_signTypedData_v4` directly rather than viem
 *
 * `signAuthorization` in `@arcade/payments` takes a viem `Account`, and wrapping an
 * injected provider into one is a real dependency and a real adapter for a single call.
 * The provider already speaks this method; the typed data below is the same structure
 * `signAuthorization` builds. Signing stays a request to the wallet, which is what it is.
 */

/** Exactly what the hub will verify. Atomic units and timestamps travel as strings. */
export interface SignedAuthorization {
  readonly from: string
  readonly to: string
  readonly value: string
  readonly validAfter: string
  readonly validBefore: string
  readonly nonce: string
  readonly signature: string
}

/**
 * A fresh 32-byte nonce.
 *
 * `transferWithAuthorization` is permissionless and USDC records every nonce it has seen,
 * so this is what stops one signed authorization being replayed. Randomness, not a counter:
 * a counter would need state this page does not have and cannot safely share across tabs.
 */
const freshNonce = (): string =>
  `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`

export class SignatureDeclined extends Error {
  readonly _tag = "SignatureDeclined"
}

export const signPayment = async (
  provider: Eip1193Provider,
  args: { readonly from: string; readonly payTo: string; readonly amountAtomic: string }
): Promise<SignedAuthorization> => {
  const now = Math.floor(Date.now() / 1000)
  /*
   * Seven days. Gateway REJECTS anything shorter (`docs` and `GATEWAY_MIN_VALIDITY_SECONDS`
   * both say so), and the same window is used on the EIP-3009 rail so an authorization
   * signed here stays valid whichever rail settles it. It bounds the blast radius of a
   * signature that is never used: after this it is dead on its own.
   */
  const validBefore = String(now + GATEWAY_MIN_VALIDITY_SECONDS)
  const nonce = freshNonce()

  const typedData = {
    domain: {
      name: EIP712_DOMAIN.name,
      version: EIP712_DOMAIN.version,
      // JSON has no bigint, and wallets want the chain id as a number here.
      chainId: Number(EIP712_DOMAIN.chainId),
      verifyingContract: EIP712_DOMAIN.verifyingContract
    },
    types: {
      // `EIP712Domain` is required in the JSON-RPC form and is implicit in viem's — the one
      // real difference between this path and `signAuthorization`, and omitting it makes
      // wallets reject the request outright.
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" }
      ],
      ...TRANSFER_TYPES
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: args.from,
      to: args.payTo,
      value: args.amountAtomic,
      validAfter: "0",
      validBefore,
      nonce
    }
  }

  let signature: string
  try {
    signature = (await provider.request({
      method: "eth_signTypedData_v4",
      params: [args.from, JSON.stringify(typedData)]
    })) as string
  } catch (e) {
    const message = String((e as Error)?.message ?? e)
    // Declining is a DECISION, not a fault, and the surface above says so rather than
    // reporting an error the visitor deliberately caused.
    if (/denied|reject|cancel/i.test(message)) {
      throw new SignatureDeclined("you declined the signature — nothing was sent or spent")
    }
    throw new Error(message)
  }

  return {
    from: args.from,
    to: args.payTo,
    value: args.amountAtomic,
    validAfter: "0",
    validBefore,
    nonce,
    signature
  }
}

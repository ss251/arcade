import { Effect } from "effect"
import { spawn } from "node:child_process"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { getAddress, isAddress } from "viem"

/**
 * The seller's payout identity.
 *
 * A seller needs a private key for exactly one thing: signing the `Hello` handshake, so the
 * hub can recover the address and know that whoever is claiming a payout address actually
 * controls it. Without that, anyone could announce a listing pointing payment at themselves
 * (`apps/hub` T-LISTING-001). It is never used to move money — settlement is broadcast by
 * the facilitator against a buyer's offline authorization.
 *
 * Where the key lives is the whole design question here. `ARCADE_SELLER_KEY` as the only
 * source meant a seller had to already own a key, and re-export it into every shell before
 * `arcade runner start` — the single biggest step in going from nothing to earning. So:
 *
 *   1. `ARCADE_SELLER_KEY` if set — explicit wins, works on Linux, in CI, in containers
 *   2. the OS keychain, written once by `arcade init`
 *   3. otherwise a refusal that says exactly which of the two to do
 *
 * The key is never written to `~/.arcade/config.json`. That file holds the *address*, which
 * is public by definition — it is where earnings are paid, and it is already announced to
 * the hub in every handshake.
 */

const KEYCHAIN_SERVICE = "arcade-seller-key"

export interface SellerWallet {
  readonly address: string
  readonly privateKey: string
}

export class WalletError extends Error {
  readonly _tag = "WalletError"
}

/** macOS is the only platform with a keychain we can drive without a dependency. */
export const keychainAvailable = (): boolean => process.platform === "darwin"

/** No keychain call may outlive this. See the timeout branch for why. */
const SECURITY_TIMEOUT_MS = 10_000

const runSecurity = (args: ReadonlyArray<string>): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolve) => {
    // argv rather than a shell string: nothing reaches shell history, and no quoting bug can
    // turn a key into a command. The value is briefly visible in this user's own process
    // list, which is the same trust boundary as ~/.arcade itself — anything that can read
    // your process table can read your home directory.
    const child = spawn("security", [...args], { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let done = false

    const finish = (r: { code: number; stdout: string; stderr: string }) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(r)
    }

    // A keychain item whose ACL does not name its reader blocks on a GUI authorization
    // dialog — indefinitely, and with no output. On a headless runner or over SSH there is
    // no dialog to answer, so the process simply stops. Writes made by this module name
    // their reader (`-T`) and do not prompt, but an entry created by an older version, by
    // hand, or synced from another Mac still can. Failing loudly beats hanging silently.
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      finish({
        code: 124,
        stdout: "",
        stderr:
          "keychain access timed out — the entry is probably waiting on an authorization " +
          "dialog. Re-run `arcade init` to rewrite it, or set ARCADE_SELLER_KEY."
      })
    }, SECURITY_TIMEOUT_MS)

    child.stdout.on("data", (d) => (stdout += String(d)))
    child.stderr.on("data", (d) => (stderr += String(d)))
    child.on("error", () => finish({ code: 127, stdout: "", stderr: "security not found" }))
    child.on("close", (code) => finish({ code: code ?? 1, stdout, stderr }))
  })

/** Store a key under the address, so several payout identities can coexist on one machine. */
export const keychainStore = (address: string, privateKey: string) =>
  Effect.tryPromise({
    try: async () => {
      // -U updates in place rather than failing when the entry already exists.
      //
      // -T is load-bearing and easy to omit: an item created by `security` with no trusted
      // application gets an empty ACL, so the *first read* blocks on a GUI authorization
      // dialog. That turns `arcade start` into a hang with no output on a headless box or
      // over SSH, which is precisely where runners are meant to live. Naming the reader
      // explicitly is tighter than `-A` (which would let any process read it silently).
      const r = await runSecurity([
        "add-generic-password",
        "-s", KEYCHAIN_SERVICE,
        "-a", address,
        "-w", privateKey,
        "-U",
        "-T", "/usr/bin/security",
        "-D", "ARCADE seller key",
        "-j", "Signs the runner handshake that proves this payout address is yours."
      ])
      if (r.code !== 0) throw new WalletError(`keychain write failed: ${r.stderr.trim()}`)
      return address
    },
    catch: (e) => (e instanceof WalletError ? e : new WalletError(String((e as Error)?.message ?? e)))
  })

export const keychainRead = (address: string) =>
  Effect.tryPromise({
    try: async (): Promise<string | undefined> => {
      const r = await runSecurity(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", address, "-w"])
      if (r.code !== 0) return undefined
      const key = r.stdout.trim()
      return key === "" ? undefined : key
    },
    catch: (e) => new WalletError(String((e as Error)?.message ?? e))
  })

export const generateWallet = (): SellerWallet => {
  const privateKey = generatePrivateKey()
  return { address: privateKeyToAccount(privateKey).address, privateKey }
}

/** Derive the address a key controls, rejecting anything that is not a usable key. */
export const addressForKey = (privateKey: string): string => {
  const normalised = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalised)) {
    throw new WalletError("not a private key — expected 32 hex bytes, optionally 0x-prefixed")
  }
  return privateKeyToAccount(normalised as `0x${string}`).address
}

export const normaliseAddress = (address: string): string => {
  if (!isAddress(address)) throw new WalletError(`not an Ethereum address: ${address}`)
  return getAddress(address)
}

export type KeySource = "env" | "keychain"

export interface ResolvedKey {
  readonly privateKey: string
  readonly source: KeySource
}

/**
 * Find the key controlling `address`, and refuse rather than guess if what turns up
 * controls something else — a mismatch means the runner would sign a handshake claiming an
 * address it cannot prove, and the hub would reject it with a message about signatures
 * rather than about configuration.
 */
export const resolveSellerKey = (address: string) =>
  Effect.gen(function* () {
    const want = normaliseAddress(address)

    const fromEnv = process.env["ARCADE_SELLER_KEY"]
    if (fromEnv !== undefined && fromEnv !== "") {
      const got = addressForKey(fromEnv)
      if (got !== want) {
        return yield* Effect.fail(
          new WalletError(
            `ARCADE_SELLER_KEY controls ${got}, but this runner is configured for ${want}.\n` +
              "Unset it to use the key in your keychain, or run: arcade init --seller " + got
          )
        )
      }
      return { privateKey: fromEnv, source: "env" as const }
    }

    if (keychainAvailable()) {
      const stored = yield* keychainRead(want)
      if (stored !== undefined) {
        const got = addressForKey(stored)
        if (got !== want) {
          return yield* Effect.fail(
            new WalletError(`the keychain entry for ${want} controls ${got} — re-run: arcade init`)
          )
        }
        return { privateKey: stored, source: "keychain" as const }
      }
    }

    return yield* Effect.fail(
      new WalletError(
        `no key found for ${want}.\n\n` +
          (keychainAvailable()
            ? "  arcade init                 create one (stored in your keychain)\n"
            : "") +
          "  export ARCADE_SELLER_KEY=0x…  use an existing key\n\n" +
          "The runner signs its handshake with this key so the hub can verify that the\n" +
          "address receiving payment is one you control. It never moves funds."
      )
    )
  })

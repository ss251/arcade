/** Keyless guarded resolution check for one ARCADE ENS name via the buyer's own policy reader. */
import { sepoliaEnsReader, EnsNameExpired } from "../packages/buyer/src/ens-policy.ts"
import { resolveEnsListingPromise } from "../packages/buyer/src/index.ts"

const name = process.argv[2] ?? "usdc-flow-check.scf821769ed.arcade.eth"
const reader = sepoliaEnsReader({ env: {
  ARCADE_ENS_ROOT: "arcade.eth",
  ARCADE_ENS_UNIVERSAL_RESOLVER: "0x6d80f2172cfdec5730fe683860c33d26fc42e6f1",
  ARCADE_ENS_RPC: "https://ethereum-sepolia-rpc.publicnode.com",
} })
try {
  const r = await resolveEnsListingPromise(reader, name)
  console.log(JSON.stringify({ name, resolved: true, ...r }, (_k, v) => typeof v === "bigint" ? v.toString() : v, 1))
} catch (e) {
  console.log(JSON.stringify({ name, resolved: false, error: e instanceof EnsNameExpired ? "EnsNameExpired" : String((e as Error)?.message ?? e).slice(0, 300) }))
  process.exit(2)
}

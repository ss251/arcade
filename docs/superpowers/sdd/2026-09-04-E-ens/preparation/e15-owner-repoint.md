> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E15 — owner-updatable records and production re-point

Private preparation, 2026-09-05. Source audit and offline syntax/import checks only; no key retrieval, RPC, transaction, provider call or service was performed. Root owns the published runbook and OWNER entry. The local demonstration is now explicitly approved, conditional on retained owner control, honest temporary URLs, a documented production re-point and independent public reads after cleanup.

## Retained authority: what can actually be proved

- `scripts/ens-setup.ts:255–258` initializes both UserRegistry proxies and PermissionedResolver with the namespace owner and exact `ALL_ROLES = 0x111…111`; the resolver starts with an empty controller list. `verifyProxy` at211–213 checks the owner-bound factory salt/implementation and raw `roles(0, owner) === ALL_ROLES`.
- `packages/core/src/ens.ts:77–94` includes root SET_TEXT16 and its admin bit in ALL_ROLES, as well as registry RENEW65536 and its admin bit. The owner is distinct from the seller and daemon. Root resolver permission covers every `setText` key, not only the seven named application keys: endpoint, payTo, chain, priceAtomic, web, context, optional MCP and optional dynamic `agent-registration[…]` remain editable.
- The previously read pinned PermissionedResolver/EnhancedAccessControl sources at `97a57293f3b4279d94b571e678edb53ce62638f4` establish that `onlyPartRoles` falls back to effective name/root roles. Exact source references and prior full-read verification are in `internal/task-preparation/e14-ens-demo.md`; no new external source fetch was made for this note.
- `scripts/ens-setup-skills.ts:156–194` grants the daemon only per-name RENEW and per-name/per-key price SET_TEXT. It asserts absent root/wildcard and all other known-key roles. `scripts/ens-demo.ts:224–230` revokes only `authorizeTextRoles(dnsNameOf(name), "arcade.priceAtomic", daemon, false)`. It neither revokes owner roles nor clears records.
- No executed setup/demo call uses `revokeRootRoles`, owner transfer, proxy upgrade or an irreversible pointer lock. ABI declarations of these functions are not invocations. Non-transferable seller subnames do not revoke namespace-owner root administration.

After cleanup, the supervisor must use new public Sepolia reads—not cached setup results—to record: chain11155111; pinned factory/current implementations for all three proxies; raw `roles(0, owner) === ALL_ROLES` and `roles(0, daemon) === 0` on each; current parent owner/mount pointers; leaf token/latestOwner/resource/expiry/current owner; and every text key/value actually written. Bounded same-value `setText` simulations as the public owner for each written key additionally prove current write permission without signing. Root roles are independent of leaf expiry: an expired leaf's current owner is zero while the resolver owner's root authority persists. Read failures mean unverified, never immutable or expired.

## Exact production re-point template — one owner multicall, not a deployment

Prerequisites: deploy/verify the production hub and web separately; they must already serve the same seller's real `usdc-flow-check` at the canonical V2 payout. Stop competing owner record writers. Select the existing state and one dedicated journal path; never substitute a fresh journal to bypass an uncertain prior attempt. The command is deliberately scoped to the local demo's one skill, with no MCP/agent-registration addition. It permits the retained leaf to be live or expired: **text-only re-pointing never revives it**. This command does not start services, deploy contracts, register names, transfer ownership, restore price, regrant daemon roles or change payout/chain.

Replace every public placeholder, including the retained local origin. Read only `arcade-ens-owner` inside the consuming shell; no daemon, seller, buyer or facilitator key is needed. Run from main only after the E implementation is merged. Keep the exact same parameters and journal for reconciliation; an error after signing is not permission to retry with new coordinates.

Historical command (not current operator instructions):
```text
env -i PATH="$PATH" \
  ARCADE_ENS_STATE='<existing-absolute-state-path>.json' \
  ARCADE_ENS_REPOINT_JOURNAL='<dedicated-absolute-owner-repoint-journal>.json' \
  ARCADE_ENS_REPOINT_NAME='usdc-flow-check.scf821769ed.arcade.eth' \
  ARCADE_ENS_EXPECTED_OLD_ORIGIN='http://127.0.0.1:<retained-demo-port>' \
  ARCADE_ENS_PRODUCTION_HUB='https://<actual-production-hub-host>' \
  ARCADE_ENS_PRODUCTION_WEB='https://<actual-production-web-host>' \
  ARCADE_ENS_RPC=https://ethereum-sepolia-rpc.publicnode.com \
  /bin/bash --noprofile --norc <<'SH'
set +x
set -euo pipefail
cd <REPOSITORY_ROOT>
ARCADE_ENS_OWNER_KEY="$(/usr/bin/security find-generic-password -s arcade-ens-owner -w)"
export ARCADE_ENS_OWNER_KEY
exec bun --no-env-file - <<'JS'
import { resolve } from "node:path";
import { encodeFunctionData, keccak256, parseAbi, stringToHex } from "viem";
import { namehash } from "viem/ens";
import { privateKeyToAccount } from "viem/accounts";
import { ALL_ROLES, ENS_TEXT_KEYS, PERMISSIONED_RESOLVER_ABI, VERIFIABLE_FACTORY_ABI, loadEnsDeployments, skillTextRecords } from "@arcade/core";
import { ensStatePath, readEnsState } from "./packages/runner/src/ens-state.ts";
import { ensJournalPath } from "./packages/runner/src/ens-journal.ts";
import { parseSetupArgs } from "./scripts/ens-setup.ts";
import { setupPublicClient } from "./scripts/ens-setup-runtime.ts";
import { prepareSkillRecords } from "./scripts/ens-setup-skills.ts";
import { openSetupSession } from "./scripts/ens-setup-driver.ts";
import { demoObservation, demoPublicClient } from "./scripts/ens-demo.ts";
import { EnsNameExpired, resolveEnsListingPromise, sepoliaEnsReader } from "@arcade/buyer";
const check = value => { if (!value) throw Error("owner re-point refused"); };
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
let session, observer, closingSession, closing, cancelled = false;
const closeSession = () => {
  if (!session) return Promise.resolve();
  if (closingSession === session && closing) return closing;
  closingSession = session; closing = Promise.resolve().then(() => session.close()); return closing;
};
const cancel = () => { cancelled = true; observer?.close(); void closeSession().catch(() => {}); };
const timer = setTimeout(cancel, 300000);
process.once("SIGTERM", cancel); process.once("SIGINT", cancel);
const fetcher = request => { check(!cancelled); return fetch(request); };
try {
  const path = ensStatePath(), state = await readEnsState(path);
  check(state?.root === "arcade.eth" && state.owner && state.daemon);
  const name = process.env.ARCADE_ENS_REPOINT_NAME, skill = state.skills.find(s => s.name === name);
  check(skill?.skillId === "usdc-flow-check" && name.length < 220);
  const hub = new URL(process.env.ARCADE_ENS_PRODUCTION_HUB), web = new URL(process.env.ARCADE_ENS_PRODUCTION_WEB);
  check([hub, web].every(u => u.protocol === "https:" && u.pathname === "/" && !u.username && !u.password && !u.search && !u.hash));
  const old = new URL(process.env.ARCADE_ENS_EXPECTED_OLD_ORIGIN);
  check(old.protocol === "http:" && old.hostname === "127.0.0.1" && old.port && old.pathname === "/" && !old.username && !old.password && !old.search && !old.hash);
  const args = parseSetupArgs(["--seller", state.seller, "--owner", state.owner, "--daemon", state.daemon, "--skills", skill.skillId,
    "--root-label", "arcade", "--confirm-root-label", "arcade", "--seller-label", state.sellerLabel, "--ttl", `${state.ttlSeconds}s`, "--hub", hub.origin, "--web", web.origin]);
  const plans = await prepareSkillRecords(args, state.root, fetcher), plan = plans[0];
  check(plans.length === 1 && plan.name === name);
  const rpc = process.env.ARCADE_ENS_RPC, pub = setupPublicClient(rpc, fetcher), deployment = loadEnsDeployments().find(d => d.set === state.deploymentSet);
  check(deployment && await pub.getChainId() === 11155111);
  observer = demoPublicClient(rpc, fetcher);
  const snapshot = await demoObservation(state, name, observer).snapshot();
  check(same(snapshot.latestOwner,state.seller) && (snapshot.status === 2 && snapshot.expiry > snapshot.timestamp && same(snapshot.owner,state.seller) ||
    snapshot.status === 0 && snapshot.expiry <= snapshot.timestamp && /^0x0{40}$/i.test(snapshot.owner)));
  const rolesAbi = parseAbi(["function roles(uint256 resource,address account) view returns(uint256)"]);
  for (const [proxy, implementation] of [[state.sellerRegistry, deployment.userRegistryImpl], [state.skillRegistry, deployment.userRegistryImpl], [state.resolver, deployment.permissionedResolverImpl]]) {
    check(same(await pub.readContract({address:deployment.verifiableFactory, abi:VERIFIABLE_FACTORY_ABI, functionName:"verifyContract", args:[proxy]}), implementation));
    check(await pub.readContract({address:proxy, abi:rolesAbi, functionName:"roles", args:[0n,state.owner]}) === ALL_ROLES);
  }
  const node = namehash(name), text = key => pub.readContract({address:state.resolver, abi:PERMISSIONED_RESOLVER_ABI, functionName:"text", args:[node,key]});
  const before = Object.fromEntries(await Promise.all(Object.values(ENS_TEXT_KEYS).map(async key => [key, await text(key)])));
  const proposed = Object.fromEntries(plan.records.map(r => [r.key,r.value]));
  check(same(before[ENS_TEXT_KEYS.payTo], proposed[ENS_TEXT_KEYS.payTo]) && before[ENS_TEXT_KEYS.chain] === proposed[ENS_TEXT_KEYS.chain]);
  check(before[ENS_TEXT_KEYS.endpoint] === `${old.origin}/x/${state.seller}/${skill.skillId}` || before[ENS_TEXT_KEYS.endpoint] === proposed[ENS_TEXT_KEYS.endpoint]);
  check(before[ENS_TEXT_KEYS.web] === `${old.origin}/skill/${skill.skillId}` || before[ENS_TEXT_KEYS.web] === proposed[ENS_TEXT_KEYS.web]);
  check(before[ENS_TEXT_KEYS.mcp] === "");
  const currentPrice = before[ENS_TEXT_KEYS.priceAtomic];
  check(/^(0|[1-9][0-9]{0,77})$/.test(currentPrice));
  const context = proposed[ENS_TEXT_KEYS.context].split("\n\n")[0];
  check(before[ENS_TEXT_KEYS.context].startsWith(`${context}\n\n`));
  const records = skillTextRecords({name, endpoint:proposed[ENS_TEXT_KEYS.endpoint], webUrl:proposed[ENS_TEXT_KEYS.web],
    payTo:before[ENS_TEXT_KEYS.payTo], caip2:before[ENS_TEXT_KEYS.chain], priceAtomic:BigInt(currentPrice), context});
  const updates = records.filter(r => [ENS_TEXT_KEYS.endpoint, ENS_TEXT_KEYS.web, ENS_TEXT_KEYS.context].includes(r.key));
  check(updates.length === 3);
  const call = {address:state.resolver, abi:PERMISSIONED_RESOLVER_ABI, functionName:"multicall", args:[updates.map(r => encodeFunctionData({abi:PERMISSIONED_RESOLVER_ABI, functionName:"setText", args:[node,r.key,r.value]}))]};
  const journal = resolve(process.env.ARCADE_ENS_REPOINT_JOURNAL);
  check(![path, `${path}.setup.json`, ensJournalPath(process.env), `${path}.demo.json`, `${path}.demo-daemon.json`].map(p => resolve(p)).includes(journal));
  const binding = keccak256(stringToHex(JSON.stringify({format:"owner-repoint-v1",state,name,old:old.origin,updates})));
  check(!cancelled);
  const ownerKey = process.env.ARCADE_ENS_OWNER_KEY;
  check(/^0x[0-9a-fA-F]{64}$/.test(ownerKey) && same(privateKeyToAccount(ownerKey).address,state.owner));
  session = await openSetupSession({path:journal,privateKey:ownerKey,rpcUrl:rpc,binding,root:state.root,owner:state.owner,seller:state.seller,daemon:state.daemon,
    ttlSeconds:state.ttlSeconds,sellerTtlSeconds:state.ttlSeconds,fetch:fetcher});
  check(!cancelled);
  const step = `owner-repoint:${name}`, metadata = {name,resolver:state.resolver,hub:hub.origin,web:web.origin};
  await session.driver.simulate(call);
  await session.driver.checkpoint({step,state:"intent",metadata});
  const txHash = await session.driver.send(step,call);
  await session.driver.checkpoint({step,state:"confirmed",txHash,metadata});
  for (const [key,value] of Object.entries(before)) check(await text(key) === (updates.find(r => r.key === key)?.value ?? value));
  const afterSnapshot = await demoObservation(state,name,observer).snapshot();
  check(afterSnapshot.tokenId === snapshot.tokenId && same(afterSnapshot.latestOwner,snapshot.latestOwner));
  const resolutionExpectedAbsent = afterSnapshot.status === 0 && afterSnapshot.expiry <= afterSnapshot.timestamp && /^0x0{40}$/i.test(afterSnapshot.owner);
  if (!resolutionExpectedAbsent) check(afterSnapshot.status === 2 && afterSnapshot.expiry > afterSnapshot.timestamp && same(afterSnapshot.owner,state.seller));
  const reader = sepoliaEnsReader({env:{ARCADE_ENS_ROOT:state.root,ARCADE_ENS_UNIVERSAL_RESOLVER:state.universalResolver,ARCADE_ENS_RPC:rpc},fetch:fetcher});
  if (resolutionExpectedAbsent) {
    let absent = false;
    try { await resolveEnsListingPromise(reader,name); } catch (error) { if (error instanceof EnsNameExpired) absent = true; else throw error; }
    check(absent);
  } else {
    const resolved = await resolveEnsListingPromise(reader,name);
    check(resolved.endpoint === proposed[ENS_TEXT_KEYS.endpoint] && same(resolved.payTo,before[ENS_TEXT_KEYS.payTo]) && resolved.chainCaip2 === before[ENS_TEXT_KEYS.chain]);
  }
  for (const proxy of [state.sellerRegistry,state.skillRegistry,state.resolver]) check(await pub.readContract({address:proxy,abi:rolesAbi,functionName:"roles",args:[0n,state.owner]}) === ALL_ROLES);
  check(!cancelled);
  await closeSession(); observer.close(); check(!cancelled);
  console.log(JSON.stringify({name,txHash,changedKeys:updates.map(r=>r.key),pricePreserved:currentPrice,endpoint:proposed[ENS_TEXT_KEYS.endpoint],resolutionExpectedAbsent}));
} catch { console.error("Owner re-point not proved; inspect the retained journal and chain before any retry. No automatic resend."); process.exitCode = 1; }
finally { clearTimeout(timer); process.removeListener("SIGTERM",cancel); process.removeListener("SIGINT",cancel); observer?.close(); try { await closeSession(); } catch { console.error("Owner journal cleanup requires reconciliation."); process.exitCode = 1; } }
JS
SH
```

The command atomically updates only endpoint, web and the context JSON's routing facts. It preserves the current price (including a deliberately bumped demo price), payee, chain, optional identity records, ownership and grants. A current MCP record refuses this narrow command rather than leaving a stale local MCP claim. An existing ERC-8004 registration URI is a separate registry field and is not rewritten by this ENS operation. A production web URL must be independently verified to serve before invocation; setup preflight validates its shape, not its HTML.

## Expiry and recovery are separate operations

Re-pointing text is not renewal. An expired leaf's resolver records remain owner-editable via root SET_TEXT, but guarded ENS resolution remains absent. The runnable command verifies the changed raw records and owner/root authority, checks the unchanged token/latestOwner and returns `resolutionExpectedAbsent:true` only when chain state and typed guarded-name absence both agree. It does not call that a live endpoint. For the same retained registration, an explicitly approved owner/root-RENEW call would be `skillRegistry.renew(labelId(skill.label), <fixed-approved-future-expiry>)`, using the existing driver with a **different recovery journal and binding** and the intent→send→confirmed→readback discipline above. This is a separate future operation, not part of the executable re-point command. Verify owner root RENEW, retained token/latestOwner against the demo proof, live parents, and a fixed future expiry on actual Sepolia time. Do not unregister/register/transfer or grant daemon root RENEW. Recheck per-name daemon roles after revival; restore only the exact scoped grant if absent and separately approved.

Price recovery is also separate: owner `setText(namehash(name), "arcade.priceAtomic", "10000")`, confirm direct/hardened readback, then `authorizeTextRoles(dnsNameOf(name), "arcade.priceAtomic", daemon, true)` only if explicitly approved. The former price-lock journal is not reused for these opposite operations. Setup's original expiry/record binding means rerunning setup is not a migration or recovery command. No recovery transaction is implied by this note's existence.

## Evidence/ownership review handoff

All run-local URLs are intentionally temporary and stop serving after cleanup. The production host has not been selected/deployed by this command draft; root must leave a pending OWNER production-origin/re-point entry. Public evidence can state that the owner retained update authority only after the independent raw-role/simulation checks above succeed. Preserve private setup commitment secrets, journals, locks and SQLite separately; do not upload them with public proof. The private supervisor's actual post-cleanup path was read independently: it performs fresh same-height proxy/parent/raw-role checks and same-value owner simulations for every written record. A separate buyer long-poll timeout finding was sent to its owner and corrected with a genuine failing regression before implementation. Full source re-review is CLEAN; the frozen private suite was independently rerun with `env -i` / `--no-env-file`: 11 tests, 69 assertions passed, zero failures. This was an offline run only, including dummy transport and key-free help/invalid CLI subprocesses; no live phase or chain proof was executed by this reviewer.

Offline command verification completed 2026-09-05: 38 assertions passed. The exact Bash block passed `bash -n`; its embedded JavaScript passed `Bun.Transpiler`. Only extracted pure validation fragments ran: five journal-collision refusals, production URL refusals, retained live/expired-leaf checks, real ABI encoding/decoding of exactly `arcade.endpoint`, `agent-endpoint[web]`, and `agent-context`, preservation of the actual 11000 atomic price, and shared session-close promise identity. All imported runtime exports exist and import safely with a throwing global fetch; zero fetch calls occurred. The whole command, Keychain expression, session opener and payment/transaction paths were never executed. A former `.map(resolve)` callback error was reproduced after its correction, so this is reproduction/coverage, **not Red-before-implementation TDD**. Two test-harness-only mistakes (missing fake state argument and a guessed web-key literal) were corrected before the final 38-assertion pass. No live re-point or recovery is claimed. This private command draft is frozen for root's final runbook review.

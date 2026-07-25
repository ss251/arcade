// G-1b LIVE — rate-limit-aware. Arc's public RPC returns -32011 "request limit
// reached" under viem's default aggressive receipt polling, so every wait here is
// a manual loop with backoff and a single eth_getTransactionReceipt per tick.
//
// 7a: plain native USDC transfer (A -> B)   [may already be confirmed from a prior run]
// 7b: EIP-3009 transferWithAuthorization    (A signs offline, B broadcasts, A pays ZERO gas)

import {
  createPublicClient, createWalletClient, http,
  encodeFunctionData, keccak256, toHex, formatUnits, formatEther,
} from "viem";
import { arcTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";

const RPC = "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000" as const;
const PRIOR_TX = process.env.PRIOR_TX as `0x${string}` | undefined;

const keys = JSON.parse(readFileSync(new URL("./throwaway-keys.json", import.meta.url), "utf-8"));
const A = privateKeyToAccount(keys.keyA.privateKey);
const B = privateKeyToAccount(keys.keyB.privateKey);

const pub = createPublicClient({ chain: arcTestnet, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });
const walletA = createWalletClient({ account: A, chain: arcTestnet, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });
const walletB = createWalletClient({ account: B, chain: arcTestnet, transport: http(RPC, { retryCount: 5, retryDelay: 2000 }) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One receipt call per tick, 1.5s apart — gentle enough for the public RPC.
async function waitReceipt(hash: `0x${string}`, label: string) {
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) {
    try {
      const r = await pub.getTransactionReceipt({ hash });
      if (r) return { r, ms: Date.now() - t0 };
    } catch (e: any) {
      const m = String(e?.message ?? e);
      if (!m.includes("could not be found") && !m.includes("request limit")) throw e;
    }
    await sleep(1500);
  }
  throw new Error(`${label}: receipt timeout for ${hash}`);
}

function report(tag: string, r: any, ms: number) {
  const cost = r.gasUsed * r.effectiveGasPrice;
  console.log(`${tag} status=${r.status} block=${r.blockNumber} confirmMs=${ms}`);
  console.log(`${tag} gasUsed=${r.gasUsed} gasCostUSDC=${formatEther(cost)}`);
  console.log(`${tag} explorer=https://testnet.arcscan.app/tx/${r.transactionHash}`);
}

async function main() {
  console.log("A:", A.address);
  console.log("B:", B.address);
  console.log("A native balance (18-dec USDC):", formatEther(await pub.getBalance({ address: A.address })));
  await sleep(500);
  console.log("B native balance (18-dec USDC):", formatEther(await pub.getBalance({ address: B.address })));

  // ---- 7a ----
  console.log("\n=== 7a: plain native USDC transfer (A -> B) ===");
  let hashA = PRIOR_TX;
  if (hashA) {
    console.log("reusing prior submitted tx:", hashA);
  } else {
    hashA = await walletA.sendTransaction({ to: B.address, value: 100000000000000n }); // 0.0001
    console.log("submitted:", hashA);
  }
  const a = await waitReceipt(hashA, "7a");
  report("7a", a.r, a.ms);

  await sleep(1500);

  // ---- 7b: EIP-3009 ----
  console.log("\n=== 7b: EIP-3009 transferWithAuthorization (A signs offline, B broadcasts) ===");
  const domain = { name: "USDC", version: "2", chainId: 5042002, verifyingContract: USDC };
  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ],
  } as const;
  const nonce = keccak256(toHex(`g1-live-${Date.now()}`));
  const message = {
    from: A.address, to: B.address,
    value: 1000n,                    // 0.001 USDC in 6-dec ERC-20 units
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
    nonce,
  };

  const tSign = Date.now();
  const sig = await A.signTypedData({ domain, types, primaryType: "TransferWithAuthorization", message });
  console.log("offline signature produced in", Date.now() - tSign, "ms (no chain interaction)");

  const r_ = sig.slice(0, 66) as `0x${string}`;
  const s_ = ("0x" + sig.slice(66, 130)) as `0x${string}`;
  const v_ = parseInt(sig.slice(130, 132), 16);

  const data = encodeFunctionData({
    abi: [{
      type: "function", name: "transferWithAuthorization", stateMutability: "nonpayable",
      inputs: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
        { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" },
      ], outputs: [],
    }],
    functionName: "transferWithAuthorization",
    args: [A.address, B.address, message.value, message.validAfter, message.validBefore, nonce, v_, r_, s_],
  });

  const tSubmit = Date.now();
  const hashB = await walletB.sendTransaction({ to: USDC, data });
  console.log("submitted by B:", hashB);
  const b = await waitReceipt(hashB, "7b");
  report("7b", b.r, b.ms);
  console.log("7b end-to-end (submit -> confirmed) ms:", Date.now() - tSubmit);
  console.log("7b USDC moved from A:", formatUnits(message.value, 6), "— A paid ZERO gas (B sponsored it)");
}

main().catch((e) => { console.error("FATAL", e?.shortMessage ?? e?.message ?? e); process.exit(1); });

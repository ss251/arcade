/** Exact 142e669c1fd318486a4628395b629f033654dd06 ABI subset; no clients or keys. */
import { parseAbi } from "viem"
export const ERC8183_ABI = parseAbi([
  "struct Job { address client; uint8 status; address provider; uint48 expiredAt; address evaluator; uint48 submittedAt; uint256 budget; address hook; address paymentToken; uint256 providerAgentId; string description; uint256 settledAmount; address payoutReceiver; }",
  "struct Authorization { address signer; uint72 nonce; uint256 deadline; bytes sig; }",
  "function getJob(uint256 jobId) view returns (Job)",
  "function jobCounter() view returns (uint256)",
  "function pendingClaimHash(uint256 jobId) view returns (bytes32)",
  "function authorizationNonceUsed(bytes32 nonce) view returns (bool)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function paused() view returns (bool)",
  "function platformFeeBP() view returns (uint256)",
  "function evaluatorFeeBP() view returns (uint256)",
  "function platformTreasury() view returns (address)",
  "function allowedPaymentTokens(address token) view returns (bool)",
  "function whitelistedHooks(address hook) view returns (bool)",
  "function createJob(address provider,address evaluator,uint48 expiredAt,string description,address hook,uint256 providerAgentId) returns (uint256)",
  "function setBudgetWithAuthorization(uint256 jobId,address token,uint256 amount,bytes optParams,Authorization auth)",
  "function submitWithAuthorization(uint256 jobId,bytes32 deliverable,bytes optParams,Authorization auth)",
  "function fund(uint256 jobId,address expectedToken,uint256 expectedBudget,bytes optParams)",
  "function complete(uint256 jobId,bytes32 reason,bytes optParams)",
  "function reject(uint256 jobId,bytes32 reason,bytes optParams)",
  "function claimRefund(uint256 jobId)",
  "event JobCreated(uint256 indexed jobId,address indexed client,address indexed provider,address evaluator,uint48 expiredAt,address hook)",
  "event BudgetSet(uint256 indexed jobId,address indexed token,uint256 amount)",
  "event JobFunded(uint256 indexed jobId,address indexed client,uint256 amount)",
  "event JobSubmitted(uint256 indexed jobId,address indexed provider,bytes32 deliverable)",
  "event JobCompleted(uint256 indexed jobId,address indexed evaluator,bytes32 reason)",
  "event JobRejected(uint256 indexed jobId,address indexed rejector,bytes32 reason)",
  "event Refunded(uint256 indexed jobId,address indexed client,uint256 amount)",
  "event PaymentReleased(uint256 indexed jobId,address indexed recipient,uint256 amount)",
  "event PlatformFeePaid(uint256 indexed jobId,address indexed treasury,uint256 amount)",
  "event AuthorizationUsed(address indexed signer,bytes32 indexed nonce)"
])
export const ARCADE_JOB_HOOK_ABI = parseAbi([
  "function escrow() view returns (address)",
  "function evaluator() view returns (address)",
  "event ArcadeSettled(uint256 indexed jobId,bytes32 treeHash,uint32 childCount,uint256 childTotalAtomic,bytes32 receiptHash)",
  "event ArcadeRefused(uint256 indexed jobId,bytes32 reason)"
])

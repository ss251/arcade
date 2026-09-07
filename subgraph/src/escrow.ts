import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import { EscrowEvent, EscrowJob } from "../generated/schema"
import { ARC_CHAIN_ID } from "./ids"
import { begin, binding, bytes, jobKey, known, nonzero, unsigned } from "./escrow-events"
import { JobCreated, ProviderSet, PayoutReceiverSet, BudgetSet, JobFunded, JobSubmitted,
  JobCompleted, JobRejected, JobExpired, PaymentReleased, PlatformFeePaid, EvaluatorFeePaid,
  Refunded, Settled } from "../generated/templates/ERC8183/ERC8183"

function save(record: EscrowEvent): void {
  const job = known(record)
  if (job != null) {
    if (record.kind == "partial_settled" || record.kind == "refunded" || record.kind == "evaluator_fee_paid") job.closureEligible = false
    job.save()
  }
  record.save()
}

export function handleJobCompleted(event: JobCompleted): void {
  const p = event.params; bytes(p.evaluator, 20); bytes(p.reason, 32)
  const record = begin(event, "job_completed", p.jobId); if (record == null) return
  record.actor = p.evaluator; record.hash = p.reason; status(record, "COMPLETED")
}

export function handleJobRejected(event: JobRejected): void {
  const p = event.params; bytes(p.rejector, 20); bytes(p.reason, 32)
  const record = begin(event, "job_rejected", p.jobId); if (record == null) return
  record.actor = p.rejector; record.hash = p.reason; status(record, "REJECTED")
}

export function handleJobExpired(event: JobExpired): void {
  const record = begin(event, "job_expired", event.params.jobId); if (record == null) return
  status(record, "EXPIRED")
}

export function handlePaymentReleased(event: PaymentReleased): void {
  const p = event.params; bytes(p.recipient, 20); unsigned(p.amount)
  const record = begin(event, "payment_released", p.jobId); if (record == null) return
  record.actor = p.recipient; record.amountAtomic = p.amount; save(record)
}

export function handlePlatformFeePaid(event: PlatformFeePaid): void {
  const p = event.params; bytes(p.platformTreasury, 20); unsigned(p.amount)
  const record = begin(event, "platform_fee_paid", p.jobId); if (record == null) return
  record.actor = p.platformTreasury; record.amountAtomic = p.amount; save(record)
}

export function handleEvaluatorFeePaid(event: EvaluatorFeePaid): void {
  const p = event.params; bytes(p.evaluator, 20); unsigned(p.amount)
  const record = begin(event, "evaluator_fee_paid", p.jobId); if (record == null) return
  record.actor = p.evaluator; record.amountAtomic = p.amount; save(record)
}

export function handleRefunded(event: Refunded): void {
  const p = event.params; bytes(p.client, 20); unsigned(p.amount)
  const record = begin(event, "refunded", p.jobId); if (record == null) return
  record.actor = p.client; record.amountAtomic = p.amount; save(record)
}

export function handleSettled(event: Settled): void {
  const p = event.params; unsigned(p.cumulativeAmount); unsigned(p.delta)
  const record = begin(event, "partial_settled", p.jobId); if (record == null) return
  record.cumulativeAtomic = p.cumulativeAmount; record.amountAtomic = p.delta; save(record)
}
function status(record: EscrowEvent, value: string): void {
  const job = known(record)
  if (job != null) {
    if (value != "COMPLETED" || job.status != "SUBMITTED") job.closureEligible = false
    job.status = value; job.save()
  }
  record.save()
}
export function handleJobCreated(event: JobCreated): void {
  const p = event.params
  bytes(p.client, 20); bytes(p.provider, 20); bytes(p.evaluator, 20); bytes(p.hook, 20)
  unsigned(p.expiredAt, BigInt.fromString("281474976710655"))
  const record = begin(event, "job_created", p.jobId)
  if (record == null) return
  record.actor = p.client
  const pins = binding()!
  if (p.hook.equals(pins.hook) && p.evaluator.equals(pins.evaluator) && nonzero(p.client) && nonzero(p.provider)) {
    const key = jobKey(pins.proxy, p.jobId)
    assert(EscrowJob.load(key) == null, "Duplicate escrow creation")
    const job = new EscrowJob(key)
    job.chainId = ARC_CHAIN_ID; job.escrow = pins.proxy; job.jobId = p.jobId
    job.client = p.client; job.provider = p.provider; job.evaluator = p.evaluator; job.hook = p.hook
    job.expiredAt = p.expiredAt; job.status = "OPEN"
    job.closureEligible = false
    job.createdBlock = record.blockNumber; job.createdAt = record.timestamp; job.createdTxHash = record.txHash
    job.updatedBlock = record.blockNumber; job.updatedAt = record.timestamp; job.updatedLogIndex = record.logIndex
    job.save(); record.job = key
  }
  record.save()
}
export function handleProviderSet(event: ProviderSet): void {
  const p = event.params; bytes(p.provider, 20); unsigned(p.agentId)
  const record = begin(event, "provider_set", p.jobId); if (record == null) return
  record.actor = p.provider; record.agentId = p.agentId
  const job = known(record)
  if (job != null) {
    if (job.status != "OPEN") job.closureEligible = false
    job.provider = p.provider; job.save()
  }
  record.save()
}
export function handlePayoutReceiverSet(event: PayoutReceiverSet): void {
  const p = event.params; bytes(p.payoutReceiver, 20)
  const record = begin(event, "payout_receiver_set", p.jobId); if (record == null) return
  record.actor = p.payoutReceiver; save(record)
}
export function handleBudgetSet(event: BudgetSet): void {
  const p = event.params; bytes(p.token, 20); unsigned(p.amount)
  const record = begin(event, "budget_set", p.jobId); if (record == null) return
  record.token = p.token; record.amountAtomic = p.amount
  const job = known(record)
  if (job != null) {
    job.closureEligible = false
    job.paymentToken = p.token; job.budgetAtomic = p.amount; job.save()
  }
  record.save()
}
export function handleJobFunded(event: JobFunded): void {
  const p = event.params; bytes(p.client, 20); unsigned(p.amount)
  const record = begin(event, "job_funded", p.jobId); if (record == null) return
  record.actor = p.client; record.amountAtomic = p.amount
  const job = known(record)
  if (job != null) {
    const token = job.paymentToken, budget = job.budgetAtomic
    job.closureEligible = job.status == "OPEN" && job.fundedAtomic === null && token !== null && budget !== null &&
      token.equals(Bytes.fromHexString("0x3600000000000000000000000000000000000000")) && budget.equals(p.amount) &&
      p.amount.gt(BigInt.zero()) && p.client.equals(job.client)
    job.fundedAtomic = p.amount; job.fundedAt = record.timestamp; job.fundTx = record.txHash
    job.status = "FUNDED"; job.save()
  }
  record.save()
}
export function handleJobSubmitted(event: JobSubmitted): void {
  const p = event.params; bytes(p.provider, 20); bytes(p.deliverable, 32)
  const record = begin(event, "job_submitted", p.jobId); if (record == null) return
  record.actor = p.provider; record.hash = p.deliverable
  const job = known(record)
  if (job != null) {
    job.closureEligible = job.closureEligible && job.status == "FUNDED" && p.provider.equals(job.provider)
    job.deliverable = p.deliverable; job.status = "SUBMITTED"; job.save()
  }
  record.save()
}

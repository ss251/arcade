import { describe, expect, it } from "vitest"
import { Bounds, PublicListing, HEARTBEAT_INTERVAL_MS, HEARTBEAT_MISS_LIMIT, docBytes, loadChainConfig } from "@arcade/core"
import { agentRegistrationFor } from "../src/agent-registration.ts"
import type { ListingRecord, RunnerRecord } from "../src/store.ts"

const SELLER = "0x1111111111111111111111111111111111111111"
const NOW = 1_760_000_000_000
const listing = PublicListing.make({ id: "metadata-test", version: "1.0.0", serviceName: "Metadata test",
  description: "Public listing description", tags: [], price: "$0.01", bounds: Bounds.make({ timeoutSec: 5 }),
  inputSchema: { type: "object" }, outputSchema: { type: "object" } })
const rec = (over: Partial<ListingRecord> = {}): ListingRecord => ({ listing, seller: SELLER, runnerId: "rnr_metadata",
  publishedAtMs: NOW - 1000, ...over })
const runner = (over: Partial<RunnerRecord> = {}): RunnerRecord => ({ runnerId: "rnr_metadata", seller: SELLER,
  skillIds: [listing.id], maxConcurrency: 2, connectedAtMs: NOW - 1000, lastSeenMs: NOW,
  activeJobs: 0, ...over })
const base = { origin: "https://hub.example", chainId: 5042002,
  identityRegistry: loadChainConfig("arc-testnet").erc8004!.identity, nowMs: NOW }
const registration = (record = rec(), current: RunnerRecord | undefined = runner()) =>
  agentRegistrationFor({ ...base, rec: record, runner: current })

describe("listing registration metadata", () => {
  it("advertises only real routes with current standard fields and aliases", () => {
    const doc = registration()
    expect(doc.active).toBe(true)
    expect(doc.type).toBe("https://eips.ethereum.org/EIPS/eip-8004#registration-v1")
    expect(doc.services).toEqual(doc.endpoints)
    expect(doc.services.map(e => e.endpoint)).toEqual([`https://hub.example/x/${SELLER}/metadata-test`,
      "https://hub.example/openapi.json", "https://hub.example/skill/metadata-test"])
    expect(doc.supportedTrust).toEqual(["arcade-validation"])
    expect(doc.supportedTrusts).toEqual(doc.supportedTrust)
    expect(docBytes(doc)).not.toMatch(/\/mcp|"image"/)
  })
  it("passes a known agent id and ENS name but never invents either", () => {
    expect(registration().registrations).toEqual([])
    expect(registration().ens).toBeUndefined()
    const doc = registration(rec({ agentId: "42", ensName: "metadata.arcade.eth" }))
    expect(doc.registrations).toEqual([{ agentId: "42", agentRegistry: `eip155:5042002:${base.identityRegistry}` }])
    expect(doc.ens).toBe("metadata.arcade.eth")
  })
  it("uses the strict heartbeat expiry boundary", () => {
    const ttl = HEARTBEAT_INTERVAL_MS * HEARTBEAT_MISS_LIMIT
    expect(registration(rec(), runner({ lastSeenMs: NOW - ttl + 1 })).active).toBe(true)
    expect(registration(rec(), runner({ lastSeenMs: NOW - ttl })).active).toBe(false)
    expect(registration(rec(), runner({ lastSeenMs: NOW - ttl - 1 })).active).toBe(false)
  })
  it("is inactive without the runner and while canary-delisted", () => {
    expect(agentRegistrationFor({ ...base, rec: rec(), runner: undefined }).active).toBe(false)
    expect(registration(rec({ delisted: true })).active).toBe(false)
    expect(registration(rec({ delisted: false })).active).toBe(true)
  })
  it.each([{ runnerId: "rnr_other" }, { seller: "0x2222222222222222222222222222222222222222" },
    { skillIds: ["other-listing"] }, { lastSeenMs: NOW + 1 }, { lastSeenMs: NaN }, { lastSeenMs: Infinity }])(
    "cannot borrow liveness from an unrelated or invalid runner", over => {
      expect(registration(rec(), runner(over)).active).toBe(false)
    })
  it("compares seller addresses case-insensitively", () => {
    const seller = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
    expect(registration(rec({ seller }), runner({ seller: seller.toUpperCase().replace("0X", "0x") })).active).toBe(true)
  })
  it("does not publish internal listing/runner state or private extra fields", () => {
    const record = { ...rec({ agentId: "42", registrationTx: `0x${"a".repeat(64)}`, agentVerified: true }),
      private: "PRIVATE_LISTING", engine: { systemPrompt: "PRIVATE_PROMPT" } }
    const current = { ...runner(), secrets: "PRIVATE_RUNNER" }
    const doc = agentRegistrationFor({ ...base, rec: record, runner: current })
    const flat = docBytes(doc)
    expect(flat).not.toMatch(/PRIVATE|runnerId|registrationTx|agentVerified|publishedAtMs|lastSeenMs|engine|secrets|systemPrompt/)
    expect(Object.getOwnPropertyDescriptor(doc, "input")?.enumerable).toBe(false)
    expect(docBytes(doc)).toBe(JSON.stringify(doc))
  })
})

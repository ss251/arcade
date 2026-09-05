import { describe, expect, it } from "vitest"
import { encodeAbiParameters, keccak256, stringToHex } from "viem"
import { labelhash, namehash } from "viem/ens"
import {
  ALL_ROLES, ENS_SEPOLIA_CHAIN_ID, ENS_TEXT_KEYS, RegistryRoles, ResolverRoles,
  SELLER_SUBNAME_ROLES, SKILL_SUBNAME_ROLES, agentRegistrationKey, arcadeSellerName,
  arcadeSkillName, dnsNameOf, ensTtlSeconds, erc7930Eip155, labelId,
  ownedResolverSalt, sellerLabelFor, userRegistrySalt
} from "../src/ens.ts"

const ADDRESS = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
describe("ENS interoperable addresses", () => {
  it("matches the official ENSIP25 mainnet vector", () => {
    expect(ENS_SEPOLIA_CHAIN_ID).toBe(11155111)
    expect(erc7930Eip155(1, ADDRESS)).toBe("0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432")
    expect(erc7930Eip155(5042002n, "0x8004A818BFB912233c491871b3d84c89A494BD9e")).toBe("0x00010000034cef52148004a818bfb912233c491871b3d84c89a494bd9e")
    const encoded = erc7930Eip155(5042002, ADDRESS).slice(2)
    expect(encoded.length % 2).toBe(0)
    expect(Number.parseInt(encoded.slice(8, 10), 16)).toBe(3)
    expect(Number.parseInt(encoded.slice(10, 16), 16)).toBe(5042002)
  })
  it.each([0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe chain id %s", chain => {
    expect(() => erc7930Eip155(chain, ADDRESS)).toThrow(/chain/)
  })
  it("bounds the one-byte reference length", () => {
    expect(erc7930Eip155((1n << 2040n) - 1n, ADDRESS).slice(0, 12)).toBe("0x00010000ff")
    expect(() => erc7930Eip155(1n << 2040n, ADDRESS)).toThrow(/chain/)
  })
  it.each(["0xdead", ADDRESS.slice(2), ` ${ADDRESS}`, `${ADDRESS}\n`])("rejects malformed 20-byte address %s", address => {
    expect(() => erc7930Eip155(1, address)).toThrow(/20-byte/)
  })
  it("builds a bounded ENSIP25 key without assuming all registries use numeric IDs", () => {
    expect(agentRegistrationKey(1, ADDRESS, 167)).toBe("agent-registration[0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432][167]")
    expect(agentRegistrationKey(1, ADDRESS, "agent:abc")).toMatch(/\[agent:abc\]$/)
    expect(() => agentRegistrationKey(1, ADDRESS, "1[2]")).toThrow(/bracket/)
    for (const id of ["", "a\n", "a".repeat(257), Number.MAX_SAFE_INTEGER + 1, NaN, -1, 1.1]) {
      expect(() => agentRegistrationKey(1, ADDRESS, id)).toThrow()
    }
  })
})

describe("ENS names", () => {
  it("derives the plan's stable address label and normalized handles", () => {
    expect(sellerLabelFor("0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b")).toBe("saeb742d58c")
    expect(sellerLabelFor("SS 251")).toBe("ss-251")
    expect(() => sellerLabelFor("!!")).toThrow(/label/)
  })
  it("composes one seller and one skill label beneath a root 2LD", () => {
    const base = { root: "Arcade-Hub.eth", sellerLabel: "SS251" }
    expect(arcadeSellerName(base)).toBe("ss251.arcade-hub.eth")
    expect(arcadeSkillName({ ...base, skillId: "counterparty-graph" })).toBe("counterparty-graph.ss251.arcade-hub.eth")
    expect(labelId("counterparty-graph")).toBe(BigInt(labelhash("counterparty-graph")))
    expect(dnsNameOf("a.b.eth")).toBe("0x016101620365746800")
  })
  it("refuses hierarchy injection, oversized labels and non-ENS roots", () => {
    const base = { root: "arcade.eth", sellerLabel: "seller", skillId: "skill" }
    for (const skillId of ["a.b", "", "../x", "a".repeat(64), "bad\n"]) expect(() => arcadeSkillName({ ...base, skillId })).toThrow()
    for (const root of ["evil.com", "eth", "x.arcade.eth", "arcade.eth."]) expect(() => arcadeSkillName({ ...base, root })).toThrow()
    expect(() => arcadeSellerName({ ...base, sellerLabel: "x.y" })).toThrow()
    expect(() => labelId("x.y")).toThrow()
  })
  it("bounds the full normalized DNS name in UTF-8 bytes, not UTF-16 code units", () => {
    const tooLong = `${Array.from({ length: 5 }, () => "é".repeat(30)).join(".")}.eth`
    expect(tooLong.length).toBeLessThan(253)
    expect(new TextEncoder().encode(tooLong).length).toBeGreaterThan(253)
    expect(() => dnsNameOf(tooLong)).toThrow(/name/)
    expect(() => userRegistrySalt(tooLong)).toThrow(/name/)
  })
})

describe("ENS role scope and deterministic salts", () => {
  it("pins official nybble roles and withholds transfer authority on subnames", () => {
    expect(RegistryRoles).toMatchObject({ REGISTRAR: 1n, SET_PARENT: 1n << 8n, UNREGISTER: 1n << 12n, RENEW: 1n << 16n, SET_SUBREGISTRY: 1n << 20n, SET_RESOLVER: 1n << 24n, CAN_TRANSFER_ADMIN: 1n << 156n })
    expect(ResolverRoles.SET_TEXT).toBe(1n << 4n)
    expect(ResolverRoles.SET_ADDR).toBe(1n)
    expect(ALL_ROLES.toString(16)).toBe("1".repeat(64))
    for (const bitmap of [SKILL_SUBNAME_ROLES, SELLER_SUBNAME_ROLES]) {
      expect(bitmap & RegistryRoles.CAN_TRANSFER_ADMIN).toBe(0n)
      expect(bitmap & RegistryRoles.RENEW).toBe(RegistryRoles.RENEW)
      expect(bitmap & RegistryRoles.REGISTRAR).toBe(0n)
    }
    expect(SKILL_SUBNAME_ROLES & RegistryRoles.UNREGISTER).toBe(RegistryRoles.UNREGISTER)
  })
  it("pins the actual ABI-encoded salt recipes", () => {
    expect(userRegistrySalt("Alice.eth")).toBe(BigInt(keccak256(encodeAbiParameters([{type:"bytes32"},{type:"bytes32"},{type:"uint256"}], [keccak256(stringToHex("UserRegistry")),namehash("alice.eth"),0n]))))
    expect(userRegistrySalt("alice.eth", 1n)).not.toBe(userRegistrySalt("alice.eth"))
    expect(ownedResolverSalt(ADDRESS)).toBe(BigInt(keccak256(encodeAbiParameters([{type:"bytes32"},{type:"address"},{type:"uint256"}], [keccak256(stringToHex("OwnedResolver")),ADDRESS,0n]))))
    expect(ownedResolverSalt(ADDRESS.toLowerCase())).toBe(ownedResolverSalt(ADDRESS))
    expect(() => userRegistrySalt("alice.eth", -1n)).toThrow()
    expect(() => ownedResolverSalt("0x123")).toThrow()
  })
})

describe("ENS TTL and keys", () => {
  it("parses finite safe seconds with a one-minute floor and no browser env dependency", () => {
    expect(ensTtlSeconds()).toBe(21600)
    expect(ensTtlSeconds("")).toBe(21600)
    for (const [raw, seconds] of [["60",60],["15m",900],["6h",21600],["90d",7776000]] as const) expect(ensTtlSeconds(raw)).toBe(seconds)
    expect(() => ensTtlSeconds("30")).toThrow(/at least/)
    for (const raw of ["soon", "1.5h", "-1", "9".repeat(400), "9007199254740992"]) expect(() => ensTtlSeconds(raw)).toThrow(/ARCADE_ENS_TTL/)
  })
  it("pins all namespaced record keys", () => {
    expect(ENS_TEXT_KEYS).toEqual({ payTo:"arcade.payTo", chain:"arcade.chain", priceAtomic:"arcade.priceAtomic", endpoint:"arcade.endpoint", web:"agent-endpoint[web]", mcp:"agent-endpoint[mcp]", context:"agent-context" })
  })
})

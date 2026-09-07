# ENS — integration feedback draft

Prepared September8,2026; not sent. These observations concern ARCADE's
Sepolia ENSv2 integration, not a claim of current production naming service.

## Show a full least-privilege lifecycle, not just a grant

The current [Permissioned Resolver documentation](https://docs.ens.domains/ensv2/permissioned-resolver)
already includes viem write examples, DNS-encoded `authorizeTextRoles`,
namehash-based setters and revocation. It also explains that broader name/root
grants can still authorize a record. The old draft's “no write support” and
“nearly invisible” claims should not be submitted as current facts.

ARCADE's [dated ENS demonstration](../runbook.md#ens-namespaces-sepolia) exercised
one-key price delegation, revocation and independent post-cleanup owner update
checks. Request: add an end-to-end owner/daemon example that verifies denied
sibling-key writes, reconciles broader grants, revokes only intended access and
proves the owner can still re-point records. Preserve that recovery authority;
permanent immutability is not suitable for our temporary demo URLs.

## Explain expiry, availability and deployment lifecycle separately

Our short renewal window caused one safely stopped attempt before an explicitly
approved continuation. Later expiry removed discovery; the temporary services
were stopped, and production re-point remains pending. None of that proves
continuous service health or current availability.

Request: pair the resolver lifecycle documentation with a short-lived service
example covering confirmation time, record persistence, owner authority and
explicit cleanup. Clearly distinguish observed expiry from RPC unavailability
and from a successful paid canary. This suggestion is based on our retained
run, not a new ENS write or an assertion that names alone provide health checks.

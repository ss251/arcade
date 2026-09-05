> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Task 8 compatibility notes (read-only review preparation)

Task6's committed runtime is a focused HTTPS, scalar-parameter, JSON-object-body lane. The generator must not silently emit listings that this runtime cannot call.

- Match auth by location; compare header names case-insensitively. Never remove an unrelated path/query field just because its name matches the binding.
- Resolve the entire requestBody before inspecting application/json, including local requestBody refs. Use null-prototype maps and own keys. Reject body fields colliding with a parameter name or a stripped auth name, since runtime removes claimed fields from body. Deduplicate required keys.
- Path parameters are always required at runtime even if required is omitted in the spec. Shared path parameters and operation overrides come from parametersOf. Reject array/object parameter schemas or other unsupported forms instead of advertising inputs runtime cannot serialize.
- Validate supported OpenAPI 3 version, duplicate operationIds before selection, and local path-item refs consistently with findOperation. Runtime refuses duplicates of the selected identifier; generator additionally rejects document-wide duplicate identifiers before selection.
- Core schemas are Schema.Unknown: manifest decoding alone does not validate their JSON Schema shape. At minimum refuse non-object/unresolved remote schema shapes; do not claim the hub enforces every OpenAPI/JSON Schema keyword (existing hub validator is intentionally limited).
- Resolve response objects before media schemas. Successful JSON response codes can include 202/206/2XX, not just 200/201. Avoid advertising an error-default schema as the success contract. Refuse incompatible success shapes if current hub cannot enforce a union, and refuse JSON-impossible HEAD/TRACE/only204/non-JSON operations.
- Egress must follow runtime server precedence: operation, then path-item, then root; use parsed hostname rather than host-with-port. Refuse invalid HTTPS, userinfo, server variables/query/fragment before generation.
- Validate auth flags using current EngineAuth/SecretName rules before --yes, with identifier ENV names and safe header token syntax. Required auth fields are supplied by seller, not buyer.
- The exact plan Frankfurter fixture is already written at packages/runner/test/fixtures/frankfurter.json, unstaged until Task8. Task12 should copy it identically.

Keep fixes bounded to the stated lane rather than implementing complete OpenAPI support. All deviations need task-report entries and behavior tests.

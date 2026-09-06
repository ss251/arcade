# Task 1A — public manifest contract

Base d46f588. Added validated optional rails/category to the canonical public
and private schemas and their named-field projection. Omitted metadata remains
omitted. Exported a frozen default gateway/eip3009 list for the next challenge
checkpoint; no escrow implementation or hub behavior is activated here.

The approved tag contract is now optional, defaults to empty, and accepts at
most ten lowercase single-hyphen-separated slugs of at most32 characters.
Explicitly removed the old five-tag Bazaar claim from current code/docs; invalid
old tags fail locally, not silently rewritten. Existing secrecy property tests
now generate optional rails/category as well as all the old private canaries.

Genuine pre-implementation Reds:32 failing/4 passing cases exposed dropped new
fields, absent validation, required tags and the old limits. Inspection also
caught Vitest's array-table spreading in a negative case table; wrapped each
rail value in a named row so empty/duplicate arrays are actually exercised.
After implementation,121 focused tests/five files/3.15s passed, including native
Circle fixture CLI generation and current plugin publisher regressions.

The ts-testing skill keeps the suite on the repository's existing Vitest/Bun
tools and tests canonical schema/CLI behavior rather than mocks of projection.
Root self-review and strict/source/manifest audits precede this commit's sole
sequential four-worker full gate. No dependency, payment, model execution,
wallet state, key access or production operation changed.

## Full gate and freeze audit

Sole42779 PASS:4,530 Vitest/202 files/64.67s;839 Bun/55 files/6,114 assertions/
163.57s;root/web strict0;client365ms/SSR173ms. No full rerun. The previous
fixture commit's intermittent relay cleanup failure did not recur in this
new code commit's gate; its historical report remains unchanged.

Five frozen source/test hashes and eleven scoped paths passed the final audit,
with25 local links and no added secret/personal-path matches. Independently
decoding and encoding all nine tracked first-party manifests on baseline main
and this worktree produced identical public bytes and SHA-256 hashes. The
existing runner loader function, payment/engine code, lockfiles and shouldSettle
are unchanged. Task1A complete; Task1B routing is next, not implicitly shipped.

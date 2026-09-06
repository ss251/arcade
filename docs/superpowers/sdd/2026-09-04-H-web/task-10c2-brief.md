# H10c2 — ordinary buyer page and native acceptance

After H10c1 `57fbfe0`, root-only under the machine-load restriction. Own new
`components/buyer.tsx`, `routes/buyer.tsx`, focused buyer tests, isolated buyer
browser fixtures, scoped buyer CSS, generated route registration and SDD/runbook
records. Keep H9/H10b/H10c1 foundations unchanged unless a reproduced defect
requires a separately recorded correction.

SSR and first hydration are passive loading states. Read storage only in an
effect; keep full ordinary capabilities in private refs/controller, passing only
token-free summaries to presentation. Show unreadable/unavailable/empty distinctly.
Scope selection by issuer+realm+job; manual refresh/storage changes clear old
selection and cancel active reads. Read result/tree only after an explicit action.
Forget removes browser recovery access only, with an explanatory deliberate
control; never cancel/revoke/sign/pay, and report failed storage writes honestly.

Use the existing design tokens and native accessible controls. Never sum accepted
prices as spent, fabricate session budgets or claim original signature/chain
verification. Show full issuing origin and IDs, accepted price, qualified recovered
result/reference and incomplete TreeGraph. Paid output is escaped selectable JSON,
not markup. Clearly state session recovery unavailable and localStorage limitations.

Prewrite SSR/presentation tests. Native acceptance uses one owned two-origin
synthetic fixture, actual component/storage/readers/CORS, fresh isolated Chromium
profile with at most two renderers, and exact supervised cleanup. Verify passive
reload, explicit header-only reads, selection cancellation, storage failures,
local-only forgetting, desktop/mobile-width light/dark layout and keyboard access.
No owner keys, real wallet, live payment or independent chain proof is implied.
Run exact strict checks and one sequential four-worker full gate after freeze;
commit locally with evidence and no push. H11–14 and session contract remain later.

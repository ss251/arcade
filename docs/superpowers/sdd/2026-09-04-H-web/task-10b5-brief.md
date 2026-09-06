# H10b5 — confirmation gesture lifetime

After H10b4 `afe2026`, single-threaded with no additional spend or credentials.
Preserve the existing confirmation design/full address/ENS and safe wallet policy.

Cancel an in-progress hold on denied, changed decision/terms/input, blocked or
connecting state, blur/hidden document and unmount. Elapsed time is monotonic;
invalid/backward clocks refuse rather than accelerate a payment decision. Only
one completion is permitted for a displayed decision, and callback replacement
cannot cause an old hold to invoke a stale callback. A parent-provided opaque
decision key will bind full approval/tool/input/context identity in the subsequent
Chat integration; this component is not itself payment authority.

Support deliberate900ms Space/Enter keyboard holds with the same cancellation
and one-use rules as primary-pointer holds. Ignore repeated keys/non-primary
pointer starts; release, leave/cancel or focus loss stops progress. A click alone
must never approve. Denial cancels before invoking its callback. Re-render and
StrictMode must not leave timers or allow a consumed displayed decision to repeat.

Prewrite a bounded owned browser fixture using the actual component and existing
React dependencies, with public synthetic terms only and no wallet/payment IO.
Reproduce existing stale-hold/denial behavior before fixing it; retain the honest
native interaction record separately from deterministic Vitest/SSR checks. Stop
owned fixtures/browser after proof. One sequential max4 full gate after freeze.

Chat/SDK private approval wiring, old Settlement and /api/settle retirement,
two-origin paid-transport proof, buyer/session pages and H11–14 remain separate.
No independent-review, active one-use browser payment or new live proof claim.

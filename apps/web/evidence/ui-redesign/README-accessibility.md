# ARCADE UI redesign — rendered evidence

Captured in a fresh headless Google Chrome profile against the actual TanStack Start dev server. All hub facts, saved jobs, and model messages are synthetic loopback fixtures. These images are visual evidence, not evidence of chain settlement. After an explicit complete hold, the fixture uses the repo's public offline test key (0x01 repeated 32 times; never fund) to exercise the actual purchase-run callbacks against a synthetic signature-verifying hub. Wallet-balance frames use a synthetic 12.345678 USDC response, strictly for the configured balanceOf call; this is not a real balance. No live provider, funds, model, chain RPC, or ambient key is available.

Reproduce from the repository root: `bun --no-env-file apps/web/test/ui-redesign-screens.ts`. The runner owns and stops Vite, the fixture hub, and Chrome. It uses existing dependencies and does not load environment files.

Viewport widths are 390, 834, and 1440 CSS pixels at 1× in both system schemes. Each route has an initial viewport image and a `-full` image. Chat remains a real internally scrolling surface. Approval is first captured spontaneously after the stream settles, without scrolling it into place; the runner rejects a clipped header or amount. It also has a `-holding` image; the first gesture must hit the control and produce nonzero progress, then release before approval, return to zero progress, and remain unsigned. A separate completed hold then runs the real callback chain: quote, one test signature, one accepted synthetic call, waiting, and result. `purchaseVerification` records exactly-once counts. The reduced-motion / 200% root-font pass stops after the canceled hold.

`publish` is the enabled local preview form; `publish-preview` is its canonical synthetic result. No publishing CLI is invoked. `buyer` contains two synthetic saved jobs and an explicitly selected recovery panel. `capture.json` records rendered text, browser exceptions, console errors, horizontal geometry, scheme, and the stylesheet hash.

Capture status: **completed**. Human visual review remains a separate step.

| Route / state | Width | Scheme | Viewport | Full page |
| --- | ---: | --- | --- | --- |
| market-large-type | 390 | light | [PNG](market-large-type-390-light.png) | [PNG](market-large-type-390-light-full.png) |
| market-controls-large-type | 390 | light | [PNG](market-controls-large-type-390-light.png) | [PNG](market-controls-large-type-390-light-full.png) |
| chat-large-type | 390 | light | [PNG](chat-large-type-390-light.png) | [PNG](chat-large-type-390-light-full.png) |
| chat-approval-large-type | 390 | light | [PNG](chat-approval-large-type-390-light.png) | [PNG](chat-approval-large-type-390-light-full.png) |

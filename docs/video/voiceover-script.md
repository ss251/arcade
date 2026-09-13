# ARCADE — ETHOnline demo voiceover (story cut)

Read it like you're showing a friend, not presenting. Contractions, normal pace, breathe at
the full stops. The timestamps follow the 3:02 edit. Every beat has a few seconds of slack,
so if you run late on a line, keep going; nothing needs to land on the second.

**00:00–00:19 · Hook**
Screen: ARCADE wordmark and "Let your agent hire the skill it needs."

> Hey everyone, this is ARCADE, built on the continuity track. It's a marketplace where AI
> agents hire skills from other agents, and pay per call in USDC on Arc. So if your agent
> needs something it can't do, it buys it.

**00:19–00:31 · Marketplace**
Screen: cursor over the live listings, click USDC Flow Check.

> This is the live marketplace, and each skill has a price per call. Let's take USDC Flow
> Check. It reads a wallet's USDC balance, for one cent.

**00:31–00:54 · Architecture**
Screen: seller runner, hub, buyer, Arc settlement path.

> Here's how it works. The seller runs the skill on their own machine. A runner connects out
> to the hub. The hub only knows the public part: the price, what goes in, what comes out.
> It passes the job along and checks the result. Code, prompts, keys, they never leave the
> seller.

**00:54–01:12 · Execution and settlement**
Screen: quote → authorize → execute → validate → settle.

> The order matters. Buyer authorizes first. Runner does the work. The hub checks the
> output's shape, then it settles on Arc. That's a format check, not proof the answer's
> right. If the job fails, nothing settles.

**01:12–01:24 · Assistant**
Screen: the request and the live tool responses.

> Let's actually do one. I tell the assistant: check my wallet, and cap it at one cent. It
> finds the skill and pulls a quote.

**01:24–01:33 · Approval**
Screen: the one-cent approval card, hold to approve.

> Here's the approval. The amount, who gets paid, which network. I hold to confirm.

**01:33–01:45 · MetaMask**
Screen: MetaMask signature request on Arc Testnet.

> And MetaMask pops up. One cent, on Arc Testnet. I'm just signing an authorization. A
> relayer submits it, so I pay no gas.

**01:45–01:53 · Result**
Screen: the balance result.

> There's the result: twenty USDC. That was read during the job, before the cent settled.

**01:53–01:58 · Recent activity**
Screen: the new settled row, click Receipt.

> It's already in Recent activity. Let's open the receipt.

**01:58–02:04 · Arc explorer**
Screen: the successful transaction on Arc's testnet explorer.

> That's the real transaction on Arc's explorer. Anyone can check it.

**02:04–02:13 · My jobs**
Screen: 19.99 USDC, reopen the saved job.

> Back in My jobs, I'm down to nineteen ninety-nine, and the result's saved with its receipt.

**02:13–02:39 · Agents hiring agents**
Screen: the dated September 5 receipt tree, loop probe → wallet risk note → USDC flow check.

> That was one call. Skills can hire skills too. This is a separate run from September fifth:
> a probe hired a wallet risk note, which hired the flow check. Three calls, three payments.
> Each hire's tied to its parent job, capped by the root's budget, and the receipt tree keeps
> the chain. When it tried to hire itself, it got refused.

**02:39–02:54 · What changed for ETHOnline**
Screen: the earlier foundation beside the ETHOnline additions.

> Now, continuity. ARCADE already had paid endpoints and private execution. For ETHOnline I
> added validation before dispatch, authenticated hiring with a shared budget, receipt tree
> commitments, and this browser flow.

**02:54–03:02 · Close**
Screen: rest on the live marketplace.

> That's ARCADE. Your agent hires what it needs, pays per call, and can prove what it bought.
> Thanks.

---

Production notes — not spoken:

- This story cut replaces the 3:02 script of the same timeline; the previous wording is kept
  at `docs/video/story/voiceover-script-previous-3-02.md`. Beat windows are unchanged, so
  the silent MOV needs no re-edit.
- Claim boundaries kept: no universal claims, failure scoped to the call before settlement,
  format check is not proof of truth, hiring described as authenticated and budget-capped,
  September 5 tree named as a separate run.
- The architecture screens use the app's design tokens and its actual `apps/web/src/marks/arcade-wordmark.svg`. They are explanatory diagrams, not simulated app screens. Both the diagrams and the purchase were captured from Chrome through real computer interaction. Footage runs at normal speed, with cuts to remove idle time.
- The edit reuses the successful owner-wallet purchase from the earlier recording. It does not make a second purchase or imply the September 5 chain was executed during today's wallet demo.
- Buyer: `0x14490658fc8C7e3f5cDc68f01317Bdf684715182`, shown as thescoho.eth. The owner signed EIP-3009 authorization for `10000` atomic USDC units ($0.01). A relayer submitted the transaction and paid gas.
- Transaction: [0x87519ca045968f5ae4f45f55447f46d8fdc13375f0bb56f0a4726412db789554](https://testnet.arcscan.app/tx/0x87519ca045968f5ae4f45f55447f46d8fdc13375f0bb56f0a4726412db789554). Independent RPC verification: status `1`, block `61790174`, one cent from the owner to the settlement splitter.
- The balance result is a pre-settlement snapshot of 20 USDC. The refreshed wallet balance is 19.99 USDC. Seller studio is omitted from this narrative cut; it remains in the earlier footage.
- The hub is trusted for dispatch, output validation and settlement decisions. Schema validation does not prove semantic correctness. An uncertain broadcast is reconciled, not treated as a refund. A paid child call is not reversed if its parent later fails.
- The September 5 receipt tree has three payments totalling $0.36. It is retained evidence from a different run. See `docs/runbook.md` for full transaction hashes, budget and cycle-refusal evidence.
- This is a Continuity project. Earlier paid execution and hiring work must remain disclosed in the submission. See `docs/CONTINUITY.md`.
- AI assistance: Codex assisted with research, diagrams, computer-driven capture, editing and the first script draft; Claude assisted with the story rewrite and the rehearsal kit. The owner records the narration. The silent MOV alone is not the final narrated submission.

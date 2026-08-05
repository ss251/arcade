/**
 * Slash commands — shortcuts to a prompt, never a second way to reach the tools.
 *
 * ## The one design rule here
 *
 * Every command expands to ENGLISH and is sent as an ordinary user message. None of them
 * calls a tool directly. That is deliberate and it is the whole safety story: a command that
 * invoked `arcade_call_skill` itself would be a second path to the money edge, bypassing the
 * system prompt, the approval policy and the quote-before-purchase habit — and it would have
 * to grow its own copy of all three. This repo keeps arriving at the same answer, so: one
 * path, entered two ways.
 *
 * It also means the commands cannot go stale against the tools. They are phrasing.
 *
 * ## Why these five
 *
 * They are the marketplace's verbs, in the order someone actually needs them — see what is
 * for sale, read one closely, ask the price, buy, check the tape. A slash menu of chat
 * meta-commands (`/clear`, `/help`) would be about the chat; these are about the product.
 */

export interface Command {
  readonly name: string
  /** Shown beside the name. Says what happens, in the product's own vocabulary. */
  readonly hint: string
  /** Present when the command reads better with one, e.g. `/quote usdc-flow-check`. */
  readonly arg?: string
  /** The message actually sent. `arg` is the text the visitor typed after the name. */
  readonly expand: (arg: string) => string
}

export const COMMANDS: ReadonlyArray<Command> = [
  {
    name: "skills",
    hint: "what is for sale, with prices",
    expand: () => "What's for sale? List every skill with its price."
  },
  {
    name: "describe",
    hint: "schemas, bounds and measured stats",
    arg: "skill",
    expand: (a) =>
      a === ""
        ? "Describe the skills for sale — their input and output schemas, declared bounds, and measured statistics."
        : `Describe ${a}: its input and output schemas, declared bounds, and measured statistics.`
  },
  {
    name: "quote",
    hint: "what one call costs, from the endpoint",
    arg: "skill",
    expand: (a) =>
      a === ""
        ? "Quote each skill from its own payment challenge."
        : `What would one call to ${a} cost? Quote it from the endpoint's own payment challenge.`
  },
  {
    name: "buy",
    hint: "quote, then ask me to confirm",
    arg: "skill",
    // Spells out the one-turn requirement. Models reliably quote and then STOP, announcing
    // a purchase they never prepare — and since the confirmation card only exists once
    // arcade_call_skill has run, that leaves the visitor staring at a promise.
    expand: (a) =>
      a === ""
        ? "Which skill should I buy? Quote it, then call arcade_call_skill in the same turn."
        : `Buy ${a}. Quote it, then call arcade_call_skill in the same turn so I get the confirmation card.`
  },
  {
    name: "receipts",
    hint: "the settlement feed and take-rate",
    expand: () =>
      "Show the settlement feed: what settled, for how much, the platform fee, and the transactions."
  }
]

/**
 * Parse a composer value into a command and its argument.
 *
 * Returns `undefined` for anything that is not a leading slash, so a message that merely
 * CONTAINS a slash — a URL, a fraction, a path — is never treated as a command.
 */
export const parseCommand = (
  value: string
): { readonly command: Command; readonly arg: string } | undefined => {
  if (!value.startsWith("/")) return undefined
  const space = value.indexOf(" ")
  const name = (space === -1 ? value.slice(1) : value.slice(1, space)).toLowerCase()
  const arg = space === -1 ? "" : value.slice(space + 1).trim()
  const command = COMMANDS.find((c) => c.name === name)
  return command === undefined ? undefined : { command, arg }
}

/**
 * Which commands to offer for what has been typed so far.
 *
 * Empty once a complete command name is followed by a space: at that point the visitor is
 * writing the argument, and a menu still covering the thread would be in the way.
 */
export const matchCommands = (value: string): ReadonlyArray<Command> => {
  if (!value.startsWith("/")) return []
  const space = value.indexOf(" ")
  if (space !== -1) return []
  const typed = value.slice(1).toLowerCase()
  return COMMANDS.filter((c) => c.name.startsWith(typed))
}

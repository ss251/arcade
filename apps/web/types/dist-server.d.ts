/**
 * `server.ts` imports the Vite build's output, which is gitignored and absent from a fresh
 * clone. Without this declaration `server.ts` cannot be typechecked at all unless someone
 * builds first — so it was simply left out of the tsconfig, which made the production entry
 * the one file in the repo that nothing checked.
 *
 * Declaring the module's shape here means `bun run typecheck` covers `server.ts` on a clean
 * checkout. The shape is the contract TanStack Start's build actually emits: a default
 * export with a `fetch(request)` method, verified by reading `dist/server/server.js`.
 */
declare module "*/dist/server/server.js" {
  const handler: { fetch(request: Request): Promise<Response> }
  export default handler
}

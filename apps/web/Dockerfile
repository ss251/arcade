# The chat surface. A SEPARATE Railway service from the hub, built from the repo root.
#
# This file must exist, and the web service must be pointed at `apps/web/railway.json`,
# because of a Railway behaviour that fails in the worst possible direction. Its monorepo
# guide states: "The Railway Config File does not follow the Root Directory path. You have
# to specify the absolute path for the railway.json or railway.toml file." So a second
# service in this project inherits the ROOT `railway.json` — which pins the HUB's
# Dockerfile — even if you give it a root directory. It would then build a perfectly valid
# Dockerfile, succeed, and start a second hub. Railway reports a healthy deploy, and you
# have two hubs and no web service, at two URLs both serving a settlement page.
#
# Not a Node image. TanStack Start's Vite build emits `dist/server/server.js` whose default
# export is `{ fetch(request): Response }` — the Web-standard shape `Bun.serve` takes — so
# there is no Nitro preset and no Node adapter. Verified that `vite build` completes with
# `node` absent from PATH entirely, because Bun's script runner execs vite's bin rather than
# honouring its `#!/usr/bin/env node` shebang; the musl rollup binaries are in bun.lock and
# esbuild's Linux build is statically linked Go, so Alpine's two usual native-binary
# failures do not apply either.
FROM oven/bun:1.3-alpine

WORKDIR /app

# EVERY workspace manifest, not just this app's. `bun install --frozen-lockfile` resolves
# the whole workspace graph, so omitting one fails the install — and the list is enumerated
# here rather than globbed because Docker COPY cannot glob directories selectively.
# `packages/core/test/repo-hygiene.test.ts` asserts this list stays complete, since an
# enumeration that is correct today is silently incomplete the day a workspace is added.
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY packages/payments/package.json packages/payments/
COPY packages/runner/package.json packages/runner/
COPY packages/buyer/package.json packages/buyer/
COPY apps/hub/package.json apps/hub/
COPY apps/web/package.json apps/web/

RUN bun install --frozen-lockfile

COPY . .

# Build at image time so the running container never needs a toolchain, and so a build
# failure is a failed deploy rather than a service that starts and cannot serve.
RUN bun run --cwd apps/web build

EXPOSE 3000
CMD ["bun", "run", "--cwd", "apps/web", "start"]

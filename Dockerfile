# The hub is Bun-only by construction: `Bun.serve` provides the websocket upgrade the
# runner protocol depends on, and `bun:sqlite` backs the store. Nixpacks autodetected a
# Node toolchain and failed on Node 18 being end-of-life — which was the right failure for
# the wrong reason, since Node was never going to run this.
FROM oven/bun:1.3-alpine

WORKDIR /app

# Manifests first so a source-only change reuses the dependency layer.
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY packages/payments/package.json packages/payments/
COPY packages/runner/package.json packages/runner/
COPY packages/buyer/package.json packages/buyer/
COPY apps/hub/package.json apps/hub/

RUN bun install --frozen-lockfile

COPY . .

# `ARCADE_DB` must point inside a mounted volume — a container filesystem is ephemeral, so
# writing the store here would survive process restarts and silently vanish on every
# redeploy. See docs/runbook.md.
EXPOSE 8787
CMD ["bun", "run", "apps/hub/src/server.ts"]

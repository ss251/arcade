#!/bin/sh
set -eu
# No default run, env-file loading, funding or credential handling.
case "$#:${1-}" in
  1:--offline|1:--help) ;;
  *) printf '%s\n' 'Gateway session evidence refused; use --offline or --help.' >&2; exit 2 ;;
esac
exec bun --no-env-file "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/e2e-gateway-session.ts" "$1"

#!/bin/sh
set -eu
# No shared log, environment file, mutation, spending or nested test gate.
case "$#:${1-}" in
  0:|1:--json|1:--help) ;;
  *) printf '%s\n' 'packaging_arguments_invalid' >&2; exit 2 ;;
esac
exec bun --no-env-file --no-install "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/packaging-evidence.ts" "$@"

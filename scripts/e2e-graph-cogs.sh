#!/bin/sh
set -eu
# Parse before resolving tools. No live switch, key lookup, log or state writer.
case "$#:${1-}" in
  0:|1:--help) ;;
  2:--audit-reservations)
    case "$2" in /*) ;; *) printf '%s\n' 'graph_cogs_arguments_invalid' >&2; exit 2 ;; esac ;;
  *) printf '%s\n' 'graph_cogs_arguments_invalid' >&2; exit 2 ;;
esac
exec bun --no-env-file --no-install "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/e2e-graph-cogs.ts" "$@"

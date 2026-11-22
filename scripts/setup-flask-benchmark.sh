#!/usr/bin/env bash
set -euo pipefail

target="${1:-.benchmarks/flask}"
expected_commit="22d92470"

if [[ -e "$target" ]]; then
  echo "Refusing to overwrite existing path: $target" >&2
  exit 2
fi

mkdir -p "$(dirname "$target")"
git clone https://github.com/pallets/flask.git "$target"
git -C "$target" checkout "$expected_commit"
actual_commit="$(git -C "$target" rev-parse --short=8 HEAD)"
printf 'Flask checkout ready: %s (%s)\n' "$target" "$actual_commit"

if [[ "$actual_commit" != "$expected_commit" ]]; then
  echo "The checkout does not match the commit prefix from the brief." >&2
  exit 3
fi
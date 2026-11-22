#!/usr/bin/env bash
set -euo pipefail

target="${1:-.benchmarks/flask}"
if [[ ! -d "$target" ]]; then
  echo "Flask benchmark checkout not found: $target" >&2
  echo "Run scripts/setup-flask-benchmark.sh first." >&2
  exit 2
fi

cd "$target"
python -m pytest -q
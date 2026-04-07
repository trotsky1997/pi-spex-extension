#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cd "$ROOT_DIR"
npm run typecheck >/dev/null
npm run ship-state-smoke >/dev/null
npm run ship-resume-smoke >/dev/null
npm run e2e-pi-smoke >/dev/null
npm run skill-smoke >/dev/null

cd "$TMP_DIR"
mkdir repo
cd repo

pi install -l "$ROOT_DIR" >/dev/null

test -f .pi/settings.json
if ! grep -q 'pi-spex-extension' .pi/settings.json && ! grep -q '\.\./' .pi/settings.json; then
  echo "pi-spex-extension not found in project settings" >&2
  exit 1
fi

echo "smoke install ok"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_ROOT="${ROOT_DIR}/dist"
DIST_DIR="${DIST_ROOT}/firefox"
ZIP_PATH="${DIST_ROOT}/NoPorno-firefox.zip"

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

rsync -a \
  --exclude ".git" \
  --exclude "dist" \
  --exclude "scripts" \
  --exclude "manifest.firefox.json" \
  --exclude "bsite.js" \
  --exclude "noporno.js" \
  --exclude "NoPorno.zip" \
  "${ROOT_DIR}/" "${DIST_DIR}/"

cp "${ROOT_DIR}/manifest.firefox.json" "${DIST_DIR}/manifest.json"

mkdir -p "${DIST_ROOT}"
rm -f "${ZIP_PATH}"
(
  cd "${DIST_DIR}"
  zip -qr "${ZIP_PATH}" .
)

echo "Built Firefox package: ${ZIP_PATH}"

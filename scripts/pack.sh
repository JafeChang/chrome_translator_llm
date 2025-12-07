#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
OUTPUT_NAME="llm-translator-extension.zip"
OUTPUT_PATH="$DIST_DIR/$OUTPUT_NAME"

mkdir -p "$DIST_DIR"
rm -f "$OUTPUT_PATH"

cd "$ROOT_DIR"
zip -r "$OUTPUT_PATH" \
  manifest.json \
  content-script.js \
  service-worker.js \
  popup.html \
  popup.js \
  popup.css \
  icons \
  README.md \
  LICENSE >/dev/null

echo "Created package at $OUTPUT_PATH"

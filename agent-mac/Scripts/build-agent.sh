#!/bin/bash
# Build Go agent as a universal macOS binary and copy to Xcode resources.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$SCRIPT_DIR/../../agent"
RESOURCES_DIR="$SCRIPT_DIR/../RttysAgent/Resources"

cd "$AGENT_DIR"

echo "Building rttys-agent for arm64..."
GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "-s -w" -o "$RESOURCES_DIR/rttys-agent-arm64" .

echo "Building rttys-agent for amd64..."
GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w" -o "$RESOURCES_DIR/rttys-agent-amd64" .

echo "Creating universal binary..."
lipo -create \
  "$RESOURCES_DIR/rttys-agent-arm64" \
  "$RESOURCES_DIR/rttys-agent-amd64" \
  -output "$RESOURCES_DIR/rttys-agent"

rm "$RESOURCES_DIR/rttys-agent-arm64" "$RESOURCES_DIR/rttys-agent-amd64"
chmod +x "$RESOURCES_DIR/rttys-agent"

echo "Done: $RESOURCES_DIR/rttys-agent"

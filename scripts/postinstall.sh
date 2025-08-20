#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd $SCRIPT_DIR/..

## 1. get aztec-standards
REPO_DIR="aztec-standards"
REPO_URL="https://github.com/defi-wonderland/aztec-standards"
REV="5f01cfff31612b7b59e34d9f61e146a3f5238429"
VERSION=v1.2.1

if [ ! -d "$REPO_DIR" ]; then
  echo "Cloning $REPO_URL into $REPO_DIR..."
  git clone --depth 1 "$REPO_URL" "$REPO_DIR"
else
  echo "$REPO_DIR already exists, skipping clone."
fi

cd "$REPO_DIR" || { echo "Failed to enter $REPO_DIR" >&2; exit 1; }

# Ensure the desired commit is available and check it out. Fetch if needed.
if git rev-parse --verify "$REV" >/dev/null 2>&1; then
  git checkout "$REV" &> /dev/null
else
  echo "Fetching commit $REV..."
  git fetch --depth 1 origin "$REV" || git fetch origin "$REV"
  git checkout "$REV" &> /dev/null
fi

## 2. Grab the token contract
cp -r src/token_contract $SCRIPT_DIR/../src/nr
echo "Installed defi-wonderland:token_contract:$VERSION locally"

## 3. Remove aztec-standards
cd ..
rm -rf aztec-standards
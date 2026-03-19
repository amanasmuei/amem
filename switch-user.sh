#!/bin/bash
# Switches the active user profile in multi-user mode.
# Updates root symlinks to point to the selected profile.
# Usage: switch-user.sh [profile-name]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
if [ -t 1 ]; then
  BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
  DIM='\033[2m'; YELLOW='\033[0;33m'; RESET='\033[0m'
else
  BOLD=''; GREEN=''; CYAN=''; DIM=''; YELLOW=''; RESET=''
fi

# Check multi-user mode
if [ ! -d "$SCRIPT_DIR/profiles" ]; then
  echo "No profiles found. This project is in single-user mode."
  echo "Use ./add-user.sh to enable multi-user mode."
  exit 1
fi

# Detect current profile
CURRENT=""
if [ -L "$SCRIPT_DIR/memory.md" ]; then
  CURRENT=$(readlink "$SCRIPT_DIR/memory.md" | sed 's|profiles/\([^/]*\)/.*|\1|')
fi

TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  echo ""
  printf "${BOLD}Available profiles:${RESET}\n"
  echo ""
  for dir in "$SCRIPT_DIR/profiles"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    if [ "$name" = "$CURRENT" ]; then
      printf "  ${GREEN}● ${name}${RESET} ${DIM}(active)${RESET}\n"
    else
      printf "  ○ ${name}\n"
    fi
  done
  echo ""
  printf "  Switch to: "
  read -r TARGET
  [ -z "$TARGET" ] && exit 0
fi

if [ ! -d "$SCRIPT_DIR/profiles/$TARGET" ]; then
  echo "Profile '$TARGET' not found."
  exit 1
fi

if [ "$TARGET" = "$CURRENT" ]; then
  echo "Already on profile '$TARGET'."
  exit 0
fi

# Switch symlinks
cd "$SCRIPT_DIR"
rm -f memory.md session.md diary
ln -s "profiles/$TARGET/memory.md" memory.md
ln -s "profiles/$TARGET/session.md" session.md
ln -s "profiles/$TARGET/diary" diary

# Update snapshot for validation
mkdir -p .claude
cp "profiles/$TARGET/memory.md" .claude/.memory-snapshot 2>/dev/null || true

echo ""
printf "${GREEN}✓${RESET} Switched to profile: ${BOLD}${TARGET}${RESET}\n"
echo ""

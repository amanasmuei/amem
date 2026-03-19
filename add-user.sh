#!/bin/bash
# Adds a new user profile to the AI memory system.
# Enables multi-user mode if not already active (migrates existing files).
# Usage: add-user.sh [profile-name]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
if [ -t 1 ]; then
  BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
  DIM='\033[2m'; YELLOW='\033[0;33m'; RESET='\033[0m'
else
  BOLD=''; GREEN=''; CYAN=''; DIM=''; YELLOW=''; RESET=''
fi

echo ""
printf "${BOLD}${CYAN}Add User Profile${RESET}\n"
echo ""

# Detect current mode
IS_MULTI=false
if [ -d "$SCRIPT_DIR/profiles" ] && [ -L "$SCRIPT_DIR/memory.md" ]; then
  IS_MULTI=true
  CURRENT=$(readlink "$SCRIPT_DIR/memory.md" | sed 's|profiles/\([^/]*\)/.*|\1|')
  printf "  Multi-user mode active. Current profile: ${BOLD}${CURRENT}${RESET}\n\n"
fi

# Get new profile name
NEW_NAME="${1:-}"
if [ -z "$NEW_NAME" ]; then
  printf "  New profile name: "
  read -r NEW_NAME
fi

if [ -z "$NEW_NAME" ]; then
  echo "  Profile name is required."
  exit 1
fi

# Sanitize (alphanumeric, hyphens, underscores only)
SAFE_NAME=$(echo "$NEW_NAME" | tr -cd '[:alnum:]-_')
if [ "$SAFE_NAME" != "$NEW_NAME" ]; then
  echo "  Using sanitized name: $SAFE_NAME"
  NEW_NAME="$SAFE_NAME"
fi

if [ -d "$SCRIPT_DIR/profiles/$NEW_NAME" ]; then
  echo "  Profile '$NEW_NAME' already exists."
  echo "  Use ./switch-user.sh $NEW_NAME to switch to it."
  exit 1
fi

# ─── Migrate from single-user if needed ───

if [ "$IS_MULTI" = false ] && [ -f "$SCRIPT_DIR/memory.md" ] && [ ! -L "$SCRIPT_DIR/memory.md" ]; then
  echo "  Converting from single-user to multi-user mode."
  echo ""

  if grep -qF '[AI_NAME]' "$SCRIPT_DIR/memory.md" 2>/dev/null; then
    # Unconfigured template — no user data to migrate
    echo "  Current memory.md is unconfigured — creating fresh profiles."
    mkdir -p "$SCRIPT_DIR/profiles"
  else
    printf "  Name for your existing profile (to preserve your data): "
    read -r EXISTING_NAME
    while [ -z "$EXISTING_NAME" ]; do
      printf "  ${YELLOW}Please enter a name:${RESET} "
      read -r EXISTING_NAME
    done
    EXISTING_NAME=$(echo "$EXISTING_NAME" | tr -cd '[:alnum:]-_')

    # Migrate existing files to a profile
    mkdir -p "$SCRIPT_DIR/profiles/$EXISTING_NAME/diary"
    mv "$SCRIPT_DIR/memory.md" "$SCRIPT_DIR/profiles/$EXISTING_NAME/memory.md"
    mv "$SCRIPT_DIR/session.md" "$SCRIPT_DIR/profiles/$EXISTING_NAME/session.md"

    if [ -d "$SCRIPT_DIR/diary" ] && [ ! -L "$SCRIPT_DIR/diary" ]; then
      # Move diary contents, preserving the directory
      if [ "$(ls -A "$SCRIPT_DIR/diary" 2>/dev/null)" ]; then
        cp -r "$SCRIPT_DIR/diary"/* "$SCRIPT_DIR/profiles/$EXISTING_NAME/diary/" 2>/dev/null || true
      fi
      rm -rf "$SCRIPT_DIR/diary"
    fi

    if [ -d "$SCRIPT_DIR/archive" ] && [ ! -L "$SCRIPT_DIR/archive" ]; then
      mv "$SCRIPT_DIR/archive" "$SCRIPT_DIR/profiles/$EXISTING_NAME/archive"
    fi

    # Create symlinks to existing user (maintain current state)
    cd "$SCRIPT_DIR"
    ln -s "profiles/$EXISTING_NAME/memory.md" memory.md
    ln -s "profiles/$EXISTING_NAME/session.md" session.md
    ln -s "profiles/$EXISTING_NAME/diary" diary

    # Gitignore the symlinks
    for entry in "memory.md" "session.md" "diary"; do
      grep -qxF "$entry" .gitignore 2>/dev/null || echo "$entry" >> .gitignore
    done

    printf "  ${GREEN}✓${RESET} Migrated existing data to profile: ${EXISTING_NAME}\n\n"
  fi
fi

# ─── Create new profile ───

mkdir -p "$SCRIPT_DIR/profiles/$NEW_NAME/diary"

cat > "$SCRIPT_DIR/profiles/$NEW_NAME/memory.md" << 'MEMEOF'
# Memory — [AI_NAME]

## Identity

| Field | Value |
|-------|-------|
| **AI Name** | [AI_NAME] |
| **Role** | [e.g., coding partner, study buddy, writing coach] |
| **Tone** | [e.g., direct and technical / warm and casual / concise] |
| **Traits** | [e.g., pragmatic, curious, honest] |

## User

| Field | Value |
|-------|-------|
| **Name** | [YOUR_NAME] |
| **Focus** | [e.g., web dev, ML, creative writing] |
| **Level** | [e.g., senior Python, beginner Rust] |
| **Style** | [e.g., concise answers, show code first, explain after] |

## Learned Patterns

<!-- Append-only. AI adds entries as it learns about the user. -->

## Decision Log

<!-- Append-only. Important choices made across sessions. -->

| Date | Decision | Context |
|------|----------|---------|
| | | |

## Active Projects

| Project | Status | Notes |
|---------|--------|-------|
| | | |

---
*Last updated: [date]*
MEMEOF

cat > "$SCRIPT_DIR/profiles/$NEW_NAME/session.md" << 'SESSEOF'
# Session

## Previous Session Recap

No summary from previous session.

## Goals

- [ ] ...

## Working Notes

[empty]

## End-of-Session Summary

[pending]
SESSEOF

printf "  ${GREEN}✓${RESET} Profile '${NEW_NAME}' created\n"

# ─── Offer to switch ───

echo ""
printf "  Switch to '${NEW_NAME}' now? ${DIM}[Y/n]${RESET}: "
read -r do_switch
if [ -z "$do_switch" ] || [ "$do_switch" = "y" ] || [ "$do_switch" = "Y" ]; then
  bash "$SCRIPT_DIR/switch-user.sh" "$NEW_NAME"
  echo "  Next: run ./setup.sh to configure this profile."
else
  echo ""
  echo "  To switch later: ./switch-user.sh $NEW_NAME"
  echo "  Then configure:  ./setup.sh"
fi
echo ""

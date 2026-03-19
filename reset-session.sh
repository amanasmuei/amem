#!/bin/bash
# Resets session.md for a new conversation.
# Preserves End-of-Session Summary as recap.
# Falls back to Working Notes if no summary was written.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION="${SCRIPT_DIR}/session.md"

if [ ! -f "$SESSION" ]; then
  echo '{"suppressOutput": true}'
  exit 0
fi

# Wait for Stop hook agent to finish writing (lock file polling)
LOCKFILE="${SCRIPT_DIR}/.claude/.session-lock"
if [ -f "$LOCKFILE" ]; then
  waited=0
  while [ -f "$LOCKFILE" ] && [ "$waited" -lt 65 ]; do
    sleep 1
    waited=$((waited + 1))
  done
  rm -f "$LOCKFILE"
fi

# Extract End-of-Session Summary using awk (exact heading match)
RECAP=$(awk '
  /^## End-of-Session Summary$/ { found=1; next }
  found && /^## / { exit }
  found { print }
' "$SESSION" | sed '/^[[:space:]]*$/d' | head -10)

# If no summary was written, preserve Working Notes as fallback
if [ -z "$RECAP" ] || echo "$RECAP" | grep -qF '[pending]'; then
  NOTES=$(awk '
    /^## Working Notes$/ { found=1; next }
    found && /^## / { exit }
    found { print }
  ' "$SESSION" | sed '/^[[:space:]]*$/d' | head -10)

  if [ -n "$NOTES" ] && ! echo "$NOTES" | grep -qF '[empty]'; then
    RECAP="(No summary written — working notes from previous session)
$NOTES"
  else
    RECAP="No summary from previous session."
  fi
fi

# Write fresh session using quoted heredocs (no variable expansion issues)
cat > "$SESSION" << 'EOF'
# Session

## Previous Session Recap

EOF

# Append recap outside heredoc to avoid special char interpretation
printf '%s\n' "$RECAP" >> "$SESSION"

cat >> "$SESSION" << 'EOF'

## Goals

- [ ] ...

## Working Notes

[empty]

## End-of-Session Summary

[pending]
EOF

echo '{"suppressOutput": true}'

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

# If the Stop hook's lock file exists, the previous save may not have finished.
# Don't reset — the AI will read whatever state session.md is in.
# Clean up the stale lock so it doesn't persist forever.
LOCKFILE="${SCRIPT_DIR}/.claude/.session-lock"
if [ -f "$LOCKFILE" ]; then
  rm -f "$LOCKFILE"
  echo '{"suppressOutput": true}'
  exit 0
fi

# ─── Auto-archive old diary months ───

DIARY_DIR="${SCRIPT_DIR}/diary"
if [ -L "$DIARY_DIR" ]; then
  TARGET="$(readlink "$DIARY_DIR")"
  case "$TARGET" in /*) DIARY_DIR="$TARGET" ;; *) DIARY_DIR="$SCRIPT_DIR/$TARGET" ;; esac
fi

CURRENT_MONTH=$(date +%Y-%m)
if [ -d "$DIARY_DIR" ]; then
  for file in "$DIARY_DIR"/????-??-??.md; do
    [ -f "$file" ] || continue
    FILE_MONTH=$(basename "$file" | cut -c1-7)
    if [ "$FILE_MONTH" != "$CURRENT_MONTH" ]; then
      mkdir -p "${DIARY_DIR}/archive/${FILE_MONTH}"
      mv "$file" "${DIARY_DIR}/archive/${FILE_MONTH}/"
    fi
  done
fi

# Extract End-of-Session Summary using awk (exact heading match)
RECAP=$(awk '
  /^## End-of-Session Summary$/ { found=1; next }
  found && /^## / { exit }
  found { print }
' "$SESSION" | sed '/^[[:space:]]*$/d' | head -10)

# If no summary was written, preserve Working Notes as fallback
trimmed_recap=$(echo "$RECAP" | tr -d '[:space:]')
if [ -z "$RECAP" ] || [ "$trimmed_recap" = "[pending]" ]; then
  NOTES=$(awk '
    /^## Working Notes$/ { found=1; next }
    found && /^## / { exit }
    found { print }
  ' "$SESSION" | sed '/^[[:space:]]*$/d' | head -10)

  trimmed_notes=$(echo "$NOTES" | tr -d '[:space:]')
  if [ -n "$NOTES" ] && [ "$trimmed_notes" != "[empty]" ]; then
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

# Inject time-of-day context
HOUR=$(date +%H)
if [ "$HOUR" -ge 6 ] && [ "$HOUR" -lt 12 ]; then
  TIME_PERIOD="morning"
elif [ "$HOUR" -ge 12 ] && [ "$HOUR" -lt 18 ]; then
  TIME_PERIOD="afternoon"
elif [ "$HOUR" -ge 18 ] && [ "$HOUR" -lt 22 ]; then
  TIME_PERIOD="evening"
else
  TIME_PERIOD="night"
fi
printf '\n## Context\n\n- **Time**: %s (%s)\n' "$(date '+%A, %B %d, %Y at %H:%M')" "$TIME_PERIOD" >> "$SESSION"

cat >> "$SESSION" << 'EOF'

## Goals

- [ ] ...

## Working Notes

[empty]

## End-of-Session Summary

[pending]
EOF

# ─── First-run check ───
# If memory.md still has placeholders, override session with setup prompt

MEMORY="${SCRIPT_DIR}/memory.md"
if [ -L "$MEMORY" ]; then
  TARGET="$(readlink "$MEMORY")"
  case "$TARGET" in /*) MEMORY="$TARGET" ;; *) MEMORY="$SCRIPT_DIR/$TARGET" ;; esac
fi

if [ -f "$MEMORY" ] && grep -qF '[AI_NAME]' "$MEMORY" 2>/dev/null; then
  HOUR=$(date +%H)
  if [ "$HOUR" -ge 6 ] && [ "$HOUR" -lt 12 ]; then
    TIME_PERIOD="morning"
  elif [ "$HOUR" -ge 12 ] && [ "$HOUR" -lt 18 ]; then
    TIME_PERIOD="afternoon"
  elif [ "$HOUR" -ge 18 ] && [ "$HOUR" -lt 22 ]; then
    TIME_PERIOD="evening"
  else
    TIME_PERIOD="night"
  fi

  cat > "$SESSION" << SETUPEOF
# Session

## Previous Session Recap

Welcome! This is your first conversation. Memory setup has not been completed yet.

## Context

- **Time**: $(date '+%A, %B %d, %Y at %H:%M') (${TIME_PERIOD})
- **Status**: First run — setup required

## Goals

- [ ] Complete first-time memory setup

## Working Notes

[empty]

## End-of-Session Summary

[pending]
SETUPEOF
fi

echo '{"suppressOutput": true}'

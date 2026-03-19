#!/bin/bash
# Mechanical auto-save on conversation end.
# Copies Working Notes into End-of-Session Summary.
# Updates Last updated date.
# No AI needed — just data preservation.
#
# The INTELLIGENT save (learned patterns, decisions, projects)
# happens when the user says "save" during the conversation,
# where the AI has full context to do it properly.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION="${SCRIPT_DIR}/session.md"
MEMORY="${SCRIPT_DIR}/memory.md"

if [ ! -f "$SESSION" ]; then
  echo '{"suppressOutput": true}'
  exit 0
fi

# Extract Working Notes content
NOTES=$(awk '
  /^## Working Notes$/ { found=1; next }
  found && /^## / { exit }
  found { print }
' "$SESSION" | sed '/^[[:space:]]*$/d')

# Nothing to save
if [ -z "$NOTES" ] || echo "$NOTES" | grep -qF '[empty]'; then
  echo '{"suppressOutput": true}'
  exit 0
fi

# Copy Working Notes into End-of-Session Summary
# End-of-Session Summary is always the last section, so truncate and rewrite
summary_line=$(grep -n '^## End-of-Session Summary$' "$SESSION" | cut -d: -f1)
if [ -n "$summary_line" ]; then
  head -n "$summary_line" "$SESSION" > "${SESSION}.tmp"
  echo "" >> "${SESSION}.tmp"
  printf '%s\n' "$NOTES" >> "${SESSION}.tmp"
  mv "${SESSION}.tmp" "$SESSION"
fi

# Update Last updated date in memory.md
if [ -f "$MEMORY" ]; then
  today=$(date +%Y-%m-%d)
  awk -v d="$today" '
    /^\*Last updated:/ { print "*Last updated: " d "*"; next }
    { print }
  ' "$MEMORY" > "${MEMORY}.tmp" && mv "${MEMORY}.tmp" "$MEMORY"
fi

echo '{"suppressOutput": true}'

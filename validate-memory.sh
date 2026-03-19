#!/bin/bash
# Validates memory.md, session.md, and diary entries after edits.
# Returns JSON for Claude Code hooks.
# Usage: validate-memory.sh [memory|session|diary] [filepath]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MEMORY="${SCRIPT_DIR}/memory.md"
SESSION="${SCRIPT_DIR}/session.md"
SNAPSHOT_DIR="${SCRIPT_DIR}/.claude"
SNAPSHOT="${SNAPSHOT_DIR}/.memory-snapshot"
ERRORS=()

TARGET="${1:-memory}"
TARGET_FILE="${2:-}"

# Helper: extract content between an exact ## heading and the next ## heading
extract_section() {
  local file="$1" section="$2"
  awk -v s="## $section" '
    $0 == s { found=1; next }
    found && /^## / { exit }
    found { print }
  ' "$file"
}

# ─── memory.md checks ───

if [ "$TARGET" = "memory" ] && [ -f "$MEMORY" ]; then

  # Required sections (exact match, no \s — portable across macOS/Linux)
  for section in "Identity" "User" "Learned Patterns" "Decision Log" "Active Projects"; do
    if ! awk -v s="## $section" '$0 == s { found=1 } END { exit !found }' "$MEMORY"; then
      ERRORS+=("Missing required section: ## ${section}")
    fi
  done

  # Tables must have header separators
  for table in "Decision Log" "Active Projects"; do
    section_content=$(extract_section "$MEMORY" "$table")
    if [ -n "$section_content" ]; then
      if ! echo "$section_content" | grep -q '|.*---|'; then
        ERRORS+=("${table} section is missing its table format")
      fi
    fi
  done

  # Placeholder check
  if grep -qF '[AI_NAME]' "$MEMORY" 2>/dev/null; then
    ERRORS+=("Identity still has [AI_NAME] placeholder — run setup.sh first")
  fi

  # Size checks
  line_count=$(wc -l < "$MEMORY" | tr -d ' ')
  if [ "$line_count" -gt 200 ]; then
    ERRORS+=("memory.md is ${line_count} lines (max 200) — archive old entries")
  fi
  if [ "$line_count" -lt 10 ]; then
    ERRORS+=("memory.md is only ${line_count} lines — content may have been accidentally deleted")
  fi

  # Append-only integrity (compare against snapshot)
  if [ -f "$SNAPSHOT" ]; then
    old_patterns=$(extract_section "$SNAPSHOT" "Learned Patterns" | grep -c '^- ' || true)
    new_patterns=$(extract_section "$MEMORY" "Learned Patterns" | grep -c '^- ' || true)
    if [ "$new_patterns" -lt "$old_patterns" ]; then
      ERRORS+=("Learned Patterns shrank from ${old_patterns} to ${new_patterns} entries — append-only violation")
    fi

    # Count decision log data rows (all | rows including header — consistent between snapshots)
    old_decisions=$(extract_section "$SNAPSHOT" "Decision Log" | grep -c '^|' || true)
    new_decisions=$(extract_section "$MEMORY" "Decision Log" | grep -c '^|' || true)
    if [ "$new_decisions" -lt "$old_decisions" ]; then
      ERRORS+=("Decision Log shrank from ${old_decisions} to ${new_decisions} rows — append-only violation")
    fi
  fi

  # Save snapshot for next comparison
  mkdir -p "$SNAPSHOT_DIR"
  cp "$MEMORY" "$SNAPSHOT"
fi

# ─── session.md checks ───

if [ "$TARGET" = "session" ] && [ -f "$SESSION" ]; then

  for section in "Previous Session Recap" "Goals" "Working Notes" "End-of-Session Summary"; do
    if ! awk -v s="## $section" '$0 == s { found=1 } END { exit !found }' "$SESSION"; then
      ERRORS+=("session.md missing required section: ## ${section}")
    fi
  done

  session_lines=$(wc -l < "$SESSION" | tr -d ' ')
  if [ "$session_lines" -lt 4 ]; then
    ERRORS+=("session.md is only ${session_lines} lines — may have been accidentally wiped")
  fi
fi

# ─── diary entry checks ───

if [ "$TARGET" = "diary" ] && [ -n "$TARGET_FILE" ] && [ -f "$TARGET_FILE" ]; then

  # Check filename format (YYYY-MM-DD.md)
  basename_file=$(basename "$TARGET_FILE")
  if ! echo "$basename_file" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.md$'; then
    ERRORS+=("Diary filename '$basename_file' should be YYYY-MM-DD.md format")
  fi

  # Check entry has required fields
  if ! grep -qF '**Topics**' "$TARGET_FILE"; then
    ERRORS+=("Diary entry missing **Topics** field")
  fi
  if ! grep -qF '**Summary**' "$TARGET_FILE"; then
    ERRORS+=("Diary entry missing **Summary** field")
  fi

  # Check entry has session header
  if ! grep -qE '^## Session' "$TARGET_FILE"; then
    ERRORS+=("Diary entry missing '## Session — HH:MM' header")
  fi
fi

# ─── Output ───

if [ ${#ERRORS[@]} -eq 0 ]; then
  echo '{"suppressOutput": true}'
else
  msg="Memory validation failed:\\n"
  for err in "${ERRORS[@]}"; do
    # Escape backslashes and quotes for valid JSON
    safe_err=$(printf '%s' "$err" | sed 's/\\/\\\\/g; s/"/\\"/g')
    msg+="  - ${safe_err}\\n"
  done
  msg+="\\nFix these issues before continuing."
  echo "{\"hookSpecificOutput\": {\"hookEventName\": \"PostToolUse\", \"additionalContext\": \"${msg}\"}}"
fi

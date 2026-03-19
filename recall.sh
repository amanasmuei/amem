#!/bin/bash
# Echo Memory Recall — searches all memory sources for past context.
# Three-level search: diary → archive → current memory.
# Never fabricates — reports what it finds or says "not found".
#
# Usage:
#   recall.sh <keyword>                 # Single keyword
#   recall.sh "API rewrite"             # Phrase search
#   recall.sh auth migration postgres   # Multiple keywords (OR)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Resolve paths for multi-user support
DIARY="${SCRIPT_DIR}/diary"
MEMORY="${SCRIPT_DIR}/memory.md"

if [ -L "$DIARY" ]; then
  TARGET="$(readlink "$DIARY")"
  case "$TARGET" in /*) DIARY="$TARGET" ;; *) DIARY="$SCRIPT_DIR/$TARGET" ;; esac
fi
if [ -L "$MEMORY" ]; then
  TARGET="$(readlink "$MEMORY")"
  case "$TARGET" in /*) MEMORY="$TARGET" ;; *) MEMORY="$SCRIPT_DIR/$TARGET" ;; esac
fi

MEMORY_DIR="$(dirname "$MEMORY")"
ARCHIVE="${MEMORY_DIR}/archive/memory-archive.md"

if [ $# -eq 0 ]; then
  echo "Usage: recall.sh <keyword> [keyword2] ..."
  echo ""
  echo "Searches diary, archive, and memory for past context."
  echo ""
  echo "Examples:"
  echo "  recall.sh PostgreSQL"
  echo "  recall.sh \"API rewrite\""
  echo "  recall.sh auth migration"
  exit 1
fi

# Build grep -E pattern (OR of all keywords)
E_PATTERN=""
for kw in "$@"; do
  [ -n "$E_PATTERN" ] && E_PATTERN="${E_PATTERN}|"
  E_PATTERN="${E_PATTERN}${kw}"
done

# Colors
if [ -t 1 ]; then
  BOLD='\033[1m'; DIM='\033[2m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
  YELLOW='\033[0;33m'; RESET='\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; CYAN=''; YELLOW=''; RESET=''
fi

echo ""
printf "${BOLD}${CYAN}Memory Recall${RESET} — searching for: ${BOLD}$*${RESET}\n"

FOUND=false

# ─── Level 1: Search diary (current month + archived months) ───

if [ -d "$DIARY" ]; then
  DIARY_HITS=$(find "$DIARY" -name "*.md" -type f 2>/dev/null | sort -r)

  if [ -n "$DIARY_HITS" ]; then
    FIRST_DIARY=true
    while IFS= read -r file; do
      [ -z "$file" ] && continue
      MATCHES=$(grep -i -n -E "$E_PATTERN" "$file" 2>/dev/null | head -5) || true
      if [ -n "$MATCHES" ]; then
        FOUND=true
        if [ "$FIRST_DIARY" = true ]; then
          printf "\n${BOLD}Diary entries:${RESET}\n"
          FIRST_DIARY=false
        fi
        date_part=$(basename "$file" .md)
        printf "\n  ${GREEN}${date_part}${RESET}\n"
        echo "$MATCHES" | while IFS=: read -r num content; do
          printf "    ${DIM}L${num}:${RESET} ${content}\n"
        done
      fi
    done <<< "$DIARY_HITS"
  fi
fi

# ─── Level 2: Search archive ───

if [ -f "$ARCHIVE" ]; then
  ARCHIVE_HITS=$(grep -i -n -E "$E_PATTERN" "$ARCHIVE" 2>/dev/null | head -10) || true
  if [ -n "$ARCHIVE_HITS" ]; then
    FOUND=true
    printf "\n${BOLD}Archive (memory-archive.md):${RESET}\n"
    echo "$ARCHIVE_HITS" | while IFS=: read -r num content; do
      printf "  ${DIM}L${num}:${RESET} ${content}\n"
    done
  fi
fi

# ─── Level 3: Search current memory ───

if [ -f "$MEMORY" ]; then
  MEM_HITS=$(grep -i -n -E "$E_PATTERN" "$MEMORY" 2>/dev/null | head -10) || true
  if [ -n "$MEM_HITS" ]; then
    FOUND=true
    printf "\n${BOLD}Current memory (memory.md):${RESET}\n"
    echo "$MEM_HITS" | while IFS=: read -r num content; do
      printf "  ${DIM}L${num}:${RESET} ${content}\n"
    done
  fi
fi

# ─── Result ───

echo ""
if [ "$FOUND" = false ]; then
  printf "${YELLOW}No matches found for: $*${RESET}\n"
  echo "  Try different keywords or ask the AI directly."
fi
echo ""

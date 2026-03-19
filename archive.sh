#!/bin/bash
# Archives old entries from memory.md to keep it under 200 lines.
# Moves completed projects and old decisions to archive/memory-archive.md.
# Usage: archive.sh [--days N]  (default: 90 days for decision cutoff)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MEMORY="${SCRIPT_DIR}/memory.md"
TODAY=$(date +%Y-%m-%d)

# Resolve symlink for multi-user support
if [ -L "$MEMORY" ]; then
  TARGET="$(readlink "$MEMORY")"
  case "$TARGET" in /*) MEMORY="$TARGET" ;; *) MEMORY="$SCRIPT_DIR/$TARGET" ;; esac
fi

MEMORY_DIR="$(dirname "$MEMORY")"
ARCHIVE_DIR="${MEMORY_DIR}/archive"
ARCHIVE="${ARCHIVE_DIR}/memory-archive.md"
SNAPSHOT="${SCRIPT_DIR}/.claude/.memory-snapshot"

# Parse arguments
MAX_DAYS=90
while [ $# -gt 0 ]; do
  case "$1" in
    --days) MAX_DAYS="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Colors
if [ -t 1 ]; then
  BOLD='\033[1m'; DIM='\033[2m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
  YELLOW='\033[0;33m'; RESET='\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; CYAN=''; YELLOW=''; RESET=''
fi

if [ ! -f "$MEMORY" ]; then
  echo "Error: memory.md not found."
  exit 1
fi

# Helper: extract section content between headings
extract_section() {
  awk -v s="## $2" '$0 == s { found=1; next } found && /^## / { exit } found { print }' "$1"
}

# ─── Analyze ───

echo ""
printf "${BOLD}${CYAN}Memory Archive${RESET}\n"
echo ""

LINE_COUNT=$(wc -l < "$MEMORY" | tr -d ' ')
printf "  Current size: ${BOLD}${LINE_COUNT}${RESET} lines"
if [ "$LINE_COUNT" -gt 180 ]; then
  printf " ${YELLOW}(approaching 200 limit)${RESET}"
fi
echo ""

# Compute cutoff date (macOS / Linux compatible)
CUTOFF_DATE=$(date -j -v-${MAX_DAYS}d +%Y-%m-%d 2>/dev/null || date -d "-${MAX_DAYS} days" +%Y-%m-%d 2>/dev/null || echo "")
if [ -z "$CUTOFF_DATE" ]; then
  echo "  Warning: Could not compute cutoff date. Skipping decision archival."
  CUTOFF_DATE="0000-00-00"
fi

# Find completed projects
COMPLETED=()
while IFS= read -r line; do
  [ -z "$line" ] && continue
  status=$(echo "$line" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $3); print tolower($3)}')
  if echo "$status" | grep -qE '(completed|done|shipped|cancelled|archived|closed|finished)'; then
    COMPLETED+=("$line")
  fi
done < <(extract_section "$MEMORY" "Active Projects" | grep '^|' | tail -n +3)

# Find old decisions
OLD_DECISIONS=()
while IFS= read -r line; do
  [ -z "$line" ] && continue
  date_str=$(echo "$line" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')
  if echo "$date_str" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
    if [[ ! "$date_str" > "$CUTOFF_DATE" ]]; then
      OLD_DECISIONS+=("$line")
    fi
  fi
done < <(extract_section "$MEMORY" "Decision Log" | grep '^|' | tail -n +3)

# ─── Preview ───

echo ""
FOUND=false

if [ ${#COMPLETED[@]} -gt 0 ]; then
  FOUND=true
  printf "  ${BOLD}Completed projects:${RESET} ${#COMPLETED[@]}\n"
  for line in "${COMPLETED[@]}"; do
    name=$(echo "$line" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')
    printf "    ${DIM}→ ${name}${RESET}\n"
  done
fi

if [ ${#OLD_DECISIONS[@]} -gt 0 ]; then
  FOUND=true
  printf "  ${BOLD}Decisions older than ${MAX_DAYS} days:${RESET} ${#OLD_DECISIONS[@]}\n"
  for line in "${OLD_DECISIONS[@]}"; do
    decision=$(echo "$line" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $3); print $3}')
    date_str=$(echo "$line" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')
    printf "    ${DIM}→ ${date_str}: ${decision}${RESET}\n"
  done
fi

if [ "$FOUND" = false ]; then
  echo "  Nothing to archive."
  echo ""
  exit 0
fi

echo ""
printf "  Archive these entries? ${DIM}[Y/n]${RESET}: "
read -r confirm
if [ "$confirm" = "n" ] || [ "$confirm" = "N" ]; then
  echo "  Aborted."
  exit 0
fi

# ─── Archive ───

mkdir -p "$ARCHIVE_DIR"

if [ ! -f "$ARCHIVE" ]; then
  cat > "$ARCHIVE" << 'EOF'
# Memory Archive

Entries archived from memory.md. Reference when historical context is needed.
EOF
fi

# Append completed projects
if [ ${#COMPLETED[@]} -gt 0 ]; then
  {
    echo ""
    echo "## Completed Projects — ${TODAY}"
    echo ""
    echo "| Project | Status | Notes |"
    echo "|---------|--------|-------|"
    for line in "${COMPLETED[@]}"; do
      echo "$line"
    done
  } >> "$ARCHIVE"
fi

# Append old decisions
if [ ${#OLD_DECISIONS[@]} -gt 0 ]; then
  {
    echo ""
    echo "## Archived Decisions — ${TODAY}"
    echo ""
    echo "| Date | Decision | Context |"
    echo "|------|----------|---------|"
    for line in "${OLD_DECISIONS[@]}"; do
      echo "$line"
    done
  } >> "$ARCHIVE"
fi

# ─── Remove archived entries from memory.md ───

REMOVE_FILE=$(mktemp)
for line in "${COMPLETED[@]}" "${OLD_DECISIONS[@]}"; do
  echo "$line" >> "$REMOVE_FILE"
done

awk -v rmfile="$REMOVE_FILE" '
  BEGIN { while ((getline line < rmfile) > 0) remove[line] = 1 }
  !($0 in remove) { print }
' "$MEMORY" > "${MEMORY}.tmp" && mv "${MEMORY}.tmp" "$MEMORY"

rm -f "$REMOVE_FILE"

# ─── Update snapshot ───

mkdir -p "$(dirname "$SNAPSHOT")"
cp "$MEMORY" "$SNAPSHOT"

# ─── Summary ───

NEW_LINE_COUNT=$(wc -l < "$MEMORY" | tr -d ' ')
SAVED=$((LINE_COUNT - NEW_LINE_COUNT))

echo ""
printf "  ${GREEN}✓${RESET} Archived ${SAVED} lines\n"
printf "  ${GREEN}✓${RESET} memory.md: ${LINE_COUNT} → ${NEW_LINE_COUNT} lines\n"
printf "  ${GREEN}✓${RESET} Archive: $(basename "$ARCHIVE_DIR")/memory-archive.md\n"
echo ""

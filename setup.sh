#!/bin/bash
# AI Memory Template — Interactive Setup
# Safe with special characters (backslashes, quotes, &, etc.). Re-runnable.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MEMORY_PATH="${SCRIPT_DIR}/memory.md"

if [ ! -f "$MEMORY_PATH" ]; then
  echo "Error: memory.md not found at $SCRIPT_DIR"
  exit 1
fi

echo "=== AI Memory Template Setup ==="
echo ""

read -rp "AI name (e.g., Atlas, Nova): " ai_name
read -rp "AI role (e.g., coding partner, study buddy): " ai_role
read -rp "AI tone (e.g., direct and technical, warm and casual): " ai_tone
read -rp "AI traits (e.g., pragmatic, curious, honest): " ai_traits
echo ""
read -rp "Your name: " user_name
read -rp "Your focus areas (e.g., web dev, ML): " user_focus
read -rp "Your skill level (e.g., senior Python, beginner Rust): " user_level
read -rp "Preferred response style (e.g., concise, show code first): " user_style

# Export as env vars — ENVIRON[] in awk does NOT interpret backslash escapes
# (unlike -v which converts \n to newline, \t to tab, etc.)
export AWK_AI_NAME="$ai_name"
export AWK_AI_ROLE="$ai_role"
export AWK_AI_TONE="$ai_tone"
export AWK_AI_TRAITS="$ai_traits"
export AWK_USER_NAME="$user_name"
export AWK_USER_FOCUS="$user_focus"
export AWK_USER_LEVEL="$user_level"
export AWK_USER_STYLE="$user_style"
export AWK_TODAY="$(date +%Y-%m-%d)"

awk '
# Title line
/^# Memory — / { print "# Memory — " ENVIRON["AWK_AI_NAME"]; next }

# Identity table fields
/ \*\*AI Name\*\* / { print "| **AI Name** | " ENVIRON["AWK_AI_NAME"] " |"; next }
/ \*\*Role\*\* /    { print "| **Role** | " ENVIRON["AWK_AI_ROLE"] " |"; next }
/ \*\*Tone\*\* /    { print "| **Tone** | " ENVIRON["AWK_AI_TONE"] " |"; next }
/ \*\*Traits\*\* /  { print "| **Traits** | " ENVIRON["AWK_AI_TRAITS"] " |"; next }

# User table fields
/ \*\*Name\*\* /    { print "| **Name** | " ENVIRON["AWK_USER_NAME"] " |"; next }
/ \*\*Focus\*\* /   { print "| **Focus** | " ENVIRON["AWK_USER_FOCUS"] " |"; next }
/ \*\*Level\*\* /   { print "| **Level** | " ENVIRON["AWK_USER_LEVEL"] " |"; next }
/ \*\*Style\*\* /   { print "| **Style** | " ENVIRON["AWK_USER_STYLE"] " |"; next }

# Last updated
/^\*Last updated:/ { print "*Last updated: " ENVIRON["AWK_TODAY"] "*"; next }

# Everything else: pass through
{ print }
' "$MEMORY_PATH" > "${MEMORY_PATH}.tmp" && mv "${MEMORY_PATH}.tmp" "$MEMORY_PATH"

# Clean up env vars
unset AWK_AI_NAME AWK_AI_ROLE AWK_AI_TONE AWK_AI_TRAITS
unset AWK_USER_NAME AWK_USER_FOCUS AWK_USER_LEVEL AWK_USER_STYLE AWK_TODAY

echo ""
echo "Done! memory.md configured for $ai_name."
echo ""
echo "Next steps:"
echo "  1. Run ./install.sh if using inside another project"
echo "  2. Start a conversation — Claude Code auto-loads via CLAUDE.md"
echo "  3. For other AIs, paste: \"Read memory.md and session.md\""

#!/bin/bash
# Installs AI Memory Template hooks into the host project.
# Run this when the template is a SUBFOLDER of your project.
# Not needed if the template IS your project root.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Find project root
if git rev-parse --show-toplevel > /dev/null 2>&1; then
  PROJECT_ROOT="$(git rev-parse --show-toplevel)"
else
  PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
  echo "Not a git repo. Assuming project root: $PROJECT_ROOT"
  read -rp "Correct? (y/n): " confirm
  if [ "$confirm" != "y" ]; then
    read -rp "Enter project root path: " PROJECT_ROOT
    PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
  fi
fi

# If template IS the project root, no install needed
if [ "$SCRIPT_DIR" = "$PROJECT_ROOT" ]; then
  echo "Template is at project root — hooks already work. No install needed."
  exit 0
fi

# Calculate relative path from project root
RELPATH="${SCRIPT_DIR#$PROJECT_ROOT/}"

echo "=== AI Memory Template Install ==="
echo "Template:     $RELPATH/"
echo "Project root: $PROJECT_ROOT"
echo ""

# 1. Handle CLAUDE.md
if [ -f "$PROJECT_ROOT/CLAUDE.md" ]; then
  echo "Found existing CLAUDE.md — appending memory section."
  {
    echo ""
    echo "## Memory System"
    echo ""
    # Rewrite file paths to relative from project root
    sed "s|\`memory\.md\`|\`${RELPATH}/memory.md\`|g
         s|\`session\.md\`|\`${RELPATH}/session.md\`|g
         s|\`diary/|\`${RELPATH}/diary/|g" "$SCRIPT_DIR/CLAUDE.md" | tail -n +3
  } >> "$PROJECT_ROOT/CLAUDE.md"
else
  sed "s|\`memory\.md\`|\`${RELPATH}/memory.md\`|g
       s|\`session\.md\`|\`${RELPATH}/session.md\`|g
       s|\`diary/|\`${RELPATH}/diary/|g" "$SCRIPT_DIR/CLAUDE.md" > "$PROJECT_ROOT/CLAUDE.md"
fi
echo "  CLAUDE.md → done"

# 2. Create .claude/settings.json with correct paths
mkdir -p "$PROJECT_ROOT/.claude"
SETTINGS="$PROJECT_ROOT/.claude/settings.json"

if [ -f "$SETTINGS" ]; then
  echo ""
  echo "  WARNING: .claude/settings.json already exists."
  echo "  Please manually merge hooks from: $RELPATH/.claude/settings.json"
  echo "  Update script paths to use: $RELPATH/"
  echo ""
else
  cat > "$SETTINGS" << ENDOFSETTINGS
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ${RELPATH}/reset-session.sh",
            "timeout": 5,
            "statusMessage": "Resetting session..."
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path // .tool_response.filePath // \"\"' | { read -r f; if echo \"\$f\" | grep -q 'memory\\.md\$'; then bash ${RELPATH}/validate-memory.sh memory; elif echo \"\$f\" | grep -q 'session\\.md\$'; then bash ${RELPATH}/validate-memory.sh session; elif echo \"\$f\" | grep -q 'diary/.*\\.md\$'; then bash ${RELPATH}/validate-memory.sh diary \"\$f\"; else echo '{\"suppressOutput\": true}'; fi; }",
            "timeout": 10,
            "statusMessage": "Validating memory..."
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ${RELPATH}/auto-save.sh",
            "timeout": 5,
            "statusMessage": "Auto-saving session..."
          }
        ]
      }
    ]
  }
}
ENDOFSETTINGS
  echo "  .claude/settings.json → done"
fi

# 3. Update .gitignore
GITIGNORE="$PROJECT_ROOT/.gitignore"
for entry in ".claude/.memory-snapshot" ".claude/.session-lock" "*.bak"; do
  if [ ! -f "$GITIGNORE" ] || ! grep -qF "$entry" "$GITIGNORE"; then
    echo "$entry" >> "$GITIGNORE"
  fi
done
echo "  .gitignore → done"

echo ""
echo "Install complete!"
echo "Run '${RELPATH}/setup.sh' to configure your AI identity."

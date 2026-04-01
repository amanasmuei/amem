---
name: rules
description: Generate auto-extraction rules for AI tools. Writes guidelines to CLAUDE.md, .cursorrules, etc. that teach the AI when and how to store memories. Use when the user wants to set up proactive memory extraction.
disable-model-invocation: true
---

# /amem:rules — Generate Extraction Rules

Generate memory extraction guidelines for AI tools.

## Instructions

1. Run via Bash:
   ```
   amem-cli rules
   ```
   If `amem-cli` is not on PATH, use:
   ```
   npx @aman_asmuei/amem rules
   ```

2. This writes extraction rules to each tool's rules file:
   - Claude Code: `CLAUDE.md`
   - Cursor: `.cursorrules`
   - Windsurf: `.windsurfrules`
   - GitHub Copilot: `.github/copilot-instructions.md`

3. To target a specific tool:
   ```
   amem-cli rules --tool cursor
   ```

4. To write to a custom path:
   ```
   amem-cli rules --path ./my-rules.md
   ```

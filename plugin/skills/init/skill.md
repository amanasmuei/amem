---
name: init
description: Auto-configure amem for all detected AI tools (Claude Code, Cursor, Windsurf, GitHub Copilot). Use when the user wants to set up amem or configure it for their tools.
disable-model-invocation: true
---

# /amem:init — Auto-Configure AI Tools

Detect and configure amem for all installed AI tools.

## Instructions

1. Run via Bash:
   ```
   amem-cli init
   ```
   If `amem-cli` is not on PATH, use:
   ```
   npx @aman_asmuei/amem init
   ```

2. The command auto-detects Claude Code, Cursor, Windsurf, and GitHub Copilot, then adds amem to their MCP server configuration.

3. Tell the user to restart their AI tools after configuration.

4. To configure a specific tool only:
   ```
   amem-cli init --tool "Claude Code"
   ```

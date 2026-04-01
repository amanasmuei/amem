---
name: hooks
description: Install or uninstall amem lifecycle hooks for automatic memory capture in Claude Code. Captures tool observations, auto-summarizes sessions, and injects context at startup.
disable-model-invocation: true
---

# /amem:hooks — Lifecycle Hooks

Install automatic memory capture hooks for Claude Code.

## Instructions

1. To install hooks:
   ```
   amem-cli hooks
   ```
   If `amem-cli` is not on PATH, use:
   ```
   npx @aman_asmuei/amem hooks
   ```

2. To uninstall hooks:
   ```
   amem-cli hooks --uninstall
   ```

3. Installed hooks:
   - **SessionStart** — injects core memories and corrections at session start
   - **PostToolUse** — captures tool observations with pattern detection
   - **Stop** — auto-summarizes the session on exit

4. Hook scripts are stored in `~/.amem/hooks/` and configured in Claude Code's `settings.json`.

---
name: dashboard
description: Open the amem web dashboard. Use when the user wants to see their memories visually, browse the knowledge graph, or manage memories via a web UI.
disable-model-invocation: true
---

# /amem:dashboard — Open Web Dashboard

Launch the amem interactive web dashboard in the browser.

## Instructions

1. Run via Bash:
   ```
   amem-cli dashboard
   ```

2. Tell the user the dashboard is opening at `http://localhost:3333`

3. Mention key features:
   - Memory list with search, type filter, and tier filter
   - Interactive knowledge graph (drag, click to inspect)
   - Inline actions: Promote to Core, Demote, Expire
   - Export as JSON or Markdown
   - Session summaries timeline
   - Reminders with status badges

4. If port 3333 is in use, suggest:
   ```
   amem-cli dashboard --port=8080
   ```

---
name: team-export
description: Export shareable memories for teammates. Filters out private/personal data and creates a JSON file that teammates can import. Use when the user wants to share project knowledge with their team.
disable-model-invocation: true
---

# /amem:team-export — Export for Team

Export shareable memories as a JSON file for teammates.

## Instructions

1. Run via Bash (--user is required):
   ```
   amem-cli team-export --user <your-name>
   ```
   If `amem-cli` is not on PATH, use:
   ```
   npx @aman_asmuei/amem team-export --user <your-name>
   ```

2. Optional: specify output directory:
   ```
   amem-cli team-export --user aman --dir ./shared
   ```

3. The export:
   - Filters out private/personal preferences
   - Includes corrections, decisions, patterns, topology, and facts
   - Creates a timestamped JSON file ready to share

4. Teammates import with `amem-cli team-import <file>`.

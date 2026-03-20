# amem Evaluation Suite

10 evaluation questions testing whether an LLM can effectively use amem's MCP tools.

## Running evaluations

Each question is designed to be:
- **Independent** — no question depends on another
- **Deterministic** — single correct answer
- **Multi-step** — requires 2+ tool calls
- **Verifiable** — answer is a simple string comparison

### Manual testing

1. Start the amem server: `amem`
2. Connect via MCP Inspector: `npx @modelcontextprotocol/inspector`
3. Work through each question, verifying the answer matches

### With an LLM client

1. Connect amem to your MCP client (Claude Code, Cursor, etc.)
2. Start with a fresh database: `rm ~/.amem/memory.db`
3. Ask the LLM each question and verify the answer

## Question format

Questions are in `amem-eval.xml` using this format:

```xml
<qa_pair>
  <question>...</question>
  <answer>expected answer</answer>
</qa_pair>
```

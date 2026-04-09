# amem Prompt Best Practices

> **The guide for talking to your AI so memory actually works.**

This is not a reference doc. It's a playbook — how to speak to your AI so it saves the right things, recalls them at the right moments, and preserves the reasoning path across sessions.

If you've ever come back to a session thinking *"we figured this out last week but I can't remember what we decided"* — this guide is for you.

---

## The contract

Your AI doesn't save everything. It saves:

1. **What you explicitly tell it to save** (via phrases in this guide), and
2. **What it infers is important** (via the protocols in `copilot-instructions.md` or the aman-claude-code plugin)

Everything else is conversational noise that evaporates when the session ends. This is deliberate — raw transcripts would be 99% noise. Curated memory is the feature, not the limitation.

**Your job as the human:** use phrases the AI can categorize. Vague language produces no memory. Structured language produces structured memory.

**Your AI's job:** honor the phrases. Store with the right type, confidence, and scope. Surface them at the right moments. Flag when uncertain.

When both sides hold up their end, memory works. When either side slacks, memory silently fails — and you don't notice until the next session starts blank.

---

## Quick reference card

Keep this open in a sticky note for your first few sessions. Once the phrases are muscle memory, you'll stop needing it.

```
SAVE:    "remember that X"          → fact
         "don't X" / "never X"      → correction (always wins)
         "we decided X"             → decision
         "I prefer X over Y"        → preference
         "save that as X" (explicit)→ exact control

RECALL:  "what do you remember about X"
         "check your memory for X"
         "show me the context for X"

SESSION: "log this session"
         "save a session narrative"      ← ⭐ the big one
         "what did we figure out?"

PRIVACY: wrap sensitive text in <private>...</private>
         (stripped before storage)
```

---

## Save triggers — phrases that write memory

### Corrections — `confidence=1.0`, override everything

Use when you want the AI to **never** do something again. Corrections are the highest-priority memory in amem. They override facts, decisions, even the AI's instructions. A correction set last month still applies today.

| Say this | AI saves as |
|:---|:---|
| *"Don't X"* | correction, 1.0 |
| *"Never X"* | correction, 1.0 |
| *"Stop doing X"* | correction, 1.0 |
| *"I don't want X"* | correction, 0.9 |
| *"That was wrong because Y"* | correction with reason, 1.0 |

**Real examples:**
- *"Never add Co-Authored-By trailers to commits."*
- *"Don't use mocks in database integration tests."*
- *"Stop summarizing at the end of responses — I can read the diff."*

### Decisions — `confidence=0.9`, preserved choices

Use when you've picked between options. Decisions prevent re-litigating the same choice next week. Next session, when the AI suggests the path you already rejected, it shouldn't — because the decision is in memory.

| Say this | AI saves as |
|:---|:---|
| *"We decided to X"* | decision |
| *"Let's go with X"* | decision |
| *"Our choice is X because Y"* | decision with reasoning |
| *"For this project, we're using X"* | scoped decision |

**Real examples:**
- *"We're using Vitest instead of Jest for this repo."*
- *"We decided to ship the scope inheritance as a library fix, not an installer workaround."*
- *"Let's go with file-based identity, not SQLite, for dev scopes."*

### Facts & preferences — `confidence=0.7–0.8`, background context

Use when you want the AI to know something about you, the project, or the context.

| Say this | AI saves as |
|:---|:---|
| *"Remember that X"* | fact, 0.8 |
| *"FYI, X"* | fact, 0.7 |
| *"I prefer X over Y"* | preference |
| *"My [name/role/tool] is X"* | identity fact |
| *"For this project, X is true"* | project-scoped fact |

**Real examples:**
- *"Remember that I'm a data scientist, not a backend engineer."*
- *"FYI, this repo uses pnpm, not npm."*
- *"I prefer terse responses — no trailing summaries."*

### Explicit control — bypass the phrase catalog

Sometimes the AI's auto-categorization gets it wrong. When you know better:

| Say this | AI does |
|:---|:---|
| *"Save that as a correction"* | Forces type=correction |
| *"Store this as a decision with reasoning"* | Forces type=decision with structured content |
| *"Promote that to core memory"* | Calls `memory_tier` to raise priority |
| *"That's a fact, not a correction"* | Reclassifies a previous save |

---

## Recall triggers — phrases that read memory

| Say this | AI does |
|:---|:---|
| *"What do you remember about X"* | `memory_recall` (compact, fast) |
| *"Check your memory for X"* | `memory_multi_recall` (4-strategy search) |
| *"Search for X in memory"* | `memory_search` (exact match) |
| *"Show me the full context for X"* | `memory_detail` (full content, not preview) |
| *"What's my [preference/rule] on X"* | Narrow search by type |
| *"What did we decide about X"* | Search decisions specifically |

**Pro tip:** if the AI says *"I don't have memory of that"*, try `multi_recall` — it uses 4 search strategies (exact, semantic, temporal, related) and often finds things that the default `recall` misses.

---

## Session closers — preserve the reasoning path ⭐

This is the most underused pattern in the whole system, and fixing that is half the point of this guide.

| Say this | AI does |
|:---|:---|
| *"Log this session"* | `eval_log` + relationship summary |
| **"Save a session narrative"** | ⭐ Writes flowing prose (300–500 words) covering what we tried, what worked, what didn't, what we decided, dead ends, next steps |
| *"What did we figure out?"* | Generates a review summary, offers to save |
| *"Remember this work for next time"* | Curates + stores session highlights as facts |

### The session narrative pattern — in depth

Scattered `memory_store` calls capture **what we decided**. They don't capture **how we got there**.

Example: tonight's 11-release debugging marathon shipped aman-copilot v0.1.0 → v0.4.0, aman-mcp 0.6.2, and four other library bumps. Scattered memory captures:

> - *Fact: aman-copilot now supports Copilot CLI via `--cli` flag*
> - *Fact: aman-mcp dropped mammoth to fix Node 25 pako crash*
> - *Decision: library-level scope inheritance beats installer-side seeding*

But it loses:

> - That we *first* tried a file copy, then a symlink, then migrated to library fallback
> - That the scope mismatch was discovered by running `identity_read` in a real Copilot CLI session and getting *"No identity configured"*
> - That the Node 25 bug was a corrupted npx cache initially suspected, then proven reproducible, then diagnosed as a broken pako tarball
> - That the whole architectural shift from installer workaround to library fix was triggered by the realization that aman-agent had the same bug

**The session narrative captures all of that in flowing prose.** A single `memory_store` call with type=session_narrative and a 300–500 word story:

> *"We set out to scaffold aman-copilot as a sibling to aman-plugin. First attempt worked cleanly — ship v0.1.0. Then real-world testing in Copilot CLI surfaced three cascading bugs: the config path was wrong (fixed in v0.3.1), the MCP server crashed on Node 25 due to a broken pako tarball in mammoth's dep chain (fixed in aman-mcp 0.6.1 by dropping mammoth entirely — textutil covers .docx on macOS), and `identity_read` returned empty because the scope was empty. The third bug led to a design conversation about where scope inheritance belongs. We chose library-level over installer-side because..."*

Next session, `memory_recall("session narrative scope inheritance")` returns that entire narrative. You (or a future AI) can read it and know not just the facts, but the **reasoning path**.

### When to write a session narrative

**Always** when:
- A substantial bug was diagnosed through multiple hypotheses
- A design decision emerged from back-and-forth (the path taken matters)
- You shipped something non-trivial (narrative captures the "what broke and why" for future debugging)
- You made judgment calls that future-you might second-guess

**Optional** when:
- The session was pure implementation of an already-decided plan
- The outcome is already in a CHANGELOG entry
- Nothing surprising happened

### What makes a good narrative

Write as if you're telling a colleague who joined the project next week and asked *"how did we end up here?"*:

- **Intent**: what were we trying to do at the start?
- **Attempts**: what did we try, in order?
- **Dead ends**: what didn't work, and why? (This is the most valuable part.)
- **Pivot moments**: when and why did we change direction?
- **Outcome**: what shipped, what's still open
- **Lessons**: one or two reusable insights

300–500 words. Not a bullet list. Prose, because prose preserves causation (*"because X, we tried Y"*) in a way bullets can't.

---

## What the AI saves without being told

Even without your explicit triggers, the AI should be saving:

| Pattern | AI auto-saves |
|:---|:---|
| You say *"don't"* / *"never"* / *"stop"* mid-conversation | Correction, 1.0 |
| You reject the AI's suggestion with a reason | Correction with your reason |
| A bug is diagnosed → root cause identified | Fact with the causal chain, not just the fix |
| An architectural decision emerges from discussion | Decision with reasoning |
| The AI realizes it was operating on a wrong assumption | Correction to its own prior behavior |

If you notice the AI is **not** saving something that matters, don't assume it "got it" — reinforce explicitly: *"save that as a correction"* or *"that's a decision worth remembering"*. It's cheap to over-save; it's expensive to silently lose.

---

## What NOT to save

Memory has a cost. Every stored fact dilutes recall quality for the facts that matter. Don't save:

- **Secrets**: API keys, passwords, tokens. If you must mention them, wrap in `<private>...</private>` — the tag is stripped before storage. amem also auto-redacts common patterns.
- **Ephemeral state**: current tmp directory paths, session IDs, timestamps that don't matter beyond this hour.
- **Already-documented things**: content that's in `CLAUDE.md`, git commit messages, file headers, existing docs. The AI can read those directly; it doesn't need a duplicate in memory.
- **Re-derivable things**: facts the AI can figure out by reading the code next session (*"this file has 200 lines"*, *"we use TypeScript"*).
- **Transient emotional state**: *"I'm frustrated tonight"* is fine as context but don't persist it as a long-term fact.

**Rule of thumb:** if the fact will be useful three months from now, save it. If it's useful for the next 30 minutes, just say it in the conversation.

---

## Memory tiers — what goes where

amem has three tiers:

- **`core`** (always injected, ~500 tokens): constraints that **must** always be in context. Breaking them would cause real harm.
- **`working`** (session-scoped): temporary context for the current task.
- **`archival`** (default, searchable): everything else.

**Promote to core only when breaking the rule would cause real harm.** Examples of core-worthy:

- *"Never force-push to main."*
- *"Never commit secrets — always check .env isn't staged."*
- *"This codebase is production for a financial service; don't experiment here."*

Example of *not* core-worthy (belongs in archival):

- *"The user prefers Vitest."* (Useful, not catastrophic if forgotten.)

Promote via `memory_tier` or by saying *"promote that to core memory"*.

---

## Privacy & safety

- **Wrap sensitive text** in `<private>...</private>` before any memory save. The tags are stripped; only the redacted content is stored.
- **API keys, tokens, passwords** are auto-redacted by amem's detection rules. But don't rely on it — use `<private>` as belt-and-suspenders.
- **Review periodically** via `memory_export` to see what's actually in your store.
- **Forget explicitly** via `memory_forget` or `/forget`. The old memory becomes a tombstone (not deleted), so you can see what was removed and when.

If you paste a secret by accident, treat it as compromised immediately: rotate the credential, then `memory_forget` the stored fact, then `memory_doctor` to audit.

---

## Debugging memory

When memory feels off — stale facts, missing recalls, contradictory answers — use the self-heal tools before manually editing:

| Tool | When to use |
|:---|:---|
| `memory_doctor` | Something's weird, diagnose it |
| `memory_repair` | Doctor found fixable issues, apply them (dry-run first) |
| `memory_config` | See what amem is actually configured to do |
| `memory_sync` | Reconcile with external sources (Claude auto-memory, etc.) |
| `memory_history` | See the full timeline of changes |
| `memory_versions` | See how a specific fact has evolved |

These work without AI reasoning — they're diagnostic. Run them directly.

---

## Your first session with this guide

Try this opening in your next session:

> *"Read the amem prompt best practices guide and help me use memory well this session. Remind me when I should be saving something."*

The AI will:

1. Load this guide into context
2. Treat it as a meta-instruction
3. Actively coach you during the conversation: *"that sounds like a decision — want me to save it?"*

After a week of this, the phrases become muscle memory. The guide becomes unnecessary. The relationship becomes collaborative — memory stops being something you have to remember to use, and starts being something the AI keeps warm for you.

That's the end state. Presence over productivity, remember.

---

## Further reading

- [amem Claude Code integration guide](./claude-code.md) — surface-specific install and tools
- [amem Copilot CLI integration guide](./copilot-cli.md) — same, for Copilot
- [amem MCP tool reference](../mcp-tools.md) — the full 28-tool API if you want the machine-level view
- [MemoryCore by Kiyoraka](https://github.com/Kiyoraka/Project-AI-MemoryCore) — the original inspiration for the "Fundamental Truths" pattern and the session narrative approach that informs this guide

---

*This guide lives in `amem/docs/guides/prompt-best-practices.md`. Contributions welcome — especially real-world phrase examples and corrections to the phrase catalog as usage reveals what actually works.*

import type { MemoryTypeValue } from "./memory.js";

export interface ConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ExtractedMemory {
  content: string;
  type: MemoryTypeValue;
  confidence: number;
  tags: string[];
  source: string;
}

interface Pattern {
  type: MemoryTypeValue;
  patterns: RegExp[];
  confidence: number;
  roles: ConversationTurn["role"][];
}

const EXTRACTION_PATTERNS: Pattern[] = [
  // Corrections — user telling the AI "don't do X" or "always do Y"
  {
    type: "correction",
    patterns: [
      /\b(?:don'?t|never|stop|no,?\s+(?:don'?t|never|not))\b.*\b(?:use|do|add|include|write|put|make|create)\b/i,
      /\b(?:always|must|should always|never ever)\b.*\b(?:use|do|add|include|write|make)\b/i,
      /\bthat'?s (?:wrong|incorrect|not right)\b/i,
      /\bno,?\s+(?:that|this|it) (?:should|needs to|must)\b/i,
    ],
    confidence: 0.95,
    roles: ["user"],
  },
  // Decisions — "we decided", "let's go with", "the approach is"
  {
    type: "decision",
    patterns: [
      /\b(?:we (?:decided|chose|agreed)|let'?s (?:go with|use|stick with))\b/i,
      /\b(?:the (?:decision|approach|plan|strategy) is)\b/i,
      /\b(?:we'?re (?:going to|gonna)|we'll)\b.*\b(?:use|switch to|migrate to|adopt)\b/i,
    ],
    confidence: 0.85,
    roles: ["user"],
  },
  // Preferences — "I prefer", "I like to", "I want"
  {
    type: "preference",
    patterns: [
      /\bi (?:prefer|like to|want(?:ed)? to|tend to)\b/i,
      /\bmy (?:preference|style|approach|convention) is\b/i,
      /\bplease (?:always|use|keep|make sure)\b/i,
    ],
    confidence: 0.8,
    roles: ["user"],
  },
  // Patterns — "in this project we", "our convention is"
  {
    type: "pattern",
    patterns: [
      /\b(?:in this (?:project|repo|codebase)|our (?:convention|standard|pattern|practice))\b/i,
      /\bwe (?:usually|typically|always|normally)\b/i,
      /\bthe (?:convention|standard|pattern|practice) (?:here |in this )?is\b/i,
    ],
    confidence: 0.7,
    roles: ["user"],
  },
  // Topology — "X is in", "you can find X at"
  {
    type: "topology",
    patterns: [
      /\b(?:you(?:'ll| can| will)? find|(?:it|that|the \w+) (?:is|lives|sits) (?:in|at|under))\b.*(?:src\/|lib\/|config\/|\.\w+)/i,
      /\b(?:the (?:config|settings|env|database|api|routes?) (?:is|are|lives?) (?:in|at))\b/i,
    ],
    confidence: 0.7,
    roles: ["user"],
  },
];

export function extractMemories(turns: ConversationTurn[]): ExtractedMemory[] {
  const extracted: ExtractedMemory[] = [];

  for (const turn of turns) {
    const text = turn.content.trim();
    // Skip questions — they express uncertainty, not assertions
    if (text.endsWith("?")) continue;
    // Skip very short messages — not enough signal
    if (text.length < 15) continue;

    for (const pattern of EXTRACTION_PATTERNS) {
      if (!pattern.roles.includes(turn.role)) continue;

      for (const regex of pattern.patterns) {
        if (regex.test(text)) {
          if (extracted.some(e => e.content === text)) break;

          extracted.push({
            content: text,
            type: pattern.type,
            confidence: pattern.confidence,
            tags: ["auto-extracted"],
            source: "conversation-extractor",
          });
          break;
        }
      }
    }
  }

  return extracted;
}

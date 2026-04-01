import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export interface AmemConfig {
  // Embedding
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingCacheSize: number;

  // Retrieval
  retrieval: {
    semanticWeight: number;
    ftsWeight: number;
    graphWeight: number;
    temporalWeight: number;
    maxCandidates: number;       // Replaces the old 5K cap
    rerankerEnabled: boolean;
    rerankerTopK: number;
  };

  // Consolidation defaults
  consolidation: {
    maxStaleDays: number;
    minConfidence: number;
    minAccessCount: number;
    enableDecay: boolean;
    decayFactor: number;
  };

  // Privacy
  privacy: {
    enablePrivateTags: boolean;   // Strip <private>...</private> from storage
    redactPatterns: string[];     // Regex patterns to auto-redact (e.g., API keys)
  };

  // Hooks (automatic memory capture)
  hooks: {
    enabled: boolean;
    captureToolUse: boolean;      // PostToolUse hook
    captureSessionEnd: boolean;   // SessionEnd summarization
    autoExtractInterval: number;  // Minutes between auto-extractions (0 = disabled)
  };

  // Memory tiers
  tiers: {
    coreMaxTokens: number;       // Max tokens in core memory (always injected)
    workingMaxTokens: number;    // Max tokens in working memory (session-scoped)
  };

  // Team sync (future)
  team: {
    enabled: boolean;
    syncPath: string | null;     // Shared path for team memory sync
    syncInterval: number;        // Minutes between syncs
    userId: string | null;       // Unique user identifier for RBAC
  };
}

const DEFAULT_CONFIG: AmemConfig = {
  embeddingModel: "Xenova/all-MiniLM-L6-v2",
  embeddingDimensions: 384,
  embeddingCacheSize: 128,

  retrieval: {
    semanticWeight: 0.4,
    ftsWeight: 0.3,
    graphWeight: 0.15,
    temporalWeight: 0.15,
    maxCandidates: 50000,
    rerankerEnabled: false,
    rerankerTopK: 20,
  },

  consolidation: {
    maxStaleDays: 60,
    minConfidence: 0.3,
    minAccessCount: 2,
    enableDecay: false,
    decayFactor: 0.95,
  },

  privacy: {
    enablePrivateTags: true,
    redactPatterns: [
      "(?:api[_-]?key|secret|token|password|passwd|credential)\\s*[:=]\\s*['\"]?[A-Za-z0-9_\\-\\.]{8,}",
    ],
  },

  hooks: {
    enabled: true,
    captureToolUse: true,
    captureSessionEnd: true,
    autoExtractInterval: 0,
  },

  tiers: {
    coreMaxTokens: 500,
    workingMaxTokens: 2000,
  },

  team: {
    enabled: false,
    syncPath: null,
    syncInterval: 30,
    userId: null,
  },
};

let loadedConfig: AmemConfig | null = null;

export function getConfigPath(): string {
  const amemDir = process.env.AMEM_DIR || path.join(os.homedir(), ".amem");
  return path.join(amemDir, "config.json");
}

export function loadConfig(): AmemConfig {
  if (loadedConfig) return loadedConfig;

  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8").trim();
      if (raw) {
        const userConfig = JSON.parse(raw) as Partial<AmemConfig>;
        loadedConfig = deepMerge(DEFAULT_CONFIG, userConfig) as AmemConfig;
        return loadedConfig;
      }
    }
  } catch (error) {
    console.error("[amem] Failed to load config, using defaults:", error instanceof Error ? error.message : String(error));
  }

  loadedConfig = { ...DEFAULT_CONFIG };
  return loadedConfig;
}

export function saveConfig(config: Partial<AmemConfig>): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });

  // Merge with existing config
  const existing = loadConfig();
  const merged = deepMerge(existing, config) as AmemConfig;
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n");
  loadedConfig = merged;
}

export function getDefaultConfig(): AmemConfig {
  return { ...DEFAULT_CONFIG };
}

export function resetConfigCache(): void {
  loadedConfig = null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(base: any, override: any): any {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val !== undefined && val !== null) {
      if (typeof val === "object" && !Array.isArray(val) && typeof result[key] === "object" && !Array.isArray(result[key])) {
        result[key] = deepMerge(result[key], val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

// ── Privacy helpers ─────────────────────────────────────

/**
 * Strip <private>...</private> tags and redact patterns from content before storage.
 * Returns cleaned content, or null if the entire content is private.
 */
export function sanitizeContent(content: string, config?: AmemConfig): string | null {
  const cfg = config ?? loadConfig();

  if (!cfg.privacy.enablePrivateTags) return content;

  // Strip <private>...</private> blocks
  let cleaned = content.replace(/<private>[\s\S]*?<\/private>/gi, "[REDACTED]");

  // If entire content was private, return null (don't store)
  if (cleaned.trim() === "[REDACTED]" || cleaned.trim() === "") return null;

  // Apply regex redaction patterns
  for (const pattern of cfg.privacy.redactPatterns) {
    try {
      const regex = new RegExp(pattern, "g");
      cleaned = cleaned.replace(regex, "[REDACTED]");
    } catch {
      // Invalid regex pattern — skip
    }
  }

  return cleaned;
}

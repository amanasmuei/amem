# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `@types/better-sqlite3` dev dependency for full TypeScript type safety in `admin.ts`
- `tests/admin.test.ts` — test coverage for admin helper functions (`getByPath`, `setByPath`, `diffConfig`, `findOrphanRelations`, `runIntegrityCheck`)

### Changed
- `src/tools/admin.ts`: removed `@ts-ignore` for `better-sqlite3` import (now covered by `@types/better-sqlite3`)
- `src/index.ts`: empty `catch {}` blocks now log to stderr with `[amem]` prefix
- `src/index.ts`: startup sequence chains embedding backfill → vector index build in a single `setTimeout` instead of two independent timers
- `src/index.ts`: `backupDatabase()` throttled — skips backup if the most recent backup is less than 1 hour old
- `README.md`: corrected MCP tool count from 29 to 33

## [0.22.1] - 2026-04-09

### Fixed
- CLI `sync` command now uses `process.exit()` to bypass ONNX Runtime teardown crash on macOS

## [0.22.0] - 2026-04-08

### Added
- Four new admin MCP tools: `memory_doctor`, `memory_repair`, `memory_config`, `memory_sync`
  - `memory_doctor` — read-only diagnostics (integrity check, embedding coverage, orphan detection)
  - `memory_repair` — targeted repairs with dry-run default and pre-repair backups
  - `memory_config` — safe get/set/reset of the amem config with Zod validation and dangerous-key gate
  - `memory_sync` — cross-system import/export (Claude Code, GitHub Copilot, team sharing)
- `amem-core` bumped to `^0.5.0` for `runDiagnostics`, `syncFromClaude`, `exportForTeam`, `importFromTeam`, `syncToCopilot`

### Changed
- README headline updated to 94.8% R@5 (LongMemEval Oracle, 500q)

## [0.21.1] - 2026-04-08

### Changed
- Patch bump to refresh npm README (Malaysia footer)

## [0.21.0] - 2026-04-05

### Changed
- Migrated core engine to `@aman_asmuei/amem-core` v0.2.0 (separate npm package)
- TypeScript strict mode errors resolved with explicit types

## [0.20.0] - 2026-04-04

### Fixed
- Resolved TypeScript strict mode errors with explicit type annotations

## [0.11.1] - 2026-04-01

### Fixed
- README: skills are AI-invoked, not user slash commands

## [0.11.0] - 2026-04-01

### Added
- Claude Code plugin with hooks, skills, and marketplace support

## [0.10.0] - 2026-04-01

### Added
- Sync Claude Code auto-memory into amem with type mapping and dedup

## [0.9.2] - 2026-04-01

### Added
- Dashboard v3 with interactive knowledge graph, memory editing, and export

## [0.9.1] - 2026-04-01

### Added
- Cross-encoder reranking for improved recall precision
- Benchmark suite (`benchmarks/recall-accuracy.test.ts`)
- Auto-summarize sessions

## [0.9.0] - 2026-04-01

### Added
- Temporal intelligence: memory expiry, versioning, and auto-contradiction detection

## [0.8.2] - 2026-04-01

### Added
- `amem reset` CLI command to wipe all data and start fresh

## [0.8.1] - 2026-04-01

### Fixed
- Executable permissions on distributed binaries
- Empty config file handling

## [0.8.0] - 2026-04-01

### Added
- `amem init`, `amem rules`, and `amem dashboard` CLI commands

## [0.7.0] - 2026-03-31

### Added
- `amem-cli` binary registered in `package.json` bin field

## [0.5.0] - 2026-03-25

### Added
- Knowledge graph: `memory_relate`, `memory_since`, `memory_search`
- Reminders: `reminder_set`, `reminder_list`, `reminder_check`, `reminder_complete`

## [0.4.0] - 2026-03-25

### Added
- CI/CD: automated npm publish workflow on GitHub release

## [0.3.0] - 2026-03-20

### Added
- Memory consolidation (merge, prune, promote, decay)
- Project scoping — memories scoped to git repo or `AMEM_PROJECT` env var
- Global types: `correction`, `preference`, `pattern` surface across all projects

## [0.2.0] - 2026-03-20

### Added
- Structured output (`structuredContent`) on all tool responses
- `memory_inject` — smart context injection prioritising corrections and decisions
- Evaluation suite for recall accuracy

## [0.1.4] - 2026-03-20

### Added
- Contributing guidelines and project structure documentation

[Unreleased]: https://github.com/amanasmuei/amem/compare/v0.22.1...HEAD
[0.22.1]: https://github.com/amanasmuei/amem/compare/v0.22.0...v0.22.1
[0.22.0]: https://github.com/amanasmuei/amem/compare/v0.21.1...v0.22.0
[0.21.1]: https://github.com/amanasmuei/amem/compare/v0.21.0...v0.21.1
[0.21.0]: https://github.com/amanasmuei/amem/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/amanasmuei/amem/compare/v0.11.1...v0.20.0
[0.11.1]: https://github.com/amanasmuei/amem/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/amanasmuei/amem/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/amanasmuei/amem/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/amanasmuei/amem/compare/v0.9.4...v0.10.0
[0.9.4]: https://github.com/amanasmuei/amem/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/amanasmuei/amem/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/amanasmuei/amem/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/amanasmuei/amem/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/amanasmuei/amem/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/amanasmuei/amem/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/amanasmuei/amem/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/amanasmuei/amem/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/amanasmuei/amem/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/amanasmuei/amem/compare/v0.5.1...v0.7.0
[0.5.1]: https://github.com/amanasmuei/amem/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/amanasmuei/amem/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/amanasmuei/amem/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/amanasmuei/amem/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/amanasmuei/amem/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/amanasmuei/amem/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/amanasmuei/amem/releases/tag/v0.1.4

---
mode: plan
task: MVP AI Learning Coach (Vite+React+Vercel+Gemini)
created_at: "2026-01-08T21:36:52+08:00"
complexity: complex
---

# Plan: MVP AI Learning Coach (Vite+React+Vercel+Gemini)

## Goal
- User inputs a public GitHub repo URL → app generates a chapter plan → automatically presents Chapter 1 → user can ask questions anytime and get context-grounded answers → user marks the chapter complete → app offers continue vs a deep open-ended quiz.
- Persist learning state locally (no accounts): repo sessions, chapter progress, Q&A history, quiz attempts.
- Use Gemini only via a Vercel Serverless Function proxy; never expose API keys to the browser.
- Deploy and run on Vercel free tier.

## Scope
- In:
  - Vite + React (TypeScript) frontend.
  - Vercel Serverless Function `/api/llm` as a Gemini proxy.
  - Public GitHub repo ingestion with strict caps (file count/bytes/depth) and clear UX for failures.
  - Generate: learning plan (chapters), Chapter 1 content, in-chapter Q&A, deep open-ended quiz + grading.
  - Local persistence using IndexedDB (fallback to localStorage only for small flags).
  - Basic test coverage for critical logic and at least one end-to-end verification path.
- Out:
  - Private repos and GitHub auth/tokens.
  - Accounts/cloud sync.
  - Full-repo indexing/vector DB RAG.
  - Multi-model support (Gemini only).
  - Notification/reminders and advanced analytics.

## Assumptions / Dependencies
- Package manager: pnpm.
- Frontend language: TypeScript.
- Test tools: Vitest + React Testing Library; E2E: Playwright (or a documented manual checklist if E2E is blocked).
- Vercel environment variable: `GEMINI_API_KEY` (optional: `GEMINI_MODEL`).
- GitHub ingestion uses unauthenticated APIs/RAW fetch for a small curated subset of files; add a server proxy only if CORS/rate limits force it.
- LLM returns structured JSON for plan/chapter/quiz where feasible; validate with schemas and retry or degrade safely.

## Phases
1. Scaffold and core UI structure
2. Gemini proxy + structured outputs
3. GitHub ingestion + context bundling
4. Learning flow + persistence + quiz
5. Verification + docs + deploy readiness

## Tests & Verification
- Repo URL parsing supports common forms → `pnpm test` (Vitest).
- Ingestion selection and caps enforced → `pnpm test` with mocked fetch.
- LLM JSON schema validation + retry/degrade behavior → `pnpm test`.
- Persistence (create/recover session; progress; quiz attempts) → `pnpm test` + manual refresh check.
- Main flow works (repo → plan → chapter → Q&A → complete → quiz) → `pnpm e2e` (Playwright) or manual checklist if E2E unavailable.
- Build passes → `pnpm build`.

## Issue CSV
- Path: issues/2026-01-08_21-34-19-mvp-ai-learning-coach.csv
- Must share the same timestamp/slug as this plan.

## Tools / MCP
- auggie-mcp:codebase-retrieval — locate relevant files/symbols and keep edits consistent.
- context7:resolve-library-id — resolve official docs for libraries used.
- context7:query-docs — retrieve up-to-date usage patterns/examples for key libraries.
- Local tools: pnpm, Vitest, Playwright.

## Acceptance Checklist
- [ ] Browser never receives Gemini API keys; all Gemini calls go through `/api/llm`.
- [ ] User can input a public GitHub repo URL and get a multi-chapter plan.
- [ ] App automatically presents Chapter 1 (objectives, reading items, tasks).
- [ ] Chapter page supports Q&A grounded in the current chapter context bundle.
- [ ] User can mark the chapter complete and choose continue vs quiz.
- [ ] Quiz generates 3–5 deep open-ended questions, supports grading + feedback, and is saved.
- [ ] Refresh restores the last session and progress from local storage.
- [ ] Clear error UX for: invalid repo URL, repo not found, rate limit, oversized repos, LLM failures, schema failures.
- [ ] `pnpm build` passes; verification evidence exists per Issue CSV.

## Risks / Blockers
- Unauthenticated GitHub API rate limits and CORS constraints; mitigated via strict caps and optional proxy fallback.
- LLM structured JSON instability; mitigated via schema validation + retries + safe degradation.
- Playwright runtime dependencies may block E2E locally; fallback to manual checklist with explicit risk note.

## Rollback / Recovery
- Commit in small, reviewable increments after each phase; use `git revert` for rollbacks.
- Version storage schema; if breaking changes are needed, implement migration or safe reset with user-visible warning.

## Checkpoints
- Commit after: Phase 1 (scaffold + navigation)
- Commit after: Phase 2 (Gemini proxy + schema validation)
- Commit after: Phase 3 (GitHub ingestion + context bundle)
- Commit after: Phase 4 (learning flow + persistence + quiz)
- Commit after: Phase 5 (tests + docs + regression pass)

## References
- AGENTS.md:1
- docs/testing-policy.md:1
- issues/README.md:1
- docs/mcp-tools.md:1

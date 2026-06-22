# CODEX List

This file is append-only. Before writing code, read `TASK.md` and update this list with what was done.

## Completed

- Read `TASK.md` from `FMorgan-111/health-quiz` and extracted the API, DB, subscription, and testing requirements.
- Inspected the BetterMe competitor funnel and noted the step-based data flow and result/paywall shape.
- Set the project direction to Next.js Pages Router, Prisma, Neon, Zod, Vitest, Playwright, and Vercel.
- Created the project scaffold and mirrored it into a Windows-visible path for VS Code usage.
- Switched the app scaffold from App Router to Pages Router.
- Added core dependencies and scripts for Prisma, validation, unit tests, and E2E tests.
- Wrote the design doc and implementation plan under `docs/superpowers/`.
- Implemented and verified:
  - health assessment calculation
  - request validation and final-answer normalization
  - in-memory assessment flow for step save / progress recovery
  - result redaction for locked vs unlocked access
  - Prisma 7 config and Neon adapter client setup
- Installed dependencies in the Windows-visible repo copy and generated Prisma client artifacts there.
- Verified `npm run lint`, `npm run typecheck`, and the current core Vitest suites in the Windows-visible repo.
- Mirrored `CODEX_LIST.md` into the GitHub repository root so Claude Code can read the log directly.
- Read `CLAUDE_LIST.md` and reconciled the current handoff: this repo now treats the questionnaire engine as the active contract boundary.
- Added minimal `package.json`, `package-lock.json`, `tsconfig.json`, and `.gitignore` so `npm test`, `npm run typecheck`, and Prisma validation can run from the GitHub repo root.
- Added Prisma 6 Supabase/Postgres schema contract for `users`, `questionnaires`, `questions`, `options`, `assessments`, `assessment_answers`, and `subscriptions`, including `assessment_answers` idempotency and `subscriptions.user_id` uniqueness.
- Added shared API envelope helpers in `lib/api/envelope.ts` with `{code,message,data}` and TASK/CLAUDE handoff error codes.
- Added `lib/contracts/scoring-adapter.ts` to map DB-style question/answer rows to Claude's `ScoringQuestion[]`/`ScoringAnswer[]` without importing Prisma types into scoring.
- Added Codex-owned contract tests under `tests/codex-contracts/` for schema shape, response envelope, and DB-to-scoring adapter wiring.
- Verified `npm test` (34/34), `npm run typecheck`, and `prisma validate` with local placeholder `DATABASE_URL`/`DIRECT_URL`.

## Working Agreement

- Keep reading `TASK.md` before writing code.
- Add every meaningful completed action here.
- Use the Windows-visible repo at `C:\WINDOWS\system32\health-quiz-funnel` for VS Code work.

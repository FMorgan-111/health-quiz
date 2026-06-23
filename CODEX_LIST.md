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
- Cross-checked Claude's `scoreAssessment` + `buildReport` with mock DB-style rows through the Codex adapter in local `tests/codex-contracts/claude-cross-check.test.ts`.
- Mock cross-check covered dimension scoring, text-question exclusion, ghost-answer ignoring, free-tier protected-field absence, premium trend-only output, and pro full premium extras.
- Verified locally after the mock cross-check: `npx vitest run tests/codex-contracts/claude-cross-check.test.ts` (2/2), `npm test` (36/36), and `npm run typecheck`.
- Synced the latest root Markdown handoff docs from `origin/main` into the Claude integration worktree.
- Added the canonical Prisma 6 questionnaire-engine schema with 7 tables (`users`, `questionnaires`, `questions`, `options`, `assessments`, `assessment_answers`, `subscriptions`) and the `20260623000000_questionnaire_engine` migration.
- Verified the schema task with `npx vitest run tests/codex-contracts/schema-contract.test.ts` (4/4), `prisma validate`, and `prisma generate` using a `/tmp` Prisma engine cache.
- Added the shared API response envelope in `lib/api/envelope.ts` with stable TASK/CLAUDE handoff error codes and `ok()`/`err()` helpers.
- Verified the envelope task with `npx vitest run tests/codex-contracts/envelope.test.ts` (3/3) and re-ran the schema contract (4/4).
- Implemented JWT auth support for App Router: `/api/v1/auth/register`, `/api/v1/auth/login`, Bearer-token `/api/v1/users/me`, bcryptjs password hashing, 2h access tokens, 7d refresh tokens, and shared request authentication middleware.
- Added the scoring adapter contract module needed by Claude's integration tests (`lib/contracts/scoring-adapter.ts`).
- Verified the auth task with `npx vitest run tests/api/auth-routes.test.ts` (3/3), `npx vitest run tests/codex-contracts/scoring-adapter.test.ts` (3/3), and `npm run typecheck`.
- Implemented assessment/questionnaire App Router endpoints: `POST /api/v1/assessments`, `GET /api/v1/assessments/current`, `PATCH /api/v1/assessments/current/step/{step}`, and `GET /api/v1/questionnaires/{id}`.
- Assessment step submission now enforces Bearer auth, sequential steps, required-answer validation (`422` + `40001`), answer upsert idempotency, optimistic version conflicts (`409` + `40900`), and draft/in-progress/completed state transitions.
- Verified the assessment task with `npx vitest run tests/api/assessment-routes.test.ts` (4/4), auth route tests (3/3), and `npm run typecheck`.
- Implemented `GET /api/v1/assessments/current/report`, wiring DB questionnaire/answers through `scoring-adapter`, `scoreAssessment`, and `buildReport`.
- Report generation is idempotent per subscription tier: cached reports are reused for the same tier and recomputed when a user upgrades, then cached in `assessments.report` with `report_generated` status.
- Verified the report task with `npx vitest run tests/api/report-route.test.ts` (2/2), all API route tests (9/9), and `npm run typecheck`.
- Implemented subscription and mock payment endpoints: `POST /api/v1/subscriptions`, `GET /api/v1/subscriptions/me`, and HMAC-verified `POST /api/v1/subscriptions/callback`.
- Payment callback activation updates `subscriptions.status=active` and `users.subscription_tier` in one transaction, treats repeated callbacks as idempotent, and rejects bad signatures with `403` + `40300`.
- Verified the subscription task with `npx vitest run tests/api/subscription-routes.test.ts` (3/3), all API route tests (12/12), and `npm run typecheck`.
- Added an idempotent Prisma seed runner (`prisma/seed.ts`) and seed data for one published 8-step questionnaire across `physical`, `mental`, and `sleep`, with likert_5 questions and five ordered options each.
- Wired seed execution through `npm run seed` and Prisma's `prisma.seed` package config.
- Verified the seed task with `npx vitest run tests/seed/questionnaire-seed.test.ts` (2/2) and `npm run typecheck`; seed execution itself was not run because this worktree has no live `DATABASE_URL`.

## Working Agreement

- Keep reading `TASK.md` before writing code.
- Add every meaningful completed action here.
- Use the Windows-visible repo at `C:\WINDOWS\system32\health-quiz-funnel` for VS Code work.

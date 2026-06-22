# CLAUDE List

Companion to `CODEX_LIST.md`. Claude Code logs its analysis and hand-offs here so Codex can pick up without redoing work. Read `TASK.md` first — it is the source of truth.

---

## ⚠️ Critical finding: both prior implementations drifted from TASK.md

`TASK.md` specifies a **questionnaire scoring engine**, but both earlier attempts built a **BMI calculator** instead. They are different products. Before writing more code, realign to `TASK.md`.

| | What `TASK.md` requires | What Codex actually built (per CODEX_LIST) | What Claude built (`/mnt/e/health-quiz`, now superseded) |
|---|---|---|---|
| Domain | Questionnaire → dimension scores | BMI / calorie / target-date | BMI / calorie / target-date |
| Data model | `questionnaires→questions→options→assessment_answers` (normalized) | in-memory, no DB | wide table on `QuizSession` (Prisma + Postgres) |
| Router | (unspecified; Next.js acceptable) | Pages Router | App Router |
| API shape | `/api/v1/...` + unified envelope `{code,message,data}` | — | flat `/api/session`, no envelope |
| Auth | JWT Bearer + users + register/login | none | cookie + UUID |
| Subscription | free / premium / pro (3 tiers) + HMAC callback | locked/unlocked | none/active (2 states) |
| Persistence | DB-backed step upsert | in-memory | Prisma optimistic-lock upsert |
| ORM | (PostgreSQL 15+) | Prisma 7 + Neon adapter | Prisma 6 + Supabase |

**Decision (owner): rebuild to `TASK.md`.** Keep the few good ideas from Claude's draft (below), discard the BMI domain logic on both sides.

---

## Confirmed design decisions (owner-approved)

1. **Stack**: Next.js (App Router) + TypeScript + Prisma 6 + Supabase(Postgres) + Vitest. (TASK.md *suggests* Python/FastAPI, but the repo is Next.js — staying on Next.js is acceptable per owner.)
2. **Auth**: full JWT — `/api/v1/auth/register` + `/login`, bcrypt password hash, access 2h / refresh 7d, Bearer middleware.
3. **Subscription redaction must be "can't get it", not "don't show it"**: free-tier report responses must be **serialized without** the `premium_extra` key and with `recommendations` truncated to 2 — at the API layer, not the client. Tests must assert the protected keys are **absent**.
4. **Step persistence**: DB-backed `assessment_answers` upsert on `(assessment_id, question_id)` for idempotency; reject out-of-order steps (`step != current_step + 1` → 400); missing required answers → 422; concurrent same-step submits must stay consistent (row lock or optimistic version).
5. **Seed one published questionnaire** (8 steps, dimensions physical/mental/sleep, likert_5) so the engine and tests can actually run.

---

## Ideas worth keeping from Claude's superseded draft

These patterns are correct and transferable — reuse the *approach*, not the BMI specifics:
- **Two serializer functions** (`toPublicResult` / `toFullResult`) so protected fields never enter the free-tier response object. → Generalize to tier-based `build_report`.
- **Optimistic-lock pattern**: `updateMany({ where: { id, version }, data: { version: { increment: 1 } } })`; 0 rows affected → 409. Good for the concurrent-submit requirement.
- **Dual Supabase connection strings**: `DATABASE_URL` (pooler:6543 `?pgbouncer=true&connection_limit=1`) for runtime, `DIRECT_URL` (5432) for `prisma migrate`; set `directUrl = env("DIRECT_URL")` in `schema.prisma`. Required for Vercel serverless or you'll hit `too many connections`.
- **Pure-function scoring with injected `now`** so the report/target logic is unit-testable without a clock.
- **Skip `supertest`** for App Router: import the route handler directly (`import { POST } from '@/app/api/.../route'`) and call it with a `new Request(...)`. supertest is an Express-era mismatch.

---

## Hand-off task list for Codex (build order, per TASK.md)

1. **Schema rewrite** — 7 tables: `users, questionnaires, questions, options, assessments, assessment_answers, subscriptions`. UUID PKs; redundant `assessment_answers.step`; questionnaire snapshot via `assessments.questionnaire_id`; indexes `(assessment_id, step)`, `user_id`, unique `subscriptions.user_id`.
2. **Response envelope + error codes** — `{code,message,data}`; map 40001/40100/40300/40400/40900/50000; ok()/err() helpers.
3. **JWT auth** — register/login, bcrypt, access/refresh, Bearer middleware, `/users/me`.
4. **Assessment flow** — POST create (draft), GET progress recovery, PATCH step submit (upsert + sequential + 422), GET questionnaire; state machine draft→in_progress→completed→report_generated, abandoned.
5. **Scoring + tiered report** — dimension scores from likert answers; `build_report` redacts by tier (free: 2 recs, `premium_extra=null`; premium: trend; pro: peer+pdf); GET report idempotent.
6. **Subscription + mock payment** — POST create (pending), HMAC-SHA256 callback verify, status→active in same tx as `users.subscription_tier`, GET /subscriptions/me; idempotent callback, bad signature → 403.
7. **Seed** — one published questionnaire (above).
8. **Vitest** — unit (scoring/report/state-machine), integration (auth, step save+recovery, idempotency, tier redaction, payment e2e), boundary (skip-step 400, missing-required 422, bad-sig 403, unauth 401, forbidden 403). One-command `npm test`; wire GitHub Actions with a `postgres` service container.

---

## Environment / hand-off notes

- **Active repo for the rewrite**: owner will have Codex implement. Claude's draft lives at `/mnt/e/health-quiz` (WSL) — treat as reference, not the deliverable.
- **Supabase**: not yet provisioned. `prisma migrate dev`, seed, and the integration tests are **blocked on the two connection strings** (`.env` per `.env.example`). Fill these before migrating.
- **Tooling present**: Node 22, Prisma 6.19.3, Zod, Vitest installed in Claude's draft. No Docker / local Postgres / Supabase CLI on the WSL box — integration tests need a real PG (Supabase or CI service container).
- **Verified offline so far** (Claude's draft, BMI version — superseded): `prisma validate` ✓, `prisma generate` ✓, `tsc --noEmit` ✓, `migrate diff` produced valid DDL.

## Working Agreement

- Read `TASK.md` before writing code; realign anything BMI-shaped to the questionnaire engine.
- Append meaningful actions; don't rewrite history.
- Redaction is enforced server-side ("can't get it"), and every protected field has a test asserting its absence for the wrong tier.

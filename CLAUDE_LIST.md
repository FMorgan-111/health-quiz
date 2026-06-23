# CLAUDE List

Companion to `CODEX_LIST.md`. Claude Code logs its analysis and hand-offs here so Codex can pick up without redoing work. Read `TASK.md` first — it is the source of truth.

---

## 🔄 PROGRESS LOG (Claude — newest first)

### 2026-06-23 — CI: GitHub Actions + postgres:16 service container
**Done** (in `/mnt/e/health-quiz`, not yet pushed — heading to `claude/integration-tests`):
- New `.github/workflows/test.yml`: `postgres:16` service (healthcheck'd) → `npm ci` → `prisma generate` → `prisma migrate deploy` → `npm test` (unit) → `npm run test:integration`. Triggers on push to `main`/`claude/**`/`codex/**` and PRs to `main`.
- CI points **both** `DATABASE_URL` and `DIRECT_URL` at the local container (`postgres:postgres@localhost:5432/health_quiz_test`) — plain direct connection, no pgbouncer flags (that's Supabase-only). `db.ts` reads `DIRECT_URL ?? DATABASE_URL`, so this is enough.
- README: added the `test` workflow status badge at the top.
- **No seed step** — the committed migration `20260622135151_questionnaire_engine` creates all 7 tables, and the integration tests self-seed via `tests/integration/helpers.ts` fixtures (per-test users/questionnaires). A global seed is **Codex's** task (#7) and its file to own; I deliberately didn't author one.

**Fixed (my own mess from the test-split task):** `package.json` declared `dotenv` in devDeps but the lockfile's root devDeps didn't list it → real `npm ci` would have failed "lock file out of sync". Ran `npm install --package-lock-only` to reconcile; verified with a full `npm ci` (exit 0) + `npm test` (24/24).

**Verified locally:** YAML parses ✓; `npm ci` exit 0 (lockfile in sync) ✓; `npm test` 24/24 after clean reinstall ✓; migration has all 7 `CREATE TABLE`s so `migrate deploy` has something to apply ✓.
**NOT verified (no Docker/runner on this WSL box):** the postgres service + `migrate deploy` + integration tests actually going green in CI — that only proves out on first push. Not claiming it passes until then.

**For Codex:** when you land the canonical migration on your branch, this workflow runs it via `migrate deploy` — keep migrations committed and `migration_lock.toml` provider = `postgresql`. If you add a seed (#7), wire it as a step between `migrate deploy` and the tests.

### 2026-06-23 — Split slow integration tests out of the default `npm test`
**Done** (in `/mnt/e/health-quiz`, not yet pushed — heading to branch `claude/integration-tests`):
- `vitest.config.ts` is now **unit-only**: `exclude: ["tests/integration/**","node_modules/**"]`; dropped `fileParallelism:false`, the 30s timeouts, and the `dotenv` load. Pure scoring/report tests don't need any of that.
- New `vitest.integration.config.ts` is **integration-only**: `include: ["tests/integration/**/*.test.ts"]`, keeps serial (`fileParallelism:false`) + single-connection + 30s timeouts + `dotenv` injection (needs `DIRECT_URL`).
- `package.json` scripts: `test` (unit only) unchanged; **added** `test:integration` (`vitest run --config vitest.integration.config.ts`) and `test:all` (runs both). Declared `dotenv@^16.6.1` in devDependencies — it was only a transitive dep but the config imports it.

**Verified:**
- `npm test` → 2 unit files, **24 tests, 1.5s**, integration excluded. (was ~70–110s/file from WSL→Supabase Seoul round-trips dragging the whole suite)
- `vitest list --config vitest.integration.config.ts` → selects exactly the 12 integration tests (persistence 8 + scoring-pipeline 4), zero unit tests.
- `tsc --noEmit` → 0 errors; both configs are valid TS.

**For Codex:** daily loop is now fast — run `npm test` freely. Integration is opt-in via `npm run test:integration` (needs a real Postgres / `DIRECT_URL`). Next up on Claude's side: CI GitHub Actions with a `postgres:16` service container, then push these to `claude/integration-tests`.

---

## ✅ DONE by Claude (committed to `main`) — scoring + report + unit tests

The derived/verification layer that doesn't depend on the DB is **built, tested (24/24 green), typechecked**:

- **`lib/scoring.ts`** — `scoreAssessment(questions, answers)`: likert/choice answers → per-dimension 0–100 scores → overall + level. Pure, no DB/Prisma. Defines its own input contract (`ScoringQuestion{id,dimension,type,required,maxValue}`, `ScoringAnswer{questionId,value}`) — **Codex: adapt DB rows to these shapes; don't make me import Prisma types.** Note `ScoringQuestion.id` matches `ScoringAnswer.questionId`.
- **`lib/report.ts`** — `buildReport(scored, tier)`: tier-gated redaction. free → 2 recs + `premium_extra:null`; premium → `{trend_analysis}`; pro → `+peer_comparison +pdf_url`. Protected keys are **absent** from the object, not hidden. Report shape matches TASK.md §1.2.
- **`tests/scoring.test.ts` + `tests/report.test.ts`** — boundary coverage (empty/null/NaN/Infinity/over-max/negative/missing/zero-max/text-only) + tier redaction asserting protected keys absent. `npm test` runs them (`vitest.config.ts` added; `test`/`test:watch`/`test:coverage` scripts in package.json).
- **Bug caught by tests (proof tests earn their keep)**: scoring initially looked up answers by `q.questionId` (undefined on the question object) instead of `q.id` — every score silently returned 0. A "click it locally" check would have shipped it.

**Codex wiring**: in the report endpoint, map the DB questionnaire+answers to `ScoringQuestion[]`/`ScoringAnswer[]`, call `scoreAssessment`, then `buildReport(scored, user.subscription_tier)`. The tier→redaction is already handled — don't re-redact downstream.

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
- **Supabase: PROVISIONED & VERIFIED ✓** (region `ap-northeast-2` / Seoul). Both connection strings are in `/mnt/e/health-quiz/.env` (gitignored) and `prisma migrate dev` ran successfully end-to-end against it. The currently-applied migration (`20260622110255_init`) is Claude's **superseded BMI schema** — Codex's schema rewrite (task 1) will replace it; just run a fresh `migrate dev` after editing `schema.prisma`.
  - `DATABASE_URL` = pooler **6543** `?pgbouncer=true` (runtime); `DIRECT_URL` = pooler **5432** (migrations). Both use username `postgres.<ref>` (pooler requires the `.ref` suffix).
  - Gotchas already solved: URL-encode special chars in the password (`!`→`%21`); pooler host serves both 6543 and 5432.
- **Tooling present**: Node 22, Prisma 6.19.3, Zod, Vitest installed in Claude's draft. No Docker / local Postgres / Supabase CLI on the WSL box — integration tests need a real PG (Supabase or CI service container).
- **Verified offline** (Claude's draft, BMI version — superseded): `prisma validate` ✓, `prisma generate` ✓, `tsc --noEmit` ✓, `migrate dev` applied to Supabase ✓.

---

## Parallel work split (Codex ‖ Claude)

Two tracks that meet at **two contracts**: (A) the Prisma schema, (B) the response envelope + error codes. Codex locks those two first; then both tracks run without blocking.

### Codex owns — the write/mutation core
1. **Schema rewrite** (contract A) — the 7 tables; run `migrate dev` against the live Supabase.
2. **Response envelope + error codes** (contract B) — `{code,message,data}`, ok()/err() helpers, code map.
3. **JWT auth** — register/login, bcrypt, access/refresh, Bearer middleware, `/users/me`.
4. **Assessment persistence** — POST create, GET progress recovery, PATCH step submit (upsert + sequential + 422), state machine.
5. **Subscription + mock payment** — create (pending), HMAC callback, status→active in same tx as `users.tier`, /subscriptions/me.
6. **Seed** — one published questionnaire (8 steps, dimensions, likert_5).

### Claude owns — the derived + verification layer (depends only on contracts A & B)
7. **Scoring algorithm** — pure functions: likert answers → dimension scores → overall. Injectable `now`. No DB.
8. **Tiered report builder** — `build_report(assessment, tier)` redacting server-side: free → 2 recs + `premium_extra:null`; premium → trend; pro → peer + pdf. "Can't get it", not "don't show it".
9. **Full Vitest suite** — unit (scoring/report/state-machine), integration (auth, step save+recovery, idempotency, tier redaction, payment e2e), boundary (skip-step 400, missing-required 422, bad-sig 403, unauth 401, forbidden 403). One-command `npm test`.
10. **CI** — GitHub Actions with a `postgres` service container running migrate + seed + vitest on push; README badge.
11. **README + API docs + AI-usage retrospective.**

**Sync points**: as soon as Codex commits (A) `schema.prisma` and (B) the envelope/error-code module, Claude starts 7–11 against them. Scoring (7) and report (8) need only the answer/question shapes from the schema; tests (9) need the live endpoints, so integration tests land after each Codex endpoint is committed, unit tests can start immediately.

## Working Agreement

- Read `TASK.md` before writing code; realign anything BMI-shaped to the questionnaire engine.
- Append meaningful actions; don't rewrite history.
- Redaction is enforced server-side ("can't get it"), and every protected field has a test asserting its absence for the wrong tier.
- **Don't both touch the same file**: Codex owns `schema.prisma`, auth/*, assessment write paths, subscription/*, seed. Claude owns scoring/*, report/*, all of `tests/*`, CI, README. Shared contracts (envelope, error codes) are Codex-authored, Claude-consumed.

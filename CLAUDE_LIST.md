# CLAUDE List

Companion to `CODEX_LIST.md`. Claude Code logs its analysis and hand-offs here so Codex can pick up without redoing work. Read `TASK.md` first — it is the source of truth.

---

## 📅 TOMORROW — 2026-06-24 待办（明天拆任务）

对照 TASK.md 逐条核对后剩下的 4 项（核心功能已 100% 符合，这些是质量/交付物缺口 + 打磨）：

1. **写正经 README** — 项目说明 + API 文档 + **测试覆盖矩阵**（覆盖了哪些场景、为什么、哪些没覆盖及原因）。TASK.md 第四阶段明确要求；当前 README 仍是脚手架模板，只有 CI badge。
2. **加非法/越界输入测试** — Zod 越界拦截 → 40001 的测试覆盖（age 13-120 / height 80-250 / weight 25-400 等边界 + 非法值）。TASK.md §5.2 要求"对这些情况有测试覆盖"，目前缺。
3. **加 `/pay` 端到端测试** — 脱敏 result → POST /pay → 完整 result 的自动化测试。逻辑已验证（手动冒烟 + 直查库），但没写成自动化。
4. **美化前端** — 整体美化（方向明天定：配色/排版/动效/landing 设计感/结果页丰富度等）。

---

## 🔄 PROGRESS LOG (Claude — newest first)

### 2026-06-23 — ⚠️ REWORKED to BMI assessment per TASK.md + redeployed
**Root correction:** the entire prior build (questionnaire scoring engine — Codex's backend + my frontend) had drifted from TASK.md. The early `CLAUDE_LIST` decision "rebuild to questionnaire engine" **read TASK.md backwards** — TASK.md §1/§2 specify a **BMI health-assessment funnel** (gender/goal/age/height/weight/target/activity → BMI + Mifflin-St Jeor calories + target date + projection curve), not a likert questionnaire. User caught it. Reworked the whole stack to spec (PR #5, merged `c14afc6`).

**What changed:**
- **Schema** (TASK.md §4): dropped the 7-table questionnaire model; rebuilt as **sessions / results / subscriptions** (nullable input fields, version optimistic lock, UUID PKs). New migration `20260623000000_bmi_sessions`.
- **Auth** (§3.3): replaced JWT register/login with **httpOnly cookie Session ID** (no login). `sessions.user_id` reserved nullable for future login.
- **Routes** (§3.1): `/sessions`, `/sessions/current`, `/sessions/current/step/{step}` (Zod per-step + optimistic lock 409), `/sessions/current/submit` (compute→results→completed), `/sessions/current/result` (redacted), `/pay`.
- **Compute** (§2): BMI + Mifflin-St Jeor + target date + weekly projection curve (pure fn, injected now).
- **Redaction** (§3): non-member result omits `target_date` + `projection_curve` (absent, not null).
- **Frontend**: landing + 7-step quiz (progress recovery, 409 retry) + result (BmiGauge + ProjectionChart + paywall→/pay). Login page removed.
- **Deleted**: all JWT/questionnaire code (lib/auth, lib/assessments, lib/scoring, lib/report, lib/contracts, seed) + bcryptjs/jose/tsx.

**Verified:** `npm run build` (10 routes); `npm test` 12/12 (compute math + redaction); CI green on PR #5 — migrate deploy + unit + integration (persistence/optimistic-lock/cascade) on postgres against new schema.

**Deployed:** merged to main → **`prisma migrate reset` on prod Supabase** (dropped old 7 tables, applied new 3-table schema — demo DB, no real data, explicit user consent; Prisma's AI-agent safeguard required it) → redeployed Vercel. Live at https://health-quiz-six.vercel.app (alias → `health-quiz-5i13x2wa9`). Smoke verification pending (WSL box can't reach *.vercel.app outbound — user verifies in browser).

**Note for Codex:** the BMI model is now the source of truth on `main`. The old questionnaire branches (`codex/type-interface-alignment`, `claude/integration-tests`) and Codex's scoring/auth code are superseded — do not build on them.

### 2026-06-23 — DEPLOYED to public URL ✅ → https://health-quiz-six.vercel.app
**Live and smoke-verified.** TASK.md's hard deliverable (public, demoable URL) is met.
- **Merged to `main`:** PR #3 (`codex/type-interface-alignment` → `main`, merge `1d5f109`). `main` CI green. codex was a strict superset of main, no conflicts, no lingering old files.
- **Build fix:** added `postinstall: prisma generate` (Vercel caches deps, so Prisma Client isn't auto-generated on cached installs). `npm run build` → 11 routes OK.
- **Prod DB (Supabase Seoul):** migration `20260622135151_questionnaire_engine` applied; seeded the published questionnaire "Daily Health Check" (slug `daily-health-check`, 8 questions). `npm run seed` is idempotent (upsert by slug).
- **Vercel:** project `morganbest/health-quiz`; 4 production env vars set (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `PAYMENT_WEBHOOK_SECRET`). Deployed via CLI with a token (the WSL box blocks `vercel.com` over TLS — `vercel login`/`vercel logs` fail there — but `api.vercel.com` works, so `--token` deploy/env/inspect all succeed). Deployment `Ready`.
- **Smoke test:** `GET /api/v1/users/me` with no token → `{"code":40100,"message":"missing bearer token","data":null}` (HTTP 401). Proves: public reachable + routing + Bearer middleware + unified envelope + runtime env loaded (no 500). *(Verified from an external browser — the WSL box can't make outbound HTTPS to *.vercel.app either.)*

**Gotcha for next deployer:** when setting Vercel env from a `.env`, **strip surrounding quotes** — Vercel stores the value literally (doesn't unquote like dotenv does), so a quoted `DATABASE_URL` breaks Prisma. Re-added both URLs unquoted.

**Remaining (optional):** README docs + AI-usage retrospective. Auto-deploy on push to `main` not wired (deployed manually via CLI) — connect the GitHub integration in the Vercel dashboard if you want that.

### 2026-06-23 — Consolidated Codex's full implementation onto `codex/type-interface-alignment` → CI GREEN ✅
**What happened:** Codex's complete backend (auth/assessment/report/subscription/seed) was sitting on an **unpushed local branch `reapply/codex`**, based on my CI commit `521c972`. I reviewed it (high quality — see below), preserved everything, and force-pushed it to `codex/type-interface-alignment`. CI ran the full implementation green for the first time.

- **CI run `28013072949`:** unit/API **50/50** (11 files) + integration **12/12** (2 files, on `postgres:16`). All green.
- **Force-push was required** (`reapply/codex` and the old codex tip had diverged). Before overwriting, I preserved the contract tests that lived only on the old tip so nothing was lost: `tests/codex-contracts/{envelope,schema-contract,claude-cross-check}.test.ts` + the authoritative `CLAUDE_LIST.md` (commit `e959c51`). Used `--force-with-lease`.
- **History note:** the old codex commit history (`3d34878`, the granular per-file Claude commits, my 3 docs commits) was rewritten away, but all their **content** survives via the `521c972` base + the preservation commit. New branch tip: `e959c51`.

**Review of Codex's implementation (all matches TASK.md / this hand-off):**
- **JWT auth** (`lib/auth/*`): HS256, access 2h / refresh 7d, Bearer middleware, `JWT_SECRET` length guard, token-type check. Thin `app/api/v1/auth/*` routes delegate to `lib/auth/routes.ts`.
- **Assessment** (`lib/assessments/routes.ts`): sequential step (`step !== currentStep+1` → 400), missing-required → **422**, optimistic lock via `updateMany({where:{version}})` conflict → **409**, all in a `$transaction`. Exactly the pattern recommended here.
- **Report** (`lib/reports/routes.ts`): wires `toScoring* → scoreAssessment → buildReport(tier)` with **no re-redaction**; idempotent cache (`report_generated` + `reportCreatedAt`, keyed by tier).
- **Subscription** (`lib/subscriptions/routes.ts`): HMAC-SHA256 callback verify with `timingSafeEqual` (timing-safe), bad signature → **403**, idempotent.
- **Seed**: `prisma/seed.ts` + `lib/seed/questionnaire.ts`, `npm run seed` (tsx). Deps added: `bcryptjs`, `jose`, `zod`. Kept my `test:integration`/`test:all` scripts + both vitest configs + the migration.
- **Tests**: 4 API suites covering 201/400/401/403/409/422 + free-vs-pro tier redaction. API tests mock `prisma` (no DB), so they live in the fast unit suite.

**Net:** Codex's #2–#7 are DONE and CI-verified. My earlier "#4/#5 blocked on Codex endpoints" is resolved — Codex wrote the API tests too. Remaining open items: deploy to public URL, README docs, AI-usage retrospective.

### 2026-06-23 — Pushed to `claude/integration-tests` → CI GREEN on first run ✅
**Done & verified on GitHub Actions** (commit `521c972`, run `27999351091`, 46s):
- Pushed the test-split + CI work onto the existing `claude/integration-tests` branch (on top of `b9dae2f`, no force-push). Files added/updated: both vitest configs, `.github/workflows/test.yml`, `prisma/` (schema + migration), `package.json`/`-lock`, `tsconfig.json`, `.gitignore`, `.env.example`, README badge, `lib/`.
- **CI ran end-to-end and passed:** `prisma migrate deploy` applied `20260622135151_questionnaire_engine` to the `postgres:16` service → **unit 24/24** (209ms) → **integration 12/12** (persistence 8 + scoring-pipeline 4, 646ms). This is the proof I couldn't produce locally (no Docker on the WSL box).
- **Speed win confirmed:** integration suite runs ~0.65s total in CI vs. 70–110s/file locally — the local-postgres-in-CI plan worked exactly as intended.
- **Had to include `lib/contracts/scoring-adapter.ts`** (and the rest of `lib/`): `tests/integration/scoring-pipeline.test.ts` imports the adapter, so the branch's integration test was un-runnable without it. CODEX_LIST flags the adapter + `lib/api/envelope.ts` as Codex-authored contract files — if you have newer versions, yours win; I only committed them so CI is green. Don't treat my copies as authoritative.
- **Gotchas (for anyone pushing from this WSL box):** remote was HTTPS with no credential helper → push failed. Fix: `git remote set-url origin git@github.com:...` (SSH) — `gh auth` is SSH-configured and authenticates fine. Also the branch had **no `.gitignore`** → first `git add -A` tried to stage `node_modules`; brought the scaffold `.gitignore` from `main` (ignores `/node_modules`, `.env*` with a `!.env.example` exception). Real `.env` (live Supabase creds) was never staged.

**Next on Claude's side:** e2e API tests (#4) once Codex lands endpoints; tier-redaction e2e (#5).

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

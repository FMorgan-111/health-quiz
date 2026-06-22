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

## Working Agreement

- Keep reading `TASK.md` before writing code.
- Add every meaningful completed action here.
- Use the Windows-visible repo at `C:\WINDOWS\system32\health-quiz-funnel` for VS Code work.

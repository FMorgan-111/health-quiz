import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("Prisma schema handoff contract", () => {
  it("defines the seven questionnaire-engine tables from CLAUDE_LIST", () => {
    for (const modelName of [
      "User",
      "Questionnaire",
      "Question",
      "Option",
      "Assessment",
      "AssessmentAnswer",
      "Subscription",
    ]) {
      expect(schema).toContain(`model ${modelName} `);
    }
  });

  it("keeps assessment_answers idempotent by assessment/question", () => {
    expect(schema).toContain("@@unique([assessmentId, questionId])");
    expect(schema).toContain("@@index([assessmentId, step])");
  });

  it("keeps the subscription one-to-one with user", () => {
    expect(schema).toMatch(/userId\s+String\s+@unique/);
  });

  it("uses directUrl for Supabase migrations", () => {
    expect(schema).toContain('directUrl = env("DIRECT_URL")');
  });
});

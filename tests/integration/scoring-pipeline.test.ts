import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "./db";
import { createUser, createQuestionnaire, cleanup } from "./helpers";
import {
  toScoringQuestions,
  toScoringAnswers,
  type QuestionRow,
  type AssessmentAnswerRow,
} from "../../lib/contracts/scoring-adapter";
import { scoreAssessment } from "../../lib/scoring";
import { buildReport, type Tier } from "../../lib/report";

const users: string[] = [];
const questionnaires: string[] = [];

afterEach(async () => {
  await cleanup(users.splice(0), questionnaires.splice(0));
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** 全链路：DB 行 → codex adapter → scoring → report */
async function runPipeline(tier: Tier, answerValues: Record<string, number>) {
  const user = await createUser(tier);
  users.push(user.id);
  const q = await createQuestionnaire();
  questionnaires.push(q.id);
  const assessment = await prisma.assessment.create({
    data: { userId: user.id, questionnaireId: q.id, status: "completed" },
  });

  // 按 answerValues 写答案（按 question.order 索引）
  for (const question of q.questions) {
    const v = answerValues[`q${question.order}`];
    if (v === undefined) continue;
    await prisma.assessmentAnswer.create({
      data: { assessmentId: assessment.id, questionId: question.id, step: question.step, value: v },
    });
  }

  // —— 从 DB 读真实行 ——
  const questionRows = await prisma.question.findMany({
    where: { questionnaireId: q.id },
    orderBy: { order: "asc" },
  });
  const answerRows = await prisma.assessmentAnswer.findMany({
    where: { assessmentId: assessment.id },
  });

  // 适配成 snake_case 行（模拟 codex adapter 的输入形状）
  const qRows: QuestionRow[] = questionRows.map((r) => ({
    id: r.id,
    dimension: r.dimension,
    type: r.type,
    required: r.required,
    max_value: r.maxValue,
    step: r.step,
    order: r.order,
  }));
  const aRows: AssessmentAnswerRow[] = answerRows.map((r) => ({
    assessment_id: r.assessmentId,
    question_id: r.questionId,
    step: r.step,
    value: r.value,
  }));

  const scored = scoreAssessment(toScoringQuestions(qRows), toScoringAnswers(aRows));
  return buildReport(scored, tier);
}

describe("DB → adapter → scoring → report 全链路", () => {
  it("满分作答 → 维度 100，premium 报告含趋势", async () => {
    const report = await runPipeline("premium", { q1: 5, q2: 5, q3: 4 });
    const phys = report.dimensions.find((d) => d.name === "身体活动")!;
    expect(phys.score).toBe(100);
    expect(report.premium_extra?.trend_analysis).toBeTruthy();
  });

  it("free tier 全链路 → premium_extra 为 null，受保护字段不出现", async () => {
    const report = await runPipeline("free", { q1: 2, q2: 2, q3: 1 });
    expect(report.premium_extra).toBeNull();
    expect(JSON.stringify(report)).not.toContain("trend_analysis");
  });

  it("缺答（只答部分题）→ 链路不报错，缺题按 0 计", async () => {
    // 身体活动只答 q1=5，q2 缺 → (1+0)/2 → 50
    const report = await runPipeline("premium", { q1: 5 });
    const phys = report.dimensions.find((d) => d.name === "身体活动")!;
    expect(phys.score).toBe(50);
  });

  it("pro tier → 解锁 peer_comparison + pdf_url", async () => {
    const report = await runPipeline("pro", { q1: 5, q2: 5, q3: 4 });
    expect(report.premium_extra?.peer_comparison).toBeTruthy();
    expect(report.premium_extra?.pdf_url).toBeTruthy();
  });
});

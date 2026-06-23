import { describe, expect, it } from "vitest";
import { buildReport } from "../../lib/report";
import { scoreAssessment } from "../../lib/scoring";
import {
  toScoringAnswers,
  toScoringQuestions,
  type AssessmentAnswerRow,
  type QuestionRow,
} from "../../lib/contracts/scoring-adapter";

const mockQuestionRows: QuestionRow[] = [
  {
    id: "q-physical-1",
    dimension: "身体活动",
    type: "likert_5",
    required: true,
    max_value: 5,
    step: 1,
    order: 1,
  },
  {
    id: "q-physical-2",
    dimension: "身体活动",
    type: "likert_5",
    required: true,
    max_value: 5,
    step: 2,
    order: 2,
  },
  {
    id: "q-mental-1",
    dimension: "心理健康",
    type: "single_choice",
    required: true,
    max_value: 4,
    step: 3,
    order: 3,
  },
  {
    id: "q-stress-1",
    dimension: "压力",
    type: "likert_5",
    required: true,
    max_value: 5,
    step: 4,
    order: 4,
  },
  {
    id: "q-sleep-1",
    dimension: "睡眠",
    type: "multi_choice",
    required: true,
    max_value: 6,
    step: 5,
    order: 5,
  },
  {
    id: "q-note-1",
    dimension: "备注",
    type: "text",
    required: false,
    max_value: null,
    step: 6,
    order: 6,
  },
];

const mockAnswerRows: AssessmentAnswerRow[] = [
  {
    assessment_id: "assessment-cross-check",
    question_id: "q-physical-1",
    step: 1,
    value: 5,
  },
  {
    assessment_id: "assessment-cross-check",
    question_id: "q-physical-2",
    step: 2,
    value: 3,
  },
  {
    assessment_id: "assessment-cross-check",
    question_id: "q-mental-1",
    step: 3,
    value: 1,
  },
  {
    assessment_id: "assessment-cross-check",
    question_id: "q-stress-1",
    step: 4,
    value: 2,
  },
  {
    assessment_id: "assessment-cross-check",
    question_id: "q-sleep-1",
    step: 5,
    value: 3,
  },
  {
    assessment_id: "assessment-cross-check",
    question_id: "q-note-1",
    step: 6,
    value: "mock free-text note",
  },
  {
    assessment_id: "assessment-cross-check",
    question_id: "q-ghost",
    step: 99,
    value: 5,
  },
];

describe("Claude scoring/report cross-check with mock DB rows", () => {
  const scored = scoreAssessment(
    toScoringQuestions(mockQuestionRows),
    toScoringAnswers(mockAnswerRows),
  );

  it("scores dimensions from adapted rows with expected normalization", () => {
    expect(scored.dimensions).toHaveLength(4);
    expect(scored.dimensions.find((d) => d.name === "身体活动")).toEqual({
      name: "身体活动",
      score: 80,
      level: "良好",
    });
    expect(scored.dimensions.find((d) => d.name === "心理健康")).toEqual({
      name: "心理健康",
      score: 25,
      level: "需改善",
    });
    expect(scored.dimensions.find((d) => d.name === "压力")).toEqual({
      name: "压力",
      score: 40,
      level: "需改善",
    });
    expect(scored.dimensions.find((d) => d.name === "睡眠")).toEqual({
      name: "睡眠",
      score: 50,
      level: "一般",
    });
    expect(scored.dimensions.find((d) => d.name === "备注")).toBeUndefined();
    expect(scored.overall).toBe(48.8);
    expect(scored.overallLevel).toBe("需改善");
  });

  it("builds tiered reports from the same scored result without leaking protected fields", () => {
    const free = buildReport(scored, "free");
    const premium = buildReport(scored, "premium");
    const pro = buildReport(scored, "pro");

    expect(free.summary).toBe(
      "您的综合健康评分为 48.8（需改善）。共评估 4 个维度。",
    );
    expect(free.recommendations).toEqual([
      "每天安排 10 分钟正念或放松练习",
      "识别压力源并建立规律的减压习惯",
    ]);
    expect(free.premium_extra).toBeNull();
    expect(JSON.stringify(free)).not.toContain("trend_analysis");
    expect(JSON.stringify(free)).not.toContain("peer_comparison");
    expect(JSON.stringify(free)).not.toContain("pdf_url");

    expect(premium.recommendations).toHaveLength(3);
    expect(premium.premium_extra).toEqual({
      trend_analysis:
        "近期「身体活动」表现最佳（80）。建议保持并迁移该习惯到弱项维度。",
    });

    expect(pro.premium_extra).toEqual({
      trend_analysis:
        "近期「身体活动」表现最佳（80）。建议保持并迁移该习惯到弱项维度。",
      peer_comparison: "您的综合评分 48.8 高于同龄人群平均水平（参考基线 60）。",
      pdf_url: "/api/v1/reports/export?ts=placeholder",
    });
  });
});

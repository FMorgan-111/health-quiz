import { describe, expect, it } from "vitest";
import {
  toScoringAnswers,
  toScoringQuestions,
  type AssessmentAnswerRow,
  type QuestionRow,
} from "../../lib/contracts/scoring-adapter";
import { scoreAssessment } from "../../lib/scoring";

describe("DB row to scoring contract adapter", () => {
  const questionRows: QuestionRow[] = [
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
      id: "q-sleep-1",
      dimension: "睡眠",
      type: "single_choice",
      required: true,
      max_value: 4,
      step: 2,
      order: 2,
    },
    {
      id: "q-note",
      dimension: "备注",
      type: "text",
      required: false,
      max_value: null,
      step: 3,
      order: 3,
    },
  ];

  const answerRows: AssessmentAnswerRow[] = [
    {
      assessment_id: "assessment-1",
      question_id: "q-physical-1",
      step: 1,
      value: 5,
    },
    {
      assessment_id: "assessment-1",
      question_id: "q-sleep-1",
      step: 2,
      value: 2,
    },
    {
      assessment_id: "assessment-1",
      question_id: "q-note",
      step: 3,
      value: "feeling better",
    },
  ];

  it("maps snake_case DB rows to Claude scoring question shapes", () => {
    expect(toScoringQuestions(questionRows)).toEqual([
      {
        id: "q-physical-1",
        dimension: "身体活动",
        type: "likert_5",
        required: true,
        maxValue: 5,
      },
      {
        id: "q-sleep-1",
        dimension: "睡眠",
        type: "single_choice",
        required: true,
        maxValue: 4,
      },
      {
        id: "q-note",
        dimension: "备注",
        type: "text",
        required: false,
        maxValue: 0,
      },
    ]);
  });

  it("maps persisted answers to questionId/value without exposing Prisma types", () => {
    expect(toScoringAnswers(answerRows)).toEqual([
      { questionId: "q-physical-1", value: 5 },
      { questionId: "q-sleep-1", value: 2 },
      { questionId: "q-note", value: null },
    ]);
  });

  it("feeds scoreAssessment through the adapter without id/questionId drift", () => {
    const result = scoreAssessment(
      toScoringQuestions(questionRows),
      toScoringAnswers(answerRows),
    );

    expect(result.dimensions).toEqual([
      { name: "睡眠", score: 50, level: "一般" },
      { name: "身体活动", score: 100, level: "良好" },
    ]);
    expect(result.overall).toBe(75);
    expect(result.overallLevel).toBe("良好");
  });
});

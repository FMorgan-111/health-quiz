import { describe, expect, it } from "vitest";
import { QUESTIONNAIRE_SEED } from "../../lib/seed/questionnaire";

describe("published questionnaire seed", () => {
  it("defines one published 8-step questionnaire across physical, mental, and sleep dimensions", () => {
    expect(QUESTIONNAIRE_SEED.status).toBe("published");
    expect(QUESTIONNAIRE_SEED.questions).toHaveLength(8);
    expect(QUESTIONNAIRE_SEED.questions.map((question) => question.step)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(new Set(QUESTIONNAIRE_SEED.questions.map((question) => question.dimension))).toEqual(
      new Set(["physical", "mental", "sleep"]),
    );
  });

  it("uses likert_5 scoring with five ordered options on every question", () => {
    for (const question of QUESTIONNAIRE_SEED.questions) {
      expect(question.type).toBe("likert_5");
      expect(question.maxValue).toBe(5);
      expect(question.options).toEqual([
        { order: 1, label: "Strongly disagree", value: 1 },
        { order: 2, label: "Disagree", value: 2 },
        { order: 3, label: "Neutral", value: 3 },
        { order: 4, label: "Agree", value: 4 },
        { order: 5, label: "Strongly agree", value: 5 },
      ]);
    }
  });
});

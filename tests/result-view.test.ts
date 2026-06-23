import { describe, it, expect } from "vitest";
import { toPublicResult, toFullResult, viewResult, type ResultRow } from "../lib/health/result-view";

const row: ResultRow = {
  bmi: 27.8,
  bmiCategory: "超重",
  dailyCalories: 2414,
  targetDate: new Date("2026-05-21T00:00:00.000Z"),
  projectionCurve: [{ week: 0, weightKg: 90 }],
  computedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("结果差异化脱敏（受保护字段必须【不存在】）", () => {
  it("非会员：无 target_date / projection_curve", () => {
    const pub = toPublicResult(row);
    expect(pub).not.toHaveProperty("target_date");
    expect(pub).not.toHaveProperty("projection_curve");
    expect(pub.locked).toBe(true);
    // 非受保护字段正常返回
    expect(pub.bmi).toBe(27.8);
    expect(pub.daily_calories).toBe(2414);
  });

  it("会员：含完整字段", () => {
    const full = toFullResult(row);
    expect(full.locked).toBe(false);
    expect(full.target_date).toBe("2026-05-21T00:00:00.000Z");
    expect(full.projection_curve).toEqual([{ week: 0, weightKg: 90 }]);
  });

  it("viewResult 按 isMember 切换", () => {
    expect(viewResult(row, false)).not.toHaveProperty("target_date");
    expect(viewResult(row, true)).toHaveProperty("target_date");
  });
});

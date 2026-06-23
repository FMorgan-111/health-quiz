import { describe, it, expect } from "vitest";
import { compute, bmiCategory, type ComputeInput } from "../lib/health/compute";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function input(overrides: Partial<ComputeInput> = {}): ComputeInput {
  return {
    gender: "male",
    goal: "lose_weight",
    age: 30,
    heightCm: 180,
    weightKg: 90,
    targetWeightKg: 80,
    activityLevel: "moderate",
    ...overrides,
  };
}

describe("bmiCategory WHO 阈值", () => {
  it("边界映射正确", () => {
    expect(bmiCategory(17)).toBe("偏瘦");
    expect(bmiCategory(18.5)).toBe("正常");
    expect(bmiCategory(24.9)).toBe("正常");
    expect(bmiCategory(25)).toBe("超重");
    expect(bmiCategory(29.9)).toBe("超重");
    expect(bmiCategory(30)).toBe("肥胖");
  });
});

describe("compute · BMI", () => {
  it("180cm / 90kg → 27.8 超重", () => {
    const r = compute(input(), NOW);
    expect(r.bmi).toBe(27.8);
    expect(r.bmiCategory).toBe("超重");
  });

  it("180cm / 65kg → 20.1 正常", () => {
    const r = compute(input({ weightKg: 65, targetWeightKg: 65 }), NOW);
    expect(r.bmi).toBe(20.1);
    expect(r.bmiCategory).toBe("正常");
  });
});

describe("compute · 建议摄入热量（Mifflin-St Jeor）", () => {
  it("男 90kg/180cm/30 moderate 减重 → BMR*1.55 - 500", () => {
    // BMR = 10*90 + 6.25*180 - 5*30 + 5 = 1880；*1.55 = 2914；-500 = 2414
    const r = compute(input(), NOW);
    expect(r.dailyCalories).toBe(2414);
  });

  it("性别 other 取男女中间值", () => {
    const male = compute(input({ gender: "male", goal: "stay_fit" }), NOW).dailyCalories;
    const female = compute(input({ gender: "female", goal: "stay_fit" }), NOW).dailyCalories;
    const other = compute(input({ gender: "other", goal: "stay_fit" }), NOW).dailyCalories;
    expect(other).toBeLessThan(male);
    expect(other).toBeGreaterThan(female);
  });

  it("增肌 +300，保持 +0", () => {
    const fit = compute(input({ goal: "stay_fit" }), NOW).dailyCalories;
    const gain = compute(input({ goal: "gain_muscle" }), NOW).dailyCalories;
    expect(gain - fit).toBe(300);
  });
});

describe("compute · 目标日期与曲线", () => {
  it("90→80kg，0.5kg/周 → 20 周后", () => {
    const r = compute(input({ weightKg: 90, targetWeightKg: 80 }), NOW);
    const weeks = (r.targetDate.getTime() - NOW.getTime()) / (7 * 24 * 3600 * 1000);
    expect(weeks).toBe(20);
    expect(r.projectionCurve[0]).toEqual({ week: 0, weightKg: 90 });
    expect(r.projectionCurve[r.projectionCurve.length - 1].weightKg).toBe(80);
  });

  it("目标=当前体重 → 0 周，曲线单点", () => {
    const r = compute(input({ weightKg: 70, targetWeightKg: 70 }), NOW);
    expect(r.targetDate.getTime()).toBe(NOW.getTime());
    expect(r.projectionCurve).toHaveLength(1);
  });

  it("增重方向（70→75）曲线递增且不超目标", () => {
    const r = compute(input({ weightKg: 70, targetWeightKg: 75, goal: "gain_muscle" }), NOW);
    expect(r.projectionCurve[0].weightKg).toBe(70);
    expect(r.projectionCurve[r.projectionCurve.length - 1].weightKg).toBe(75);
    expect(Math.max(...r.projectionCurve.map((p) => p.weightKg))).toBeLessThanOrEqual(75);
  });
});

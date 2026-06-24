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

// TASK.md line 62：算法单元测试需含边界（极端的身高/体重/年龄、目标体重不合理等）。
// 注：compute 假设字段已过 Zod（见 tests/validation.test.ts）；这里验的是"合法但极端"
// 输入下计算仍稳健（不 NaN / 不 Infinity / 方向正确 / 曲线收敛到目标）。
describe("compute · 极端但合法的边界输入", () => {
  it("极端身材（250cm 上限 / 25kg 下限）BMI 有限且分类正确", () => {
    const r = compute(input({ heightCm: 250, weightKg: 25, targetWeightKg: 25 }), NOW);
    expect(Number.isFinite(r.bmi)).toBe(true);
    expect(r.bmi).toBe(4); // 25 / 2.5^2 = 4
    expect(r.bmiCategory).toBe("偏瘦");
  });

  it("极端肥胖（150cm / 400kg）→ 肥胖，热量仍有限", () => {
    const r = compute(input({ heightCm: 150, weightKg: 400, targetWeightKg: 80 }), NOW);
    expect(r.bmiCategory).toBe("肥胖");
    expect(Number.isFinite(r.dailyCalories)).toBe(true);
    expect(r.dailyCalories).toBeGreaterThan(0);
  });

  it("年龄边界 13 与 120 都产出有限热量", () => {
    expect(Number.isFinite(compute(input({ age: 13 }), NOW).dailyCalories)).toBe(true);
    expect(Number.isFinite(compute(input({ age: 120 }), NOW).dailyCalories)).toBe(true);
  });

  it("目标体重远大于当前（25→400，跨度极大）曲线收敛到目标且单调不越界", () => {
    const r = compute(input({ weightKg: 25, targetWeightKg: 400, goal: "gain_muscle" }), NOW);
    expect(r.projectionCurve[0].weightKg).toBe(25);
    expect(r.projectionCurve[r.projectionCurve.length - 1].weightKg).toBe(400);
    expect(Math.max(...r.projectionCurve.map((p) => p.weightKg))).toBeLessThanOrEqual(400);
    expect(r.targetDate.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("目标体重远小于当前（400→25）曲线递减到目标，不低于目标", () => {
    const r = compute(input({ weightKg: 400, targetWeightKg: 25 }), NOW);
    expect(r.projectionCurve[r.projectionCurve.length - 1].weightKg).toBe(25);
    expect(Math.min(...r.projectionCurve.map((p) => p.weightKg))).toBeGreaterThanOrEqual(25);
  });
});

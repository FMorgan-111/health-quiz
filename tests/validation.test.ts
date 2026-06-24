import { describe, it, expect } from "vitest";
import { stepSchemas, stepBodySchema, checkGoalWeightConsistency } from "../lib/sessions/validation";

// TASK.md §5.2：接口要挡住非法数值注入与越界输入（越界/非法 → 40001），并有测试覆盖。
// 这里直接断言分步 Zod schema 的边界：合法边界放行、越界/非法/缺失/类型错误拦截。
// （路由层把 safeParse 失败统一映射成 VALIDATION_FAILED=40001，见 lib/sessions/routes.ts。）

const ok = (step: number, data: unknown) => stepSchemas[step].safeParse(data).success;

describe("step 3 · age 13–120（整数）", () => {
  it("边界内合法：13 / 120 / 中间值", () => {
    expect(ok(3, { age: 13 })).toBe(true);
    expect(ok(3, { age: 120 })).toBe(true);
    expect(ok(3, { age: 30 })).toBe(true);
  });
  it("越界拦截：12 / 121 / 0 / 负数", () => {
    expect(ok(3, { age: 12 })).toBe(false);
    expect(ok(3, { age: 121 })).toBe(false);
    expect(ok(3, { age: 0 })).toBe(false);
    expect(ok(3, { age: -5 })).toBe(false);
  });
  it("非整数 / 非法类型拦截：小数 / NaN / Infinity / 字符串 / null", () => {
    expect(ok(3, { age: 30.5 })).toBe(false);
    expect(ok(3, { age: NaN })).toBe(false);
    expect(ok(3, { age: Infinity })).toBe(false);
    expect(ok(3, { age: "30" })).toBe(false);
    expect(ok(3, { age: null })).toBe(false);
  });
  it("缺失字段拦截", () => {
    expect(ok(3, {})).toBe(false);
  });
});

describe("step 4 · heightCm 80–250", () => {
  it("边界内合法：80 / 250 / 175.5（允许小数）", () => {
    expect(ok(4, { heightCm: 80 })).toBe(true);
    expect(ok(4, { heightCm: 250 })).toBe(true);
    expect(ok(4, { heightCm: 175.5 })).toBe(true);
  });
  it("越界拦截：79.9 / 250.1 / 0 / 负数", () => {
    expect(ok(4, { heightCm: 79.9 })).toBe(false);
    expect(ok(4, { heightCm: 250.1 })).toBe(false);
    expect(ok(4, { heightCm: 0 })).toBe(false);
    expect(ok(4, { heightCm: -170 })).toBe(false);
  });
  it("非法类型拦截：NaN / Infinity / 字符串", () => {
    expect(ok(4, { heightCm: NaN })).toBe(false);
    expect(ok(4, { heightCm: Infinity })).toBe(false);
    expect(ok(4, { heightCm: "170" })).toBe(false);
  });
});

describe("step 5 · weightKg 25–400", () => {
  it("边界内合法：25 / 400 / 70.2", () => {
    expect(ok(5, { weightKg: 25 })).toBe(true);
    expect(ok(5, { weightKg: 400 })).toBe(true);
    expect(ok(5, { weightKg: 70.2 })).toBe(true);
  });
  it("越界拦截：24.9 / 400.1 / 0 / 负数", () => {
    expect(ok(5, { weightKg: 24.9 })).toBe(false);
    expect(ok(5, { weightKg: 400.1 })).toBe(false);
    expect(ok(5, { weightKg: 0 })).toBe(false);
    expect(ok(5, { weightKg: -70 })).toBe(false);
  });
});

describe("step 6 · targetWeightKg 25–400", () => {
  it("边界内合法：25 / 400", () => {
    expect(ok(6, { targetWeightKg: 25 })).toBe(true);
    expect(ok(6, { targetWeightKg: 400 })).toBe(true);
  });
  it("越界拦截：24.9 / 400.1", () => {
    expect(ok(6, { targetWeightKg: 24.9 })).toBe(false);
    expect(ok(6, { targetWeightKg: 400.1 })).toBe(false);
  });
});

describe("枚举步骤 · 白名单", () => {
  it("step 1 gender：合法值放行，非法/缺失拦截", () => {
    for (const g of ["male", "female", "other"]) expect(ok(1, { gender: g })).toBe(true);
    expect(ok(1, { gender: "unknown" })).toBe(false);
    expect(ok(1, { gender: "" })).toBe(false);
    expect(ok(1, {})).toBe(false);
  });
  it("step 2 goal：合法值放行，非法拦截", () => {
    for (const g of ["lose_weight", "gain_muscle", "stay_fit", "improve_health"])
      expect(ok(2, { goal: g })).toBe(true);
    expect(ok(2, { goal: "get_rich" })).toBe(false);
  });
  it("step 7 activityLevel：合法值放行，非法拦截", () => {
    for (const a of ["sedentary", "light", "moderate", "active", "very_active"])
      expect(ok(7, { activityLevel: a })).toBe(true);
    expect(ok(7, { activityLevel: "lazy" })).toBe(false);
  });
});

describe("请求体信封 stepBodySchema", () => {
  it("合法：version 非负整数 + data 对象", () => {
    expect(stepBodySchema.safeParse({ version: 0, data: { age: 30 } }).success).toBe(true);
  });
  it("拦截：负 version / 非整数 version / data 缺失", () => {
    expect(stepBodySchema.safeParse({ version: -1, data: {} }).success).toBe(false);
    expect(stepBodySchema.safeParse({ version: 1.5, data: {} }).success).toBe(false);
    expect(stepBodySchema.safeParse({ version: 0 }).success).toBe(false);
  });
});

describe("goal × 目标体重 跨字段一致性 checkGoalWeightConsistency", () => {
  it("减重：目标 ≥ 当前 → 矛盾（返回提示）", () => {
    expect(checkGoalWeightConsistency("lose_weight", 77, 80)).toMatch(/减重/);
    expect(checkGoalWeightConsistency("lose_weight", 77, 77)).toMatch(/减重/); // 相等也算不合理
  });
  it("减重：目标 < 当前 → 放行（null）", () => {
    expect(checkGoalWeightConsistency("lose_weight", 77, 70)).toBeNull();
  });
  it("增肌：目标 ≤ 当前 → 矛盾", () => {
    expect(checkGoalWeightConsistency("gain_muscle", 77, 70)).toMatch(/增肌/);
    expect(checkGoalWeightConsistency("gain_muscle", 77, 77)).toMatch(/增肌/);
  });
  it("增肌：目标 > 当前 → 放行", () => {
    expect(checkGoalWeightConsistency("gain_muscle", 77, 85)).toBeNull();
  });
  it("stay_fit / improve_health：任意方向都放行", () => {
    expect(checkGoalWeightConsistency("stay_fit", 77, 90)).toBeNull();
    expect(checkGoalWeightConsistency("stay_fit", 77, 60)).toBeNull();
    expect(checkGoalWeightConsistency("improve_health", 77, 90)).toBeNull();
  });
  it("缺 goal 或 当前体重 → 不拦（放行）", () => {
    expect(checkGoalWeightConsistency(null, 77, 80)).toBeNull();
    expect(checkGoalWeightConsistency("lose_weight", null, 80)).toBeNull();
  });
});

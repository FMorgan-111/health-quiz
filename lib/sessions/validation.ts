// 分步字段校验（TASK.md §5.2：挡住非法数值注入与越界输入 → 40001）。
// 单独成模块，便于路由与测试共用同一份 schema（测试直接断言边界）。

import { z } from "zod";

// 每步只校验本步字段：enum 走白名单，数值走整型/范围。
export const stepSchemas: Record<number, z.ZodTypeAny> = {
  1: z.object({ gender: z.enum(["male", "female", "other"]) }),
  2: z.object({ goal: z.enum(["lose_weight", "gain_muscle", "stay_fit", "improve_health"]) }),
  3: z.object({ age: z.number().int().min(13).max(120) }),
  4: z.object({ heightCm: z.number().min(80).max(250) }),
  5: z.object({ weightKg: z.number().min(25).max(400) }),
  6: z.object({ targetWeightKg: z.number().min(25).max(400) }),
  7: z.object({ activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]) }),
};

export const TOTAL_STEPS = 7;

export const stepBodySchema = z.object({
  version: z.number().int().min(0),
  data: z.record(z.string(), z.unknown()),
});

// 跨字段一致性：goal 与目标体重方向矛盾时拦截（单步 schema 看不到其他步，放这里）。
// 减重却目标≥当前、增肌却目标≤当前 → 矛盾；stay_fit/improve_health 不限方向。
// 缺 goal 或 weightKg（正常流程到第 6 步前两者已填）时不拦，交由其它校验/必填逻辑。
export function checkGoalWeightConsistency(
  goal: string | null | undefined,
  weightKg: number | null | undefined,
  targetWeightKg: number,
): string | null {
  if (goal == null || weightKg == null) return null;
  if (goal === "lose_weight" && targetWeightKg >= weightKg)
    return "目标是减重，目标体重应低于当前体重";
  if (goal === "gain_muscle" && targetWeightKg <= weightKg)
    return "目标是增肌，目标体重应高于当前体重";
  return null;
}

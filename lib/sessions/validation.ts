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

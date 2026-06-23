// 结果差异化返回（TASK.md §三）。脱敏在服务端完成：受保护字段【不进】返回对象，
// 而非置 null —— 非会员拿不到 target_date / projection_curve。

import type { ProjectionPoint } from "./compute";

/** results 表行（取需要的字段；解耦 Prisma 类型） */
export interface ResultRow {
  bmi: number;
  bmiCategory: string;
  dailyCalories: number;
  targetDate: Date;
  projectionCurve: unknown; // Json
  computedAt: Date;
}

export interface PublicResult {
  bmi: number;
  bmi_category: string;
  daily_calories: number;
  locked: true;
  upgrade_hint: string;
}

export interface FullResult {
  bmi: number;
  bmi_category: string;
  daily_calories: number;
  locked: false;
  target_date: string;
  projection_curve: ProjectionPoint[];
}

/** 非会员：省略 target_date 与 projection_curve */
export function toPublicResult(r: ResultRow): PublicResult {
  return {
    bmi: r.bmi,
    bmi_category: r.bmiCategory,
    daily_calories: r.dailyCalories,
    locked: true,
    upgrade_hint: "升级会员可解锁目标达成日期与逐周预测曲线",
  };
}

/** 会员：完整字段 */
export function toFullResult(r: ResultRow): FullResult {
  return {
    bmi: r.bmi,
    bmi_category: r.bmiCategory,
    daily_calories: r.dailyCalories,
    locked: false,
    target_date: r.targetDate.toISOString(),
    projection_curve: r.projectionCurve as ProjectionPoint[],
  };
}

export function viewResult(r: ResultRow, isMember: boolean): PublicResult | FullResult {
  return isMember ? toFullResult(r) : toPublicResult(r);
}

// 健康评估算法（TASK.md §二）。纯函数，注入 now 便于测试，不 import Prisma。
// BMI + Mifflin-St Jeor 建议摄入 + 目标达成日期 + 逐周预测曲线。

export type Gender = "male" | "female" | "other";
export type Goal = "lose_weight" | "gain_muscle" | "stay_fit" | "improve_health";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

/** 计算输入：submit 时所有必填字段都应齐全（由 Zod 在调用前保证） */
export interface ComputeInput {
  gender: Gender;
  goal: Goal;
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
}

export interface ProjectionPoint {
  week: number;
  weightKg: number;
}

export interface ComputedResult {
  bmi: number;
  bmiCategory: string;
  dailyCalories: number;
  targetDate: Date;
  projectionCurve: ProjectionPoint[];
}

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// 目标对每日摄入的调整（kcal）
const GOAL_CALORIE_DELTA: Record<Goal, number> = {
  lose_weight: -500,
  gain_muscle: 300,
  stay_fit: 0,
  improve_health: 0,
};

const SAFE_WEEKLY_CHANGE_KG = 0.5; // 合理周变化（减重/增重）
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "偏瘦";
  if (bmi < 25) return "正常";
  if (bmi < 30) return "超重";
  return "肥胖";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Mifflin-St Jeor BMR（other 取男女均值） */
function bmr(input: ComputeInput): number {
  const { weightKg, heightCm, age, gender } = input;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === "male") return base + 5;
  if (gender === "female") return base - 161;
  return base - 78; // other：(+5 与 -161) 的均值
}

export function compute(input: ComputeInput, now: Date): ComputedResult {
  const heightM = input.heightCm / 100;
  const bmi = round1(input.weightKg / (heightM * heightM));
  const category = bmiCategory(bmi);

  const maintenance = bmr(input) * ACTIVITY_FACTOR[input.activityLevel];
  const dailyCalories = Math.round(maintenance + GOAL_CALORIE_DELTA[input.goal]);

  // 目标达成：按当前与目标体重差，安全周变化推算周数
  const deltaKg = Math.abs(input.weightKg - input.targetWeightKg);
  const weeks = deltaKg === 0 ? 0 : Math.ceil(deltaKg / SAFE_WEEKLY_CHANGE_KG);
  const targetDate = new Date(now.getTime() + weeks * MS_PER_WEEK);

  // 逐周曲线：从当前体重线性逼近目标体重
  const direction = input.targetWeightKg >= input.weightKg ? 1 : -1;
  const projectionCurve: ProjectionPoint[] = [];
  for (let w = 0; w <= weeks; w++) {
    const raw = input.weightKg + direction * SAFE_WEEKLY_CHANGE_KG * w;
    const weightKg =
      direction === 1
        ? Math.min(raw, input.targetWeightKg)
        : Math.max(raw, input.targetWeightKg);
    projectionCurve.push({ week: w, weightKg: round1(weightKg) });
  }

  return { bmi, bmiCategory: category, dailyCalories, targetDate, projectionCurve };
}

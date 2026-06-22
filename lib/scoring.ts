// 评分算法 —— 纯函数，不依赖 DB / Prisma。
// 输入契约用本地 plain 类型定义：Codex 把 DB 行（questions/options/answers）
// 适配成这些形状即可，两边在此处对齐，互不 import。

export type QuestionType =
  | "likert_5"
  | "single_choice"
  | "multi_choice"
  | "text";

/** 一道题的元数据（来自 questionnaire 快照） */
export interface ScoringQuestion {
  id: string;
  dimension: string; // 所属健康维度（身体/心理/睡眠…）
  type: QuestionType;
  required: boolean;
  /** 该题满分（用于归一化）。likert_5 默认 5；选择题为最高选项分值之和。 */
  maxValue: number;
}

/** 用户对一道题的作答。value 语义随题型：
 *  - likert_5 / single_choice: 单个分值
 *  - multi_choice: 选中项分值之和
 *  - text: 不计分（value 可为 null）
 */
export interface ScoringAnswer {
  questionId: string;
  value: number | null;
}

export interface DimensionScore {
  name: string;
  score: number; // 0–100 归一化
  level: string; // 良好 / 一般 / 需改善
}

export interface ScoredResult {
  dimensions: DimensionScore[];
  overall: number; // 0–100，各维度均分
  overallLevel: string;
}

// —— 等级阈值（0–100）——
export function levelFor(score: number): string {
  if (score >= 75) return "良好";
  if (score >= 50) return "一般";
  return "需改善";
}

const clamp01to100 = (n: number) => Math.max(0, Math.min(100, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 计算各维度得分与总分。
 * 归一化：每题得分 / 该题满分，维度内对【计分题】求平均，再 ×100。
 * - text 题不计分（跳过）
 * - 缺答（answer 缺失或 value=null）按 0 分计入该题（保守：未答即低分）
 * - 非法 value（NaN/Infinity/负数/超过 maxValue）会被夹紧到 [0, maxValue]
 */
export function scoreAssessment(
  questions: ScoringQuestion[],
  answers: ScoringAnswer[],
): ScoredResult {
  const answerMap = new Map<string, number | null>();
  for (const a of answers) answerMap.set(a.questionId, a.value);

  // 按维度归集计分题
  const byDimension = new Map<string, number[]>(); // dimension -> 每题归一化比例(0-1)

  for (const q of questions) {
    if (q.type === "text") continue; // 文本题不计分
    if (q.maxValue <= 0 || !Number.isFinite(q.maxValue)) continue; // 防御：无效满分跳过

    const raw = answerMap.has(q.id) ? answerMap.get(q.id) : null;
    let v = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    v = Math.max(0, Math.min(q.maxValue, v)); // 夹紧非法/越界

    const ratio = v / q.maxValue;
    const list = byDimension.get(q.dimension) ?? [];
    list.push(ratio);
    byDimension.set(q.dimension, list);
  }

  const dimensions: DimensionScore[] = [];
  for (const [name, ratios] of byDimension) {
    const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    const score = round1(clamp01to100(avg * 100));
    dimensions.push({ name, score, level: levelFor(score) });
  }

  // 维度按名称稳定排序，保证输出确定性（便于测试）
  dimensions.sort((a, b) => a.name.localeCompare(b.name));

  const overall =
    dimensions.length === 0
      ? 0
      : round1(
          dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length,
        );

  return { dimensions, overall, overallLevel: levelFor(overall) };
}

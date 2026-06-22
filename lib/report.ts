// 分级报告构建 —— 纯函数。服务端按订阅 tier 裁剪：受保护字段【根本不进】返回对象。
// 报告形状对齐 TASK.md §1.2：{ summary, dimensions, recommendations, premium_extra }

import type { ScoredResult, DimensionScore } from "./scoring";

export type Tier = "free" | "premium" | "pro";

export interface PremiumExtra {
  trend_analysis: string;
  peer_comparison?: string;
  pdf_url?: string;
}

export interface Report {
  summary: string;
  dimensions: DimensionScore[];
  recommendations: string[];
  premium_extra: PremiumExtra | null;
}

const FREE_RECOMMENDATION_LIMIT = 2;

// 维度 → 改善建议（规则化，确定性，便于测试）
const DIMENSION_ADVICE: Record<string, string> = {
  身体活动: "每周至少 150 分钟中强度运动",
  心理健康: "每天安排 10 分钟正念或放松练习",
  睡眠: "固定作息，保证 7–8 小时睡眠",
  饮食: "增加蔬果摄入，减少精制糖",
  压力: "识别压力源并建立规律的减压习惯",
};

function buildSummary(scored: ScoredResult): string {
  return `您的综合健康评分为 ${scored.overall}（${scored.overallLevel}）。共评估 ${scored.dimensions.length} 个维度。`;
}

// 低分维度优先生成建议；不足时用通用建议兜底，保证非空。
function buildRecommendations(scored: ScoredResult): string[] {
  const sorted = [...scored.dimensions].sort((a, b) => a.score - b.score);
  const recs: string[] = [];
  for (const d of sorted) {
    if (d.score >= 75) continue; // 良好维度不强推建议
    recs.push(DIMENSION_ADVICE[d.name] ?? `关注「${d.name}」维度，制定改善计划`);
  }
  if (recs.length === 0) recs.push("继续保持当前良好的健康习惯");
  return recs;
}

function buildTrend(scored: ScoredResult): string {
  const best = scored.dimensions.reduce(
    (m, d) => (d.score > m.score ? d : m),
    scored.dimensions[0],
  );
  return best
    ? `近期「${best.name}」表现最佳（${best.score}）。建议保持并迁移该习惯到弱项维度。`
    : "数据不足，无法生成趋势分析。";
}

function buildPeerComparison(scored: ScoredResult): string {
  return `您的综合评分 ${scored.overall} 高于同龄人群平均水平（参考基线 60）。`;
}

/**
 * 按 tier 构建报告。关键：free 的返回对象里 premium_extra 显式为 null，
 * 且 recommendations 截断到 2 条 —— 受保护内容在服务端就不存在，而非靠前端隐藏。
 */
export function buildReport(scored: ScoredResult, tier: Tier): Report {
  const summary = buildSummary(scored);
  const dimensions = scored.dimensions;
  const allRecs = buildRecommendations(scored);

  if (tier === "free") {
    return {
      summary,
      dimensions,
      recommendations: allRecs.slice(0, FREE_RECOMMENDATION_LIMIT),
      premium_extra: null,
    };
  }

  if (tier === "premium") {
    return {
      summary,
      dimensions,
      recommendations: allRecs,
      premium_extra: { trend_analysis: buildTrend(scored) },
    };
  }

  // pro
  return {
    summary,
    dimensions,
    recommendations: allRecs,
    premium_extra: {
      trend_analysis: buildTrend(scored),
      peer_comparison: buildPeerComparison(scored),
      pdf_url: `/api/v1/reports/export?ts=placeholder`,
    },
  };
}

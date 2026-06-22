import { describe, it, expect } from "vitest";
import { buildReport, type Tier } from "../lib/report";
import type { ScoredResult } from "../lib/scoring";

// 固定 scored 结果，便于断言。含一个低分维度以保证生成多条建议。
const scored: ScoredResult = {
  dimensions: [
    { name: "身体活动", score: 40, level: "需改善" },
    { name: "心理健康", score: 55, level: "一般" },
    { name: "睡眠", score: 60, level: "一般" },
  ],
  overall: 51.7,
  overallLevel: "一般",
};

describe("buildReport 通用结构", () => {
  it("所有 tier 都含 summary / dimensions / recommendations", () => {
    for (const tier of ["free", "premium", "pro"] as Tier[]) {
      const r = buildReport(scored, tier);
      expect(typeof r.summary).toBe("string");
      expect(r.dimensions).toHaveLength(3);
      expect(r.recommendations.length).toBeGreaterThan(0);
    }
  });
});

describe("free 脱敏 —— 受保护字段拿不到", () => {
  const r = buildReport(scored, "free");

  it("premium_extra 显式为 null", () => {
    expect(r.premium_extra).toBeNull();
  });

  it("recommendations 截断为最多 2 条", () => {
    expect(r.recommendations.length).toBeLessThanOrEqual(2);
  });

  it("序列化后对象里没有 trend_analysis / peer_comparison / pdf_url 这些 key", () => {
    const json = JSON.stringify(r);
    expect(json).not.toContain("trend_analysis");
    expect(json).not.toContain("peer_comparison");
    expect(json).not.toContain("pdf_url");
  });
});

describe("premium —— 给趋势，不给 pro 专属", () => {
  const r = buildReport(scored, "premium");

  it("premium_extra 含 trend_analysis", () => {
    expect(r.premium_extra).not.toBeNull();
    expect(typeof r.premium_extra!.trend_analysis).toBe("string");
  });

  it("不含 peer_comparison / pdf_url", () => {
    expect(r.premium_extra!.peer_comparison).toBeUndefined();
    expect(r.premium_extra!.pdf_url).toBeUndefined();
    const json = JSON.stringify(r);
    expect(json).not.toContain("peer_comparison");
    expect(json).not.toContain("pdf_url");
  });

  it("recommendations 不被截断（多于 free）", () => {
    const free = buildReport(scored, "free");
    expect(r.recommendations.length).toBeGreaterThanOrEqual(free.recommendations.length);
  });
});

describe("pro —— 全部解锁", () => {
  const r = buildReport(scored, "pro");

  it("premium_extra 含 trend_analysis + peer_comparison + pdf_url", () => {
    expect(r.premium_extra).not.toBeNull();
    expect(typeof r.premium_extra!.trend_analysis).toBe("string");
    expect(typeof r.premium_extra!.peer_comparison).toBe("string");
    expect(typeof r.premium_extra!.pdf_url).toBe("string");
  });
});

describe("升级前后差异化（同一 scored，不同 tier）", () => {
  it("free → premium：premium_extra 从 null 变为有趋势", () => {
    const free = buildReport(scored, "free");
    const premium = buildReport(scored, "premium");
    expect(free.premium_extra).toBeNull();
    expect(premium.premium_extra?.trend_analysis).toBeTruthy();
  });

  it("全维度良好时 recommendations 仍非空（兜底）", () => {
    const allGood: ScoredResult = {
      dimensions: [
        { name: "身体活动", score: 90, level: "良好" },
        { name: "睡眠", score: 80, level: "良好" },
      ],
      overall: 85,
      overallLevel: "良好",
    };
    const r = buildReport(allGood, "premium");
    expect(r.recommendations.length).toBeGreaterThan(0);
  });
});

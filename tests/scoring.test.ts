import { describe, it, expect } from "vitest";
import {
  scoreAssessment,
  levelFor,
  type ScoringQuestion,
  type ScoringAnswer,
} from "../lib/scoring";

// 测试用问卷：身体活动(2题) + 心理健康(1题) + 文本题(不计分)
const questions: ScoringQuestion[] = [
  { id: "q1", dimension: "身体活动", type: "likert_5", required: true, maxValue: 5 },
  { id: "q2", dimension: "身体活动", type: "likert_5", required: true, maxValue: 5 },
  { id: "q3", dimension: "心理健康", type: "single_choice", required: true, maxValue: 4 },
  { id: "q4", dimension: "心理健康", type: "text", required: false, maxValue: 0 },
];

describe("levelFor 等级阈值", () => {
  it("边界值映射正确", () => {
    expect(levelFor(100)).toBe("良好");
    expect(levelFor(75)).toBe("良好"); // 下边界含
    expect(levelFor(74.9)).toBe("一般");
    expect(levelFor(50)).toBe("一般"); // 下边界含
    expect(levelFor(49.9)).toBe("需改善");
    expect(levelFor(0)).toBe("需改善");
  });
});

describe("scoreAssessment 正常路径", () => {
  it("满分作答 → 各维度 100", () => {
    const answers: ScoringAnswer[] = [
      { questionId: "q1", value: 5 },
      { questionId: "q2", value: 5 },
      { questionId: "q3", value: 4 },
    ];
    const r = scoreAssessment(questions, answers);
    const phys = r.dimensions.find((d) => d.name === "身体活动")!;
    const mind = r.dimensions.find((d) => d.name === "心理健康")!;
    expect(phys.score).toBe(100);
    expect(mind.score).toBe(100);
    expect(r.overall).toBe(100);
    expect(r.overallLevel).toBe("良好");
  });

  it("维度内多题求平均后归一化", () => {
    // 身体: (5/5 + 0/5)/2 = 0.5 → 50; 心理: 2/4 = 0.5 → 50
    const r = scoreAssessment(questions, [
      { questionId: "q1", value: 5 },
      { questionId: "q2", value: 0 },
      { questionId: "q3", value: 2 },
    ]);
    expect(r.dimensions.find((d) => d.name === "身体活动")!.score).toBe(50);
    expect(r.dimensions.find((d) => d.name === "心理健康")!.score).toBe(50);
    expect(r.overall).toBe(50);
  });

  it("文本题不计分（不影响维度均值）", () => {
    const r = scoreAssessment(questions, [
      { questionId: "q1", value: 5 },
      { questionId: "q2", value: 5 },
      { questionId: "q3", value: 4 },
      { questionId: "q4", value: 999 }, // 文本题，应被忽略
    ]);
    expect(r.dimensions.find((d) => d.name === "心理健康")!.score).toBe(100);
  });
});

describe("scoreAssessment 边界 / 缺失 / 非法", () => {
  it("空作答 → 全 0", () => {
    const r = scoreAssessment(questions, []);
    expect(r.overall).toBe(0);
    expect(r.dimensions.every((d) => d.score === 0)).toBe(true);
  });

  it("缺答的题按 0 计入（保守）", () => {
    // 只答 q1=5，q2 缺 → 身体 (1 + 0)/2 = 0.5 → 50
    const r = scoreAssessment(questions, [{ questionId: "q1", value: 5 }]);
    expect(r.dimensions.find((d) => d.name === "身体活动")!.score).toBe(50);
  });

  it("value=null 按 0 计", () => {
    const r = scoreAssessment(questions, [
      { questionId: "q1", value: null },
      { questionId: "q2", value: null },
    ]);
    expect(r.dimensions.find((d) => d.name === "身体活动")!.score).toBe(0);
  });

  it("超过 maxValue 的越界值被夹紧", () => {
    const r = scoreAssessment(questions, [
      { questionId: "q1", value: 999 },
      { questionId: "q2", value: 999 },
    ]);
    expect(r.dimensions.find((d) => d.name === "身体活动")!.score).toBe(100);
  });

  it("负数被夹紧到 0", () => {
    const r = scoreAssessment(questions, [
      { questionId: "q1", value: -50 },
      { questionId: "q2", value: -50 },
    ]);
    expect(r.dimensions.find((d) => d.name === "身体活动")!.score).toBe(0);
  });

  it("NaN / Infinity 按 0 计，不污染结果", () => {
    const r = scoreAssessment(questions, [
      { questionId: "q1", value: NaN },
      { questionId: "q2", value: Infinity },
    ]);
    const phys = r.dimensions.find((d) => d.name === "身体活动")!;
    expect(Number.isFinite(phys.score)).toBe(true);
    // NaN 与 Infinity 都属非法输入，finite 检查先于夹紧 → 均按 0 计 → 维度 0
    expect(phys.score).toBe(0);
  });

  it("maxValue<=0 的题被跳过，不抛错", () => {
    const bad: ScoringQuestion[] = [
      { id: "x", dimension: "异常", type: "likert_5", required: true, maxValue: 0 },
    ];
    const r = scoreAssessment(bad, [{ questionId: "x", value: 3 }]);
    expect(r.dimensions.find((d) => d.name === "异常")).toBeUndefined();
    expect(r.overall).toBe(0);
  });

  it("没有任何计分题 → overall 0，不除以零", () => {
    const textOnly: ScoringQuestion[] = [
      { id: "t", dimension: "备注", type: "text", required: false, maxValue: 0 },
    ];
    const r = scoreAssessment(textOnly, [{ questionId: "t", value: 1 }]);
    expect(r.overall).toBe(0);
    expect(r.dimensions).toHaveLength(0);
  });

  it("多余的未知 answer 不影响结果", () => {
    const r = scoreAssessment(questions, [
      { questionId: "q1", value: 5 },
      { questionId: "q2", value: 5 },
      { questionId: "q3", value: 4 },
      { questionId: "ghost", value: 3 }, // 不存在的题
    ]);
    expect(r.overall).toBe(100);
  });

  it("输出维度按名称稳定排序（确定性）", () => {
    const r = scoreAssessment(questions, [{ questionId: "q1", value: 5 }]);
    const names = r.dimensions.map((d) => d.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

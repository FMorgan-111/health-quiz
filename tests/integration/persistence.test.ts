import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "./db";
import { createUser, createQuestionnaire, cleanup } from "./helpers";

// 跟踪本文件创建的实体，afterEach 清理
const users: string[] = [];
const questionnaires: string[] = [];

afterEach(async () => {
  await cleanup(users.splice(0), questionnaires.splice(0));
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function freshAssessment() {
  const user = await createUser();
  users.push(user.id);
  const q = await createQuestionnaire();
  questionnaires.push(q.id);
  const assessment = await prisma.assessment.create({
    data: { userId: user.id, questionnaireId: q.id, status: "draft" },
  });
  return { user, questionnaire: q, assessment };
}

describe("分步保存 · 答案幂等 upsert（@@unique[assessmentId, questionId]）", () => {
  it("重复提交同一题 → 覆盖而非新增，且只有一行", async () => {
    const { questionnaire, assessment } = await freshAssessment();
    const q1 = questionnaire.questions[0];

    const upsertAnswer = (value: number) =>
      prisma.assessmentAnswer.upsert({
        where: { assessmentId_questionId: { assessmentId: assessment.id, questionId: q1.id } },
        create: { assessmentId: assessment.id, questionId: q1.id, step: q1.step, value },
        update: { value },
      });

    await upsertAnswer(3);
    await upsertAnswer(5); // 重复提交，新值

    const rows = await prisma.assessmentAnswer.findMany({
      where: { assessmentId: assessment.id, questionId: q1.id },
    });
    expect(rows).toHaveLength(1); // 没有重复行
    expect(rows[0].value).toBe(5); // 覆盖为最新值
  });

  it("并发 upsert 同一题 → 最终一致，仍只有一行", async () => {
    const { questionnaire, assessment } = await freshAssessment();
    const q1 = questionnaire.questions[0];

    const upsertAnswer = (value: number) =>
      prisma.assessmentAnswer.upsert({
        where: { assessmentId_questionId: { assessmentId: assessment.id, questionId: q1.id } },
        create: { assessmentId: assessment.id, questionId: q1.id, step: q1.step, value },
        update: { value },
      });

    // 并发 5 次写同一题
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map(upsertAnswer));
    // 唯一约束保证不会产生多行；个别并发可能因竞争失败，但绝不重复
    const rows = await prisma.assessmentAnswer.findMany({
      where: { assessmentId: assessment.id, questionId: q1.id },
    });
    expect(rows).toHaveLength(1);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  });
});

describe("乐观锁 · 并发推进 current_step（version 字段）", () => {
  it("两次基于同一 version 的更新，只有一个成功", async () => {
    const { assessment } = await freshAssessment();
    expect(assessment.version).toBe(0);

    const advance = (fromVersion: number, step: number) =>
      prisma.assessment.updateMany({
        where: { id: assessment.id, version: fromVersion },
        data: { currentStep: step, version: { increment: 1 }, status: "in_progress" },
      });

    // 两个并发请求都拿到 version=0
    const [a, b] = await Promise.all([advance(0, 1), advance(0, 2)]);

    // 只有一个 count=1 命中，另一个 count=0（版本已被抢走）
    expect(a.count + b.count).toBe(1);

    const after = await prisma.assessment.findUnique({ where: { id: assessment.id } });
    expect(after!.version).toBe(1); // 只 +1，没有双写
  });

  it("用过期 version 更新 → 命中 0 行（409 的 DB 依据）", async () => {
    const { assessment } = await freshAssessment();
    // 先正常推进一次
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { version: { increment: 1 }, currentStep: 1 },
    });
    // 再用旧 version=0 更新
    const stale = await prisma.assessment.updateMany({
      where: { id: assessment.id, version: 0 },
      data: { currentStep: 2, version: { increment: 1 } },
    });
    expect(stale.count).toBe(0);
  });
});

describe("级联删除 · 删 user 带走其测评与答案", () => {
  it("删除 user 后 assessment 与 answers 一并消失", async () => {
    const { user, questionnaire, assessment } = await freshAssessment();
    const q1 = questionnaire.questions[0];
    await prisma.assessmentAnswer.create({
      data: { assessmentId: assessment.id, questionId: q1.id, step: q1.step, value: 4 },
    });

    await prisma.user.delete({ where: { id: user.id } });
    // 从 users[] 移除，避免 afterEach 重复删
    users.splice(users.indexOf(user.id), 1);

    expect(await prisma.assessment.findUnique({ where: { id: assessment.id } })).toBeNull();
    expect(
      await prisma.assessmentAnswer.findMany({ where: { assessmentId: assessment.id } }),
    ).toHaveLength(0);
  });
});

describe("唯一约束 · 一人一订阅 / 邮箱唯一", () => {
  it("同一 user 建两条 subscription → 第二条违反 @unique(userId) 抛错", async () => {
    const user = await createUser();
    users.push(user.id);
    await prisma.subscription.create({ data: { userId: user.id, tier: "premium", status: "active" } });
    await expect(
      prisma.subscription.create({ data: { userId: user.id, tier: "pro", status: "active" } }),
    ).rejects.toThrow();
  });

  it("重复 email → 违反 @unique 抛错", async () => {
    const user = await createUser();
    users.push(user.id);
    await expect(
      prisma.user.create({ data: { email: user.email, passwordHash: "y".repeat(20) } }),
    ).rejects.toThrow();
  });
});

describe("进度恢复 · 读回已填进度", () => {
  it("中断后按 current_step + 已答数恢复", async () => {
    const { questionnaire, assessment } = await freshAssessment();
    const [q1, q2] = questionnaire.questions;
    await prisma.assessmentAnswer.createMany({
      data: [
        { assessmentId: assessment.id, questionId: q1.id, step: q1.step, value: 5 },
        { assessmentId: assessment.id, questionId: q2.id, step: q2.step, value: 3 },
      ],
    });
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { currentStep: 1, status: "in_progress" },
    });

    const recovered = await prisma.assessment.findUnique({
      where: { id: assessment.id },
      include: { answers: true },
    });
    expect(recovered!.status).toBe("in_progress");
    expect(recovered!.currentStep).toBe(1);
    expect(recovered!.answers).toHaveLength(2);
  });
});

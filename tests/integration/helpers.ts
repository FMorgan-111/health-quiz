import { prisma } from "./db";

// 集成测试夹具：创建/清理隔离的测试数据。
// 每个测试用独立 email/slug 前缀，互不干扰；afterEach 级联删除即可清干净。

let counter = 0;
export function uniqueSuffix(): string {
  // 不用 Date.now()/random（保持确定性也便于排错）；进程内自增 + pid 足够唯一
  counter += 1;
  return `${process.pid}_${counter}`;
}

export async function createUser(tier: "free" | "premium" | "pro" = "free") {
  const sfx = uniqueSuffix();
  return prisma.user.create({
    data: {
      email: `it_${sfx}@test.local`,
      passwordHash: "x".repeat(20),
      subscriptionTier: tier,
    },
  });
}

/** 建一份已发布问卷：2 题身体活动(likert_5) + 1 题心理(single_choice) */
export async function createQuestionnaire() {
  const sfx = uniqueSuffix();
  return prisma.questionnaire.create({
    data: {
      slug: `q_${sfx}`,
      title: "Test Questionnaire",
      status: "published",
      questions: {
        create: [
          { step: 1, order: 1, prompt: "Q1", dimension: "身体活动", type: "likert_5", maxValue: 5 },
          { step: 1, order: 2, prompt: "Q2", dimension: "身体活动", type: "likert_5", maxValue: 5 },
          { step: 2, order: 3, prompt: "Q3", dimension: "心理健康", type: "single_choice", maxValue: 4 },
        ],
      },
    },
    include: { questions: { orderBy: { order: "asc" } } },
  });
}

export async function cleanup(userIds: string[], questionnaireIds: string[]) {
  // 级联：删 user 带走 assessments/answers/subscription；删 questionnaire 带走 questions/options
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (questionnaireIds.length)
    await prisma.questionnaire.deleteMany({ where: { id: { in: questionnaireIds } } });
}

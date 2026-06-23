import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "./db";
import { compute } from "../../lib/health/compute";

// 直接对 DB 验证 TASK.md §一/§三：分步保存、进度恢复、乐观锁、脱敏依据、/pay 后状态。
// 不经 HTTP（cookie 层在 e2e 验），这里验持久化与计算落库的正确性。

const created: string[] = [];

afterEach(async () => {
  if (created.length) {
    await prisma.session.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
  }
});

async function newSession() {
  const s = await prisma.session.create({ data: {} });
  created.push(s.id);
  return s;
}

describe("分步增量保存 + 进度恢复", () => {
  it("逐步写入字段，currentStep 与 version 递进", async () => {
    const s = await newSession();
    expect(s.currentStep).toBe(0);
    expect(s.version).toBe(0);

    const r1 = await prisma.session.updateMany({
      where: { id: s.id, version: 0 },
      data: { gender: "male", currentStep: 1, version: { increment: 1 } },
    });
    expect(r1.count).toBe(1);

    const after = await prisma.session.findUnique({ where: { id: s.id } });
    expect(after?.gender).toBe("male");
    expect(after?.currentStep).toBe(1);
    expect(after?.version).toBe(1);
  });

  it("进度恢复：重新读回已填字段与步数", async () => {
    const s = await newSession();
    await prisma.session.update({
      where: { id: s.id },
      data: { gender: "female", goal: "lose_weight", age: 28, currentStep: 3, version: 3 },
    });
    const recovered = await prisma.session.findUnique({ where: { id: s.id } });
    expect(recovered?.currentStep).toBe(3);
    expect(recovered?.gender).toBe("female");
    expect(recovered?.age).toBe(28);
  });
});

describe("乐观锁并发提交", () => {
  it("同一 version 两次更新，只有一个成功", async () => {
    const s = await newSession();
    const [a, b] = await Promise.all([
      prisma.session.updateMany({
        where: { id: s.id, version: 0 },
        data: { currentStep: 1, version: { increment: 1 } },
      }),
      prisma.session.updateMany({
        where: { id: s.id, version: 0 },
        data: { currentStep: 1, version: { increment: 1 } },
      }),
    ]);
    expect(a.count + b.count).toBe(1); // 只有一个命中 version=0
  });

  it("过期 version 更新命中 0 行（409 的 DB 依据）", async () => {
    const s = await newSession();
    await prisma.session.update({ where: { id: s.id }, data: { version: 5 } });
    const stale = await prisma.session.updateMany({
      where: { id: s.id, version: 0 },
      data: { currentStep: 1 },
    });
    expect(stale.count).toBe(0);
  });
});

describe("计算落库 + 脱敏依据 + /pay", () => {
  it("submit 计算结果写入 results；订阅默认 none；pay 后 active", async () => {
    const s = await newSession();
    const input = {
      gender: "male" as const,
      goal: "lose_weight" as const,
      age: 30,
      heightCm: 180,
      weightKg: 90,
      targetWeightKg: 80,
      activityLevel: "moderate" as const,
    };
    const computed = compute(input, new Date("2026-01-01T00:00:00.000Z"));

    await prisma.$transaction(async (tx) => {
      await tx.result.create({
        data: {
          sessionId: s.id,
          bmi: computed.bmi,
          bmiCategory: computed.bmiCategory,
          dailyCalories: computed.dailyCalories,
          targetDate: computed.targetDate,
          projectionCurve: computed.projectionCurve as unknown as object,
        },
      });
      await tx.session.update({ where: { id: s.id }, data: { completed: true } });
      await tx.subscription.create({ data: { sessionId: s.id, status: "none" } });
    });

    const withRel = await prisma.session.findUnique({
      where: { id: s.id },
      include: { result: true, subscription: true },
    });
    expect(withRel?.result?.bmi).toBe(27.8);
    expect(withRel?.subscription?.status).toBe("none"); // 非会员依据

    // /pay → active
    await prisma.subscription.update({
      where: { sessionId: s.id },
      data: { status: "active", paidAt: new Date() },
    });
    const paid = await prisma.subscription.findUnique({ where: { sessionId: s.id } });
    expect(paid?.status).toBe("active"); // 会员依据 → result 解锁
  });

  it("级联删除：删 session 带走 result 与 subscription", async () => {
    const s = await prisma.session.create({ data: {} });
    await prisma.result.create({
      data: {
        sessionId: s.id,
        bmi: 22,
        bmiCategory: "正常",
        dailyCalories: 2000,
        targetDate: new Date(),
        projectionCurve: [] as unknown as object,
      },
    });
    await prisma.subscription.create({ data: { sessionId: s.id } });
    await prisma.session.delete({ where: { id: s.id } });
    expect(await prisma.result.findUnique({ where: { sessionId: s.id } })).toBeNull();
    expect(await prisma.subscription.findUnique({ where: { sessionId: s.id } })).toBeNull();
  });
});

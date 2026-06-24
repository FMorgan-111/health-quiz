import { describe, it, expect, afterEach, vi } from "vitest";

// /pay 端到端（TASK.md §5.2「支付回调端到端」）：
// 通过真实 route handler 跑 脱敏 result → POST /pay → 完整 result 的全链路。
// handler 经 next/headers 的 cookies() 取 session —— 这里把 cookies() mock 成指向
// 我们在真库里建好的 session，从而不开浏览器也能 e2e 验证「会员才解锁」的服务端逻辑。

// 当前指向的 session id（每个用例 setSid 后生效）
let currentSid: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "hq_sid" && currentSid ? { name, value: currentSid } : undefined,
    set: () => {},
  }),
}));

// mock 之后再 import：handler 与测试共用 lib/db 的 prisma 单例（默认 DATABASE_URL）。
const { prisma } = await import("../../lib/db");
const { getResult, pay, submitSession } = await import("../../lib/sessions/routes");

const created: string[] = [];
function setSid(id: string | null) {
  currentSid = id;
}

afterEach(async () => {
  setSid(null);
  if (created.length) {
    await prisma.session.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
  }
});

// 建一个「所有字段齐全」的 session，交给 submitSession 真正算分落库
async function newCompletedSession() {
  const s = await prisma.session.create({
    data: {
      gender: "male",
      goal: "lose_weight",
      age: 30,
      heightCm: 180,
      weightKg: 90,
      targetWeightKg: 80,
      activityLevel: "moderate",
      currentStep: 7,
    },
  });
  created.push(s.id);
  setSid(s.id);
  const res = await submitSession();
  expect(res.status).toBe(200);
  return s;
}

async function body(res: Response) {
  // 测试里直接索引 data 的字段，用 any 省去逐处断言
  return res.json() as Promise<{ code: number; message: string; data: any }>;
}

describe("/pay 端到端：脱敏 result → 支付 → 完整 result", () => {
  it("非会员 result 脱敏：无 target_date / projection_curve，locked=true", async () => {
    await newCompletedSession();

    const res = await getResult();
    expect(res.status).toBe(200);
    const env = await body(res);
    expect(env.code).toBe(0);
    const result = env.data!.result as Record<string, unknown>;

    expect(result).not.toHaveProperty("target_date");
    expect(result).not.toHaveProperty("projection_curve");
    expect(result.locked).toBe(true);
    expect(result.bmi).toBe(27.8); // 非受保护字段照常返回
    expect(result.daily_calories).toBe(2414);
  });

  it("POST /pay 后 result 解锁：含 target_date / projection_curve，locked=false", async () => {
    await newCompletedSession();

    // 先确认脱敏态
    const before = (await body(await getResult())).data!.result as Record<string, unknown>;
    expect(before.locked).toBe(true);

    // 支付
    const payRes = await pay();
    expect(payRes.status).toBe(200);
    const payEnv = await body(payRes);
    expect(payEnv.code).toBe(0);
    expect(payEnv.data!.status).toBe("active");

    // 解锁态
    const after = (await body(await getResult())).data!.result as Record<string, unknown>;
    expect(after.locked).toBe(false);
    expect(after).toHaveProperty("target_date");
    expect(after).toHaveProperty("projection_curve");
    expect(Array.isArray(after.projection_curve)).toBe(true);
    // 解锁后非受保护字段不变
    expect(after.bmi).toBe(before.bmi);
    expect(after.daily_calories).toBe(before.daily_calories);
  });

  it("subscription 真落库为 active + premium（支付回调幂等）", async () => {
    const s = await newCompletedSession();

    await pay();
    await pay(); // 再调一次，验幂等不报错、状态不变

    const sub = await prisma.subscription.findUnique({ where: { sessionId: s.id } });
    expect(sub?.status).toBe("active");
    expect(sub?.plan).toBe("premium");
    expect(sub?.paidAt).not.toBeNull();
  });

  it("解锁后的 target_date / projection_curve 与落库结果一致（非伪造）", async () => {
    const s = await newCompletedSession();
    await pay();

    const result = (await body(await getResult())).data!.result as Record<string, unknown>;

    // 解锁字段必须等于 submit 时算好落库的 results 行（而非客户端可伪造的值）
    const row = await prisma.result.findUnique({ where: { sessionId: s.id } });
    expect(result.target_date).toBe(row!.targetDate.toISOString());
    expect(result.projection_curve).toEqual(row!.projectionCurve);
  });

  it("无 cookie/会话 → result 401，pay 401", async () => {
    setSid(null);
    expect((await getResult()).status).toBe(401);
    expect((await pay()).status).toBe(401);
  });

  it("会话未完成 → result 409（无结果可看）", async () => {
    const s = await prisma.session.create({ data: { gender: "male", currentStep: 1 } });
    created.push(s.id);
    setSid(s.id);
    expect((await getResult()).status).toBe(409);
  });
});

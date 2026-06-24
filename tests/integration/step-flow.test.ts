import { describe, it, expect, afterEach, vi } from "vitest";

// 分步提交流程端到端（TASK.md §四「乱序/重复提交」）：经真实 submitStep handler
// 跑跳步拦截 / 顺序推进 / 回退重提 / 乐观锁版本冲突。与 pay-e2e 同手法：
// mock next/headers 的 cookies() 指向真库 session，不开浏览器即可验证 handler 分支。

let currentSid: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "hq_sid" && currentSid ? { name, value: currentSid } : undefined,
    set: () => {},
  }),
}));

const { prisma } = await import("../../lib/db");
const { submitStep } = await import("../../lib/sessions/routes");

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

async function newSession() {
  const s = await prisma.session.create({ data: {} });
  created.push(s.id);
  setSid(s.id);
  return s;
}

// 调 submitStep handler：构造 Request + params，返回 { status, env }
async function patchStep(
  step: number,
  version: number,
  data: Record<string, unknown>,
) {
  const req = new Request(`http://test/api/v1/sessions/current/step/${step}`, {
    method: "PATCH",
    body: JSON.stringify({ version, data }),
  });
  const res = await submitStep(req, { params: { step: String(step) } });
  const env = (await res.json()) as { code: number; message: string; data: any };
  return { status: res.status, env };
}

describe("跳步拦截", () => {
  it("新会话直接提交第 3 步（越过 1、2）→ 400 / 40001", async () => {
    await newSession();
    const { status, env } = await patchStep(3, 0, { age: 30 });
    expect(status).toBe(400);
    expect(env.code).toBe(40001);
  });

  it("提交越界 step（0 / 8）→ 400 / 40001", async () => {
    await newSession();
    expect((await patchStep(0, 0, {})).status).toBe(400);
    expect((await patchStep(8, 0, { activityLevel: "light" })).status).toBe(400);
  });

  it("提交合法 step 但字段越界（age 999）→ 400 / 40001", async () => {
    await newSession();
    const { status, env } = await patchStep(1, 0, { gender: "male" }); // 先答第 1 步推进
    expect(status).toBe(200);
    const bad = await patchStep(3, env.data.session.version, { age: 999 });
    expect(bad.status).toBe(400);
    expect(bad.env.code).toBe(40001);
  });
});

describe("顺序推进 + 重复/回退重提", () => {
  it("逐步提交 1→2→3，currentStep 与 version 递进", async () => {
    await newSession();
    const r1 = await patchStep(1, 0, { gender: "male" });
    expect(r1.status).toBe(200);
    expect(r1.env.data.session.currentStep).toBe(1);
    expect(r1.env.data.session.version).toBe(1);

    const r2 = await patchStep(2, 1, { goal: "lose_weight" });
    expect(r2.env.data.session.currentStep).toBe(2);
    expect(r2.env.data.session.version).toBe(2);

    const r3 = await patchStep(3, 2, { age: 30 });
    expect(r3.env.data.session.currentStep).toBe(3);
    expect(r3.env.data.session.version).toBe(3);
  });

  it("回退重提已答步骤（编辑第 1 步）成功，且 currentStep 不倒退", async () => {
    await newSession();
    await patchStep(1, 0, { gender: "male" });
    const r2 = await patchStep(2, 1, { goal: "lose_weight" }); // currentStep=2, version=2

    // 回到第 1 步改性别：step(1) <= currentStep(2)+1，允许；用当前 version 提交
    const edit = await patchStep(1, r2.env.data.session.version, { gender: "female" });
    expect(edit.status).toBe(200);
    expect(edit.env.data.session.gender).toBe("female");
    expect(edit.env.data.session.currentStep).toBe(2); // 不倒退
    expect(edit.env.data.session.version).toBe(3); // version 仍自增
  });

  it("重复提交同一步（用最新 version）成功，幂等推进", async () => {
    await newSession();
    const a = await patchStep(1, 0, { gender: "male" });
    const b = await patchStep(1, a.env.data.session.version, { gender: "other" });
    expect(b.status).toBe(200);
    expect(b.env.data.session.gender).toBe("other");
  });
});

describe("乐观锁版本冲突", () => {
  it("用过期 version 提交 → 409 / 40900", async () => {
    await newSession();
    await patchStep(1, 0, { gender: "male" }); // version 0→1

    // 再用 version=0（已过期）提交 → 冲突
    const stale = await patchStep(2, 0, { goal: "lose_weight" });
    expect(stale.status).toBe(409);
    expect(stale.env.code).toBe(40900);
  });

  it("并发同 version 提交，只有一个成功，另一个 409", async () => {
    const s = await newSession();
    const [a, b] = await Promise.all([
      patchStep(1, 0, { gender: "male" }),
      patchStep(1, 0, { gender: "female" }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    // 落库值是成功那次写的
    const fresh = await prisma.session.findUnique({ where: { id: s.id } });
    expect(["male", "female"]).toContain(fresh!.gender);
    expect(fresh!.version).toBe(1); // 只成功了一次
  });
});

describe("无会话", () => {
  it("无 cookie 提交 → 401 / 40100", async () => {
    setSid(null);
    const { status, env } = await patchStep(1, 0, { gender: "male" });
    expect(status).toBe(401);
    expect(env.code).toBe(40100);
  });
});

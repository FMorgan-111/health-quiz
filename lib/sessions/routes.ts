// Session 流程的 6 个 handler（TASK.md §3.1）。统一信封，复用 envelope。
// 分步增量保存 + 乐观锁 version + submit 触发计算 + result 差异化。

import { NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_CODES, err, ok } from "../api/envelope";
import { prisma } from "../db";
import { SESSION_COOKIE } from "../session/cookie";
import { getCurrentSession, isMember } from "../session/store";
import { compute, type ComputeInput } from "../health/compute";
import { viewResult } from "../health/result-view";

function json<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status });
}

// 写 httpOnly cookie 到响应（route handler 内 cookies().set 也可，但显式设更直观）
function withSessionCookie<T>(res: NextResponse<T>, sessionId: string): NextResponse<T> {
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}

// —— 分步字段校验（TASK.md §5.2：挡住非法数值/越界） ——
const stepSchemas: Record<number, z.ZodTypeAny> = {
  1: z.object({ gender: z.enum(["male", "female", "other"]) }),
  2: z.object({ goal: z.enum(["lose_weight", "gain_muscle", "stay_fit", "improve_health"]) }),
  3: z.object({ age: z.number().int().min(13).max(120) }),
  4: z.object({ heightCm: z.number().min(80).max(250) }),
  5: z.object({ weightKg: z.number().min(25).max(400) }),
  6: z.object({ targetWeightKg: z.number().min(25).max(400) }),
  7: z.object({ activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]) }),
};
const TOTAL_STEPS = 7;

const stepBodySchema = z.object({
  version: z.number().int().min(0),
  data: z.record(z.string(), z.unknown()),
});

// POST /sessions — 新建会话，种 cookie
export async function createSession(): Promise<Response> {
  const session = await prisma.session.create({ data: {} });
  return withSessionCookie(
    json(ok({ session: publicSession(session) }), 201),
    session.id,
  );
}

// POST /sessions/reset — 清除当前会话 cookie，让用户从头开始（不删库里的旧数据）
export async function resetSession(): Promise<Response> {
  const res = json(ok({ reset: true }));
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

// GET /sessions/current — 当前进度（进度恢复）
export async function getCurrent(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return json(err(ERROR_CODES.UNAUTHORIZED, "no active session"), 401);
  return json(ok({ session: publicSession(session) }));
}

// PATCH /sessions/current/step/{step} — 提交某步增量，乐观锁
export async function submitStep(
  request: Request,
  context: { params: { step: string } | Promise<{ step: string }> },
): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return json(err(ERROR_CODES.UNAUTHORIZED, "no active session"), 401);
  if (session.completed)
    return json(err(ERROR_CODES.CONFLICT, "session already completed"), 409);

  const { step: rawStep } = await Promise.resolve(context.params);
  const step = Number(rawStep);
  if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS)
    return json(err(ERROR_CODES.VALIDATION_FAILED, "invalid step"), 400);

  // 顺序提交：必须是 currentStep + 1
  if (step !== session.currentStep + 1)
    return json(err(ERROR_CODES.VALIDATION_FAILED, "steps must be submitted sequentially"), 400);

  let body: { version: number; data: Record<string, unknown> };
  try {
    body = stepBodySchema.parse(await request.json());
  } catch {
    return json(err(ERROR_CODES.VALIDATION_FAILED, "invalid payload"), 400);
  }

  // 字段值校验（越界/非法 → 40001）
  const parsed = stepSchemas[step].safeParse(body.data);
  if (!parsed.success)
    return json(err(ERROR_CODES.VALIDATION_FAILED, "invalid field value"), 400);
  const fieldData = parsed.data as Record<string, unknown>;

  // 乐观锁更新
  const updated = await prisma.session.updateMany({
    where: { id: session.id, version: body.version },
    data: { ...fieldData, currentStep: step, version: { increment: 1 } },
  });
  if (updated.count === 0)
    return json(err(ERROR_CODES.CONFLICT, "version conflict"), 409);

  const fresh = await prisma.session.findUnique({
    where: { id: session.id },
    include: { subscription: true, result: true },
  });
  return json(ok({ session: publicSession(fresh!) }));
}

// POST /sessions/current/submit — 字段齐全 → 计算 → 写 results → completed
export async function submitSession(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return json(err(ERROR_CODES.UNAUTHORIZED, "no active session"), 401);

  // 幂等：已完成直接返回
  if (session.completed && session.result)
    return json(ok({ completed: true }));

  const input = requireAllFields(session);
  if (!input)
    return json(err(ERROR_CODES.VALIDATION_FAILED, "missing required fields"), 400);

  const computed = compute(input, new Date());

  await prisma.$transaction(async (tx) => {
    await tx.result.upsert({
      where: { sessionId: session.id },
      create: {
        sessionId: session.id,
        bmi: computed.bmi,
        bmiCategory: computed.bmiCategory,
        dailyCalories: computed.dailyCalories,
        targetDate: computed.targetDate,
        projectionCurve: computed.projectionCurve as unknown as object,
      },
      update: {
        bmi: computed.bmi,
        bmiCategory: computed.bmiCategory,
        dailyCalories: computed.dailyCalories,
        targetDate: computed.targetDate,
        projectionCurve: computed.projectionCurve as unknown as object,
      },
    });
    await tx.session.update({
      where: { id: session.id },
      data: { completed: true },
    });
    await tx.subscription.upsert({
      where: { sessionId: session.id },
      create: { sessionId: session.id, status: "none" },
      update: {},
    });
  });

  return json(ok({ completed: true }));
}

// GET /sessions/current/result — 差异化返回
export async function getResult(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return json(err(ERROR_CODES.UNAUTHORIZED, "no active session"), 401);
  if (!session.completed || !session.result)
    return json(err(ERROR_CODES.CONFLICT, "session not completed"), 409);

  const view = viewResult(session.result, isMember(session));
  return json(ok({ result: view }));
}

// POST /pay — 模拟支付回调：subscription → active
export async function pay(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return json(err(ERROR_CODES.UNAUTHORIZED, "no active session"), 401);

  await prisma.subscription.upsert({
    where: { sessionId: session.id },
    create: { sessionId: session.id, status: "active", plan: "premium", paidAt: new Date() },
    update: { status: "active", plan: "premium", paidAt: new Date() },
  });
  return json(ok({ status: "active" }));
}

// —— helpers ——
type SessionRow = {
  id: string;
  gender: string | null;
  goal: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  activityLevel: string | null;
  currentStep: number;
  completed: boolean;
  version: number;
};

function publicSession(s: SessionRow) {
  return {
    id: s.id,
    gender: s.gender,
    goal: s.goal,
    age: s.age,
    heightCm: s.heightCm,
    weightKg: s.weightKg,
    targetWeightKg: s.targetWeightKg,
    activityLevel: s.activityLevel,
    currentStep: s.currentStep,
    completed: s.completed,
    version: s.version,
    totalSteps: TOTAL_STEPS,
  };
}

/** 所有计算必填字段齐全则返回 ComputeInput，否则 null */
function requireAllFields(s: SessionRow): ComputeInput | null {
  if (
    s.gender == null || s.goal == null || s.age == null ||
    s.heightCm == null || s.weightKg == null || s.targetWeightKg == null ||
    s.activityLevel == null
  ) {
    return null;
  }
  return {
    gender: s.gender as ComputeInput["gender"],
    goal: s.goal as ComputeInput["goal"],
    age: s.age,
    heightCm: s.heightCm,
    weightKg: s.weightKg,
    targetWeightKg: s.targetWeightKg,
    activityLevel: s.activityLevel as ComputeInput["activityLevel"],
  };
}

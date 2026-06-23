// DEV-ONLY 模拟支付激活。仅当 ENABLE_DEV_PAY=1 时启用，否则 404。
// 真实激活走 /subscriptions/callback（HMAC 签名 webhook），前端无密钥，
// 故演示用此接口直接把 tier 置为 premium/pro 并重签 token。
//
// 关键：report 按 JWT 里的 subscriptionTier 脱敏，改 tier 后必须重签 token，
// 否则前端旧 token 仍是 free，报告不会解锁。

import { NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_CODES, err, ok } from "../../../../../lib/api/envelope";
import { authenticateRequest, isAuthFailure } from "../../../../../lib/auth/request";
import {
  ACCESS_TOKEN_SECONDS,
  REFRESH_TOKEN_SECONDS,
  signAccessToken,
  signRefreshToken,
} from "../../../../../lib/auth/tokens";
import { prisma } from "../../../../../lib/db";

export const runtime = "nodejs";

const activateSchema = z.object({
  tier: z.enum(["premium", "pro"]),
});

function enabled(): boolean {
  return process.env.ENABLE_DEV_PAY === "1";
}

export async function POST(request: Request): Promise<Response> {
  if (!enabled()) {
    return NextResponse.json(
      err(ERROR_CODES.NOT_FOUND, "not found"),
      { status: 404 },
    );
  }

  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  let payload: { tier: "premium" | "pro" };
  try {
    payload = activateSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      err(ERROR_CODES.VALIDATION_FAILED, "invalid tier"),
      { status: 400 },
    );
  }

  const userId = auth.user.id;
  const tier = payload.tier;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { subscriptionTier: tier },
    });
    await tx.subscription.upsert({
      where: { userId },
      create: { userId, tier, status: "active", paidAt: new Date() },
      update: { tier, status: "active", paidAt: new Date() },
    });
  });

  const tokenUser = { id: userId, email: auth.user.email, subscriptionTier: tier };
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(tokenUser),
    signRefreshToken(tokenUser),
  ]);

  return NextResponse.json(
    ok({
      user: tokenUser,
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_SECONDS,
      refreshExpiresIn: REFRESH_TOKEN_SECONDS,
    }),
  );
}

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_CODES, err, ok } from "../api/envelope";
import {
  authenticateRequest,
  isAuthFailure,
} from "../auth/request";
import { prisma } from "../db";

const createSubscriptionSchema = z.object({
  tier: z.enum(["premium", "pro"]),
});

const paymentCallbackSchema = z.object({
  providerRef: z.string().min(1),
  status: z.literal("paid"),
});

function json<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status });
}

function publicSubscription(subscription: {
  id: string;
  userId: string;
  tier: string;
  status: string;
  providerRef: string | null;
  paidAt: Date | string | null;
}) {
  return {
    id: subscription.id,
    userId: subscription.userId,
    tier: subscription.tier,
    status: subscription.status,
    providerRef: subscription.providerRef,
    paidAt: subscription.paidAt,
  };
}

async function parseJson<T>(
  request: Request,
  schema: z.ZodSchema<T>,
): Promise<T | null> {
  try {
    const payload = await request.json();
    const parsed = schema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function webhookSecret(): string {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret || secret.length < 8) {
    throw new Error("PAYMENT_WEBHOOK_SECRET must be set");
  }
  return secret;
}

function signatureFor(rawBody: string): string {
  return createHmac("sha256", webhookSecret()).update(rawBody).digest("hex");
}

function verifySignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;

  const expected = Buffer.from(signatureFor(rawBody), "hex");
  const actual = Buffer.from(header.slice("sha256=".length), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createSubscription(request: Request): Promise<Response> {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return json(auth.body, auth.status);

  const payload = await parseJson(request, createSubscriptionSchema);
  if (!payload) {
    return json(err(ERROR_CODES.VALIDATION_FAILED, "invalid subscription payload"), 400);
  }

  const subscription = await prisma.subscription.upsert({
    where: { userId: auth.user.id },
    create: {
      id: randomUUID(),
      userId: auth.user.id,
      tier: payload.tier,
      status: "pending",
      providerRef: randomUUID(),
      paidAt: null,
    },
    update: {
      tier: payload.tier,
      status: "pending",
      providerRef: randomUUID(),
      paidAt: null,
    },
  });

  return json(ok({ subscription: publicSubscription(subscription) }), 201);
}

export async function getMySubscription(request: Request): Promise<Response> {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) return json(auth.body, auth.status);

  const subscription = await prisma.subscription.findUnique({
    where: { userId: auth.user.id },
  });

  return json(
    ok({
      subscription: subscription ? publicSubscription(subscription) : null,
    }),
  );
}

export async function handlePaymentCallback(
  request: Request,
): Promise<Response> {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-payment-signature"))) {
    return json(err(ERROR_CODES.FORBIDDEN, "invalid payment signature"), 403);
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    return json(err(ERROR_CODES.VALIDATION_FAILED, "invalid callback payload"), 400);
  }

  const payload = paymentCallbackSchema.safeParse(parsedPayload);
  if (!payload.success) {
    return json(err(ERROR_CODES.VALIDATION_FAILED, "invalid callback payload"), 400);
  }

  const subscription = await prisma.subscription.findUnique({
    where: { providerRef: payload.data.providerRef },
  });
  if (!subscription) {
    return json(err(ERROR_CODES.NOT_FOUND, "subscription not found"), 404);
  }

  if (subscription.status === "active") {
    return json(ok({ subscription: publicSubscription(subscription) }));
  }

  const activated = await prisma.$transaction(async (tx) => {
    const updatedSubscription = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "active",
        paidAt: new Date(),
      },
    });
    await tx.user.update({
      where: { id: subscription.userId },
      data: { subscriptionTier: subscription.tier },
    });

    return updatedSubscription;
  });

  return json(ok({ subscription: publicSubscription(activated) }));
}

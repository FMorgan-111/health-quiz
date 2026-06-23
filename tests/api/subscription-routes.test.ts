import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../lib/api/envelope";
import { signAccessToken } from "../../lib/auth/tokens";

type Tier = "free" | "premium" | "pro";

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  subscriptionTier: Tier;
};

type SubscriptionRecord = {
  id: string;
  userId: string;
  tier: Tier;
  status: "pending" | "active" | "canceled";
  providerRef: string;
  paidAt: Date | null;
};

const db = vi.hoisted(() => {
  const user: UserRecord = {
    id: "user-1",
    email: "ada@example.com",
    passwordHash: "hash",
    subscriptionTier: "free",
  };
  const subscriptions = new Map<string, SubscriptionRecord>();

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) =>
        where.id === user.id ? user : null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { subscriptionTier: Tier } }) => {
        if (where.id !== user.id) return null;
        user.subscriptionTier = data.subscriptionTier;
        return user;
      }),
    },
    subscription: {
      findUnique: vi.fn(async ({ where }: { where: { userId?: string; providerRef?: string } }) => {
        if (where.userId) {
          return [...subscriptions.values()].find((item) => item.userId === where.userId) ?? null;
        }
        if (where.providerRef) {
          return [...subscriptions.values()].find((item) => item.providerRef === where.providerRef) ?? null;
        }
        return null;
      }),
      upsert: vi.fn(async ({ where, create, update }: {
        where: { userId: string };
        create: SubscriptionRecord;
        update: Partial<SubscriptionRecord>;
      }) => {
        const existing = [...subscriptions.values()].find(
          (item) => item.userId === where.userId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        subscriptions.set(create.id, create);
        return create;
      }),
      update: vi.fn(async ({ where, data }: {
        where: { id: string };
        data: Partial<SubscriptionRecord>;
      }) => {
        const existing = subscriptions.get(where.id);
        if (!existing) return null;
        Object.assign(existing, data);
        return existing;
      }),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };

  return {
    prisma,
    user,
    subscriptions,
    reset() {
      user.subscriptionTier = "free";
      subscriptions.clear();
      prisma.user.findUnique.mockClear();
      prisma.user.update.mockClear();
      prisma.subscription.findUnique.mockClear();
      prisma.subscription.upsert.mockClear();
      prisma.subscription.update.mockClear();
      prisma.$transaction.mockClear();
    },
  };
});

vi.mock("../../lib/db", () => ({
  prisma: db.prisma,
}));

const { POST: createSubscription } = await import("../../app/api/v1/subscriptions/route");
const { GET: getSubscription } = await import("../../app/api/v1/subscriptions/me/route");
const { POST: paymentCallback } = await import(
  "../../app/api/v1/subscriptions/callback/route"
);

async function bearerHeaders() {
  const accessToken = await signAccessToken(db.user);
  return { authorization: `Bearer ${accessToken}` };
}

function jsonRequest(path: string, body: unknown, headers: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function signedCallback(body: unknown, secret: string): Request {
  const rawBody = JSON.stringify(body);
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  return new Request("http://localhost/api/v1/subscriptions/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-payment-signature": `sha256=${signature}`,
    },
    body: rawBody,
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<{
    code: number;
    message: string;
    data: Record<string, unknown> | null;
  }>;
}

describe("subscription routes", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "unit-test-secret-with-enough-length";
    process.env.PAYMENT_WEBHOOK_SECRET = "payment-secret";
    db.reset();
  });

  it("creates a pending subscription and returns it from /subscriptions/me", async () => {
    const headers = await bearerHeaders();
    const createResponse = await createSubscription(
      jsonRequest("/api/v1/subscriptions", { tier: "premium" }, headers),
    );
    const createBody = await readJson(createResponse);

    expect(createResponse.status).toBe(201);
    expect(createBody.code).toBe(0);
    expect(createBody.data?.subscription).toMatchObject({
      userId: "user-1",
      tier: "premium",
      status: "pending",
      providerRef: expect.any(String),
    });

    const getResponse = await getSubscription(
      new Request("http://localhost/api/v1/subscriptions/me", { headers }),
    );
    const getBody = await readJson(getResponse);

    expect(getResponse.status).toBe(200);
    expect(getBody.data?.subscription).toEqual(createBody.data?.subscription);
  });

  it("activates the subscription and user tier from a valid idempotent HMAC callback", async () => {
    const headers = await bearerHeaders();
    const createResponse = await createSubscription(
      jsonRequest("/api/v1/subscriptions", { tier: "premium" }, headers),
    );
    const createBody = await readJson(createResponse);
    const providerRef = String(
      (createBody.data?.subscription as { providerRef: string }).providerRef,
    );

    const callbackBody = { providerRef, status: "paid" };
    const firstResponse = await paymentCallback(
      signedCallback(callbackBody, "payment-secret"),
    );
    const firstBody = await readJson(firstResponse);

    expect(firstResponse.status).toBe(200);
    expect(firstBody.data?.subscription).toMatchObject({
      providerRef,
      tier: "premium",
      status: "active",
    });
    expect(db.user.subscriptionTier).toBe("premium");

    const secondResponse = await paymentCallback(
      signedCallback(callbackBody, "payment-secret"),
    );
    const secondBody = await readJson(secondResponse);

    expect(secondResponse.status).toBe(200);
    expect(secondBody.data?.subscription).toEqual(firstBody.data?.subscription);
    expect(db.prisma.subscription.update).toHaveBeenCalledTimes(1);
  });

  it("rejects callbacks with a bad HMAC signature", async () => {
    const response = await paymentCallback(
      signedCallback({ providerRef: "missing", status: "paid" }, "wrong-secret"),
    );
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(body.data).toBeNull();
  });
});

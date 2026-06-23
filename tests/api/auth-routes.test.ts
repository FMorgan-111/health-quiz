import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../lib/api/envelope";

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  subscriptionTier: "free" | "premium" | "pro";
};

const db = vi.hoisted(() => {
  const users = new Map<string, UserRecord>();
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) {
          return [...users.values()].find((user) => user.email === where.email) ?? null;
        }
        if (where.id) {
          return users.get(where.id) ?? null;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: { email: string; passwordHash: string } }) => {
        const user: UserRecord = {
          id: `user-${users.size + 1}`,
          email: data.email,
          passwordHash: data.passwordHash,
          subscriptionTier: "free",
        };
        users.set(user.id, user);
        return user;
      }),
    },
  };

  return {
    prisma,
    reset() {
      users.clear();
      prisma.user.findUnique.mockClear();
      prisma.user.create.mockClear();
    },
    users,
  };
});

vi.mock("../../lib/db", () => ({
  prisma: db.prisma,
}));

const { POST: register } = await import("../../app/api/v1/auth/register/route");
const { POST: login } = await import("../../app/api/v1/auth/login/route");
const { GET: me } = await import("../../app/api/v1/users/me/route");

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<{
    code: number;
    message: string;
    data: Record<string, unknown> | null;
  }>;
}

describe("JWT auth routes", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "unit-test-secret-with-enough-length";
    db.reset();
  });

  it("registers a user, hashes the password, logs in, and resolves /users/me from a bearer token", async () => {
    const registerResponse = await register(
      jsonRequest("/api/v1/auth/register", {
        email: "Ada@Example.com",
        password: "correct horse battery staple",
      }),
    );
    const registerJson = await readJson(registerResponse);

    expect(registerResponse.status).toBe(201);
    expect(registerJson.code).toBe(0);
    expect(registerJson.data?.user).toEqual({
      id: "user-1",
      email: "ada@example.com",
      subscriptionTier: "free",
    });
    expect(registerJson.data?.accessToken).toEqual(expect.any(String));
    expect(registerJson.data?.refreshToken).toEqual(expect.any(String));
    expect(db.prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "ada@example.com",
        passwordHash: expect.not.stringContaining("correct horse"),
      },
    });

    const loginResponse = await login(
      jsonRequest("/api/v1/auth/login", {
        email: "ada@example.com",
        password: "correct horse battery staple",
      }),
    );
    const loginJson = await readJson(loginResponse);

    expect(loginResponse.status).toBe(200);
    expect(loginJson.code).toBe(0);
    expect(loginJson.data?.user).toEqual(registerJson.data?.user);

    const meResponse = await me(
      new Request("http://localhost/api/v1/users/me", {
        headers: {
          authorization: `Bearer ${loginJson.data?.accessToken}`,
        },
      }),
    );
    const meJson = await readJson(meResponse);

    expect(meResponse.status).toBe(200);
    expect(meJson).toEqual({
      code: 0,
      message: "ok",
      data: {
        user: {
          id: "user-1",
          email: "ada@example.com",
          subscriptionTier: "free",
        },
      },
    });
  });

  it("rejects invalid registration input with the validation error code", async () => {
    const response = await register(
      jsonRequest("/api/v1/auth/register", {
        email: "not-an-email",
        password: "short",
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(body.data).toBeNull();
  });

  it("rejects missing bearer tokens on /users/me", async () => {
    const response = await me(new Request("http://localhost/api/v1/users/me"));
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(body.code).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(body.data).toBeNull();
  });
});

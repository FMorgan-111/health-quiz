import { NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_CODES, err, ok } from "../api/envelope";
import { hashPassword, verifyPassword } from "./password";
import {
  createUser,
  findUserByEmail,
  toPublicUser,
  type PublicUser,
} from "./store";
import {
  ACCESS_TOKEN_SECONDS,
  REFRESH_TOKEN_SECONDS,
  signAccessToken,
  signRefreshToken,
  type TokenUser,
} from "./tokens";

const credentialsSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
});

interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

function json<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status });
}

async function buildAuthResponse(user: TokenUser): Promise<AuthResponse> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user),
    signRefreshToken(user),
  ]);

  return {
    user,
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_SECONDS,
    refreshExpiresIn: REFRESH_TOKEN_SECONDS,
  };
}

async function parseCredentials(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return null;
  }

  const parsed = credentialsSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export async function registerUser(request: Request): Promise<Response> {
  const credentials = await parseCredentials(request);
  if (!credentials) {
    return json(err(ERROR_CODES.VALIDATION_FAILED, "invalid credentials"), 400);
  }

  const existing = await findUserByEmail(credentials.email);
  if (existing) {
    return json(err(ERROR_CODES.CONFLICT, "email already registered"), 409);
  }

  const passwordHash = await hashPassword(credentials.password);
  const user = await createUser(credentials.email, passwordHash);
  const response = await buildAuthResponse(toPublicUser(user));

  return json(ok(response), 201);
}

export async function loginUser(request: Request): Promise<Response> {
  const credentials = await parseCredentials(request);
  if (!credentials) {
    return json(err(ERROR_CODES.VALIDATION_FAILED, "invalid credentials"), 400);
  }

  const user = await findUserByEmail(credentials.email);
  if (!user) {
    return json(err(ERROR_CODES.UNAUTHORIZED, "invalid email or password"), 401);
  }

  const passwordMatches = await verifyPassword(
    credentials.password,
    user.passwordHash,
  );
  if (!passwordMatches) {
    return json(err(ERROR_CODES.UNAUTHORIZED, "invalid email or password"), 401);
  }

  const response = await buildAuthResponse(toPublicUser(user));
  return json(ok(response));
}

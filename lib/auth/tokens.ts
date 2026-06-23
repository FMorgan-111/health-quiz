import { SignJWT, jwtVerify } from "jose";

export const ACCESS_TOKEN_SECONDS = 60 * 60 * 2;
export const REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 7;

export type SubscriptionTier = "free" | "premium" | "pro";
export type TokenType = "access" | "refresh";

export interface TokenUser {
  id: string;
  email: string;
  subscriptionTier: SubscriptionTier;
}

export interface AuthTokenPayload extends TokenUser {
  type: TokenType;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET must be set to at least 16 characters");
  }
  return new TextEncoder().encode(secret);
}

async function signToken(
  user: TokenUser,
  type: TokenType,
  expiresInSeconds: number,
): Promise<string> {
  return new SignJWT({
    email: user.email,
    subscriptionTier: user.subscriptionTier,
    type,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(getJwtSecret());
}

export function signAccessToken(user: TokenUser): Promise<string> {
  return signToken(user, "access", ACCESS_TOKEN_SECONDS);
}

export function signRefreshToken(user: TokenUser): Promise<string> {
  return signToken(user, "refresh", REFRESH_TOKEN_SECONDS);
}

export async function verifyAuthToken(
  token: string,
  expectedType: TokenType,
): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());

  if (payload.type !== expectedType || typeof payload.sub !== "string") {
    throw new Error("invalid token type");
  }

  if (
    typeof payload.email !== "string" ||
    !["free", "premium", "pro"].includes(String(payload.subscriptionTier))
  ) {
    throw new Error("invalid token payload");
  }

  return {
    id: payload.sub,
    email: payload.email,
    subscriptionTier: payload.subscriptionTier as SubscriptionTier,
    type: expectedType,
  };
}

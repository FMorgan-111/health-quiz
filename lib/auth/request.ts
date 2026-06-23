import { ERROR_CODES, err } from "../api/envelope";
import { findUserById, toPublicUser, type PublicUser } from "./store";
import { verifyAuthToken } from "./tokens";

export interface AuthenticatedRequest {
  user: PublicUser;
}

export interface AuthFailure {
  status: number;
  body: ReturnType<typeof err>;
}

function unauthorized(message: string): AuthFailure {
  return {
    status: 401,
    body: err(ERROR_CODES.UNAUTHORIZED, message),
  };
}

export function bearerTokenFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function authenticateRequest(
  request: Request,
): Promise<AuthenticatedRequest | AuthFailure> {
  const token = bearerTokenFrom(request);
  if (!token) return unauthorized("missing bearer token");

  try {
    const payload = await verifyAuthToken(token, "access");
    const user = await findUserById(payload.id);
    if (!user) return unauthorized("invalid bearer token");

    return { user: toPublicUser(user) };
  } catch {
    return unauthorized("invalid bearer token");
  }
}

export function isAuthFailure(
  result: AuthenticatedRequest | AuthFailure,
): result is AuthFailure {
  return "body" in result;
}

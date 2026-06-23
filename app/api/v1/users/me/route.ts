import { NextResponse } from "next/server";
import { ok } from "../../../../../lib/api/envelope";
import {
  authenticateRequest,
  isAuthFailure,
} from "../../../../../lib/auth/request";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  return NextResponse.json(ok({ user: auth.user }));
}

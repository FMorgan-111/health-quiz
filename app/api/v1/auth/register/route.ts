import { registerUser } from "../../../../../lib/auth/routes";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return registerUser(request);
}

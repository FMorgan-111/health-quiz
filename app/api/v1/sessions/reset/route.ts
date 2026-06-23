import { resetSession } from "../../../../../lib/sessions/routes";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  return resetSession();
}

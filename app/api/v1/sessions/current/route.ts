import { getCurrent } from "../../../../../lib/sessions/routes";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return getCurrent();
}

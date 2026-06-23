import { getMySubscription } from "../../../../../lib/subscriptions/routes";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return getMySubscription(request);
}

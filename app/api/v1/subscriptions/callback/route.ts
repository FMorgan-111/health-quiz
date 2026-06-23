import { handlePaymentCallback } from "../../../../../lib/subscriptions/routes";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handlePaymentCallback(request);
}

import { submitStep } from "../../../../../../../lib/sessions/routes";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: { step: string } | Promise<{ step: string }> },
): Promise<Response> {
  return submitStep(request, context);
}

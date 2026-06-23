import { getQuestionnaire } from "../../../../../lib/assessments/routes";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
): Promise<Response> {
  return getQuestionnaire(request, context);
}

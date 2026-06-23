import { submitAssessmentStep } from "../../../../../../../lib/assessments/routes";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: { step: string } | Promise<{ step: string }> },
): Promise<Response> {
  return submitAssessmentStep(request, context);
}

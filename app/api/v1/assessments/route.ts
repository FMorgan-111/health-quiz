import { createAssessment } from "../../../../lib/assessments/routes";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return createAssessment(request);
}

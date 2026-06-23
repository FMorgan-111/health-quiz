import { getCurrentAssessment } from "../../../../../lib/assessments/routes";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return getCurrentAssessment(request);
}

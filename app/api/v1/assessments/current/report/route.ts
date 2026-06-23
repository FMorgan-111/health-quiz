import { getCurrentReport } from "../../../../../../lib/reports/routes";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return getCurrentReport(request);
}

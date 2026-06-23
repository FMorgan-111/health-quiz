import { NextResponse } from "next/server";
import { ERROR_CODES, err, ok } from "../api/envelope";
import {
  authenticateRequest,
  isAuthFailure,
} from "../auth/request";
import { toScoringAnswers, toScoringQuestions } from "../contracts/scoring-adapter";
import { prisma } from "../db";
import { buildReport, type Report, type Tier } from "../report";
import { scoreAssessment } from "../scoring";

interface CachedTierReport {
  tier: Tier;
  report: Report;
}

function json<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status });
}

function isTier(value: unknown): value is Tier {
  return value === "free" || value === "premium" || value === "pro";
}

function cachedReportForTier(
  cached: unknown,
  tier: Tier,
): CachedTierReport | null {
  if (!cached || typeof cached !== "object") return null;
  const candidate = cached as Partial<CachedTierReport>;
  if (candidate.tier !== tier || !candidate.report) return null;
  return candidate as CachedTierReport;
}

export async function getCurrentReport(request: Request): Promise<Response> {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) {
    return json(auth.body, auth.status);
  }

  const tier = isTier(auth.user.subscriptionTier)
    ? auth.user.subscriptionTier
    : "free";

  const assessment = await prisma.assessment.findFirst({
    where: { userId: auth.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      questionnaire: {
        include: {
          questions: {
            orderBy: [{ step: "asc" }, { order: "asc" }],
          },
        },
      },
      answers: {
        orderBy: [{ step: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!assessment) {
    return json(err(ERROR_CODES.NOT_FOUND, "assessment not found"), 404);
  }

  if (
    assessment.status !== "completed" &&
    assessment.status !== "report_generated"
  ) {
    return json(err(ERROR_CODES.CONFLICT, "assessment is not completed"), 409);
  }

  const cached = cachedReportForTier(assessment.report, tier);
  if (cached) {
    return json(ok({ report: cached.report }));
  }

  const questions = assessment.questionnaire.questions.map((question) => ({
    id: question.id,
    dimension: question.dimension,
    type: question.type,
    required: question.required,
    max_value: question.maxValue,
    step: question.step,
    order: question.order,
  }));
  const answers = assessment.answers.map((answer) => ({
    assessment_id: answer.assessmentId,
    question_id: answer.questionId,
    step: answer.step,
    value: answer.value,
  }));

  const scored = scoreAssessment(
    toScoringQuestions(questions),
    toScoringAnswers(answers),
  );
  const report = buildReport(scored, tier);
  const cachedReport: CachedTierReport = { tier, report };

  await prisma.assessment.update({
    where: { id: assessment.id },
    data: {
      report: cachedReport as never,
      status: "report_generated",
      reportCreatedAt: new Date(),
    },
  });

  return json(ok({ report }));
}

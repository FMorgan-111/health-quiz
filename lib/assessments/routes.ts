import { NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_CODES, err, ok } from "../api/envelope";
import {
  authenticateRequest,
  isAuthFailure,
} from "../auth/request";
import { prisma } from "../db";

type RouteParams<T extends Record<string, string>> = {
  params: T | Promise<T>;
};

const createAssessmentSchema = z.object({
  questionnaireId: z.string().min(1).optional(),
});

const answerSchema = z.object({
  questionId: z.string().min(1),
  value: z.union([
    z.number().finite(),
    z.string(),
    z.array(z.string()),
    z.null(),
  ]),
});

const stepSubmissionSchema = z.object({
  version: z.number().int().min(0),
  answers: z.array(answerSchema),
});

function json<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status });
}

async function parseJson<T>(
  request: Request,
  schema: z.ZodSchema<T>,
): Promise<T | null> {
  try {
    const payload = await request.json();
    const parsed = schema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function routeParams<T extends Record<string, string>>(
  context: RouteParams<T>,
): Promise<T> {
  return Promise.resolve(context.params);
}

function publicAssessment(assessment: {
  id: string;
  questionnaireId: string;
  status: string;
  currentStep: number;
  version: number;
  answers?: Array<{
    assessmentId: string;
    questionId: string;
    step: number;
    value: unknown;
  }>;
}) {
  return {
    id: assessment.id,
    questionnaireId: assessment.questionnaireId,
    status: assessment.status,
    currentStep: assessment.currentStep,
    version: assessment.version,
    ...(assessment.answers
      ? {
          answers: assessment.answers.map((answer) => ({
            assessmentId: answer.assessmentId,
            questionId: answer.questionId,
            step: answer.step,
            value: answer.value,
          })),
        }
      : {}),
  };
}

async function authenticated(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthFailure(auth)) {
    return {
      response: json(auth.body, auth.status),
      user: null,
    };
  }

  return { response: null, user: auth.user };
}

export async function createAssessment(request: Request): Promise<Response> {
  const auth = await authenticated(request);
  if (auth.response) return auth.response;

  const payload = await parseJson(request, createAssessmentSchema);
  if (!payload) {
    return json(err(ERROR_CODES.VALIDATION_FAILED, "invalid assessment payload"), 400);
  }

  const questionnaire = payload.questionnaireId
    ? await prisma.questionnaire.findUnique({
        where: { id: payload.questionnaireId },
      })
    : await prisma.questionnaire.findFirst({
        where: { status: "published" },
        orderBy: { updatedAt: "desc" },
      });

  if (!questionnaire || questionnaire.status !== "published") {
    return json(err(ERROR_CODES.NOT_FOUND, "published questionnaire not found"), 404);
  }

  const assessment = await prisma.assessment.create({
    data: {
      userId: auth.user.id,
      questionnaireId: questionnaire.id,
    },
  });

  return json(ok({ assessment: publicAssessment(assessment) }), 201);
}

export async function getCurrentAssessment(request: Request): Promise<Response> {
  const auth = await authenticated(request);
  if (auth.response) return auth.response;

  const assessment = await prisma.assessment.findFirst({
    where: { userId: auth.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      answers: {
        orderBy: [{ step: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!assessment) {
    return json(err(ERROR_CODES.NOT_FOUND, "assessment not found"), 404);
  }

  return json(ok({ assessment: publicAssessment(assessment) }));
}

export async function getQuestionnaire(
  _request: Request,
  context: RouteParams<{ id: string }>,
): Promise<Response> {
  const { id } = await routeParams(context);
  const questionnaire = await prisma.questionnaire.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: [{ step: "asc" }, { order: "asc" }],
        include: {
          options: {
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!questionnaire || questionnaire.status !== "published") {
    return json(err(ERROR_CODES.NOT_FOUND, "questionnaire not found"), 404);
  }

  return json(ok({ questionnaire }));
}

export async function submitAssessmentStep(
  request: Request,
  context: RouteParams<{ step: string }>,
): Promise<Response> {
  const auth = await authenticated(request);
  if (auth.response) return auth.response;

  const { step: rawStep } = await routeParams(context);
  const step = Number(rawStep);
  if (!Number.isInteger(step) || step <= 0) {
    return json(err(ERROR_CODES.VALIDATION_FAILED, "invalid step"), 400);
  }

  const payload = await parseJson(request, stepSubmissionSchema);
  if (!payload) {
    return json(err(ERROR_CODES.VALIDATION_FAILED, "invalid step payload"), 400);
  }

  const assessment = await prisma.assessment.findFirst({
    where: { userId: auth.user.id },
    orderBy: { updatedAt: "desc" },
  });
  if (!assessment) {
    return json(err(ERROR_CODES.NOT_FOUND, "assessment not found"), 404);
  }

  if (step !== assessment.currentStep + 1) {
    return json(
      err(ERROR_CODES.VALIDATION_FAILED, "steps must be submitted sequentially"),
      400,
    );
  }

  const stepQuestions = await prisma.question.findMany({
    where: {
      questionnaireId: assessment.questionnaireId,
      step,
    },
    orderBy: { order: "asc" },
  });
  if (stepQuestions.length === 0) {
    return json(err(ERROR_CODES.NOT_FOUND, "step not found"), 404);
  }

  const questionIds = new Set(stepQuestions.map((question) => question.id));
  const answersByQuestion = new Map(
    payload.answers.map((answer) => [answer.questionId, answer]),
  );

  const unknownAnswer = payload.answers.find(
    (answer) => !questionIds.has(answer.questionId),
  );
  if (unknownAnswer) {
    return json(
      err(ERROR_CODES.VALIDATION_FAILED, "answer does not belong to this step"),
      400,
    );
  }

  const missingRequired = stepQuestions.find(
    (question) =>
      question.required &&
      (!answersByQuestion.has(question.id) ||
        answersByQuestion.get(question.id)?.value === null),
  );
  if (missingRequired) {
    return json(err(ERROR_CODES.VALIDATION_FAILED, "missing required answer"), 422);
  }

  const allQuestions = await prisma.question.findMany({
    where: { questionnaireId: assessment.questionnaireId },
    select: { step: true },
  });
  const maxStep = Math.max(...allQuestions.map((question) => question.step));
  const completed = step >= maxStep;

  const updated = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.assessment.updateMany({
      where: {
        id: assessment.id,
        userId: auth.user.id,
        version: payload.version,
      },
      data: {
        currentStep: step,
        status: completed ? "completed" : "in_progress",
        ...(completed ? { completedAt: new Date() } : {}),
        version: { increment: 1 },
      },
    });

    if (updateResult.count === 0) return null;

    await Promise.all(
      payload.answers.map((answer) =>
        tx.assessmentAnswer.upsert({
          where: {
            assessmentId_questionId: {
              assessmentId: assessment.id,
              questionId: answer.questionId,
            },
          },
          create: {
            assessmentId: assessment.id,
            questionId: answer.questionId,
            step,
            value: answer.value as never,
          },
          update: {
            step,
            value: answer.value as never,
          },
        }),
      ),
    );

    return tx.assessment.findUnique({
      where: { id: assessment.id },
      include: {
        answers: {
          orderBy: [{ step: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  });

  if (!updated) {
    return json(err(ERROR_CODES.CONFLICT, "assessment version conflict"), 409);
  }

  return json(ok({ assessment: publicAssessment(updated) }));
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../lib/api/envelope";
import { signAccessToken } from "../../lib/auth/tokens";

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  subscriptionTier: "free" | "premium" | "pro";
};

type QuestionRecord = {
  id: string;
  questionnaireId: string;
  step: number;
  order: number;
  prompt: string;
  dimension: string;
  type: "likert_5" | "single_choice" | "multi_choice" | "text";
  required: boolean;
  maxValue: number;
  options: Array<{ id: string; label: string; value: number; order: number }>;
};

type AssessmentRecord = {
  id: string;
  userId: string;
  questionnaireId: string;
  status: "draft" | "in_progress" | "completed" | "report_generated" | "abandoned";
  currentStep: number;
  version: number;
};

type AnswerRecord = {
  assessmentId: string;
  questionId: string;
  step: number;
  value: unknown;
};

const db = vi.hoisted(() => {
  const user: UserRecord = {
    id: "user-1",
    email: "ada@example.com",
    passwordHash: "hash",
    subscriptionTier: "free",
  };
  const questionnaire = {
    id: "questionnaire-1",
    slug: "daily-health",
    title: "Daily Health",
    description: "Eight-step health questionnaire",
    version: 1,
    status: "published",
  };
  const questions: QuestionRecord[] = [
    {
      id: "q-physical-1",
      questionnaireId: questionnaire.id,
      step: 1,
      order: 1,
      prompt: "How active were you today?",
      dimension: "身体活动",
      type: "likert_5",
      required: true,
      maxValue: 5,
      options: [],
    },
    {
      id: "q-sleep-1",
      questionnaireId: questionnaire.id,
      step: 2,
      order: 2,
      prompt: "How well did you sleep?",
      dimension: "睡眠",
      type: "likert_5",
      required: true,
      maxValue: 5,
      options: [],
    },
  ];
  const assessments = new Map<string, AssessmentRecord>();
  const answers = new Map<string, AnswerRecord>();

  function serializeAssessment(assessment: AssessmentRecord) {
    return {
      ...assessment,
      answers: [...answers.values()].filter(
        (answer) => answer.assessmentId === assessment.id,
      ),
    };
  }

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) =>
        where.id === user.id ? user : null,
      ),
    },
    questionnaire: {
      findFirst: vi.fn(async () => questionnaire),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) => {
        if (where.id && where.id !== questionnaire.id) return null;
        if (where.slug && where.slug !== questionnaire.slug) return null;
        return {
          ...questionnaire,
          questions: questions
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((question) => ({ ...question })),
        };
      }),
    },
    question: {
      findMany: vi.fn(async ({ where }: { where: { questionnaireId: string; step?: number } }) =>
        questions
          .filter((question) => question.questionnaireId === where.questionnaireId)
          .filter((question) => where.step === undefined || question.step === where.step)
          .map((question) => ({ ...question })),
      ),
    },
    assessment: {
      create: vi.fn(async ({ data }: { data: { userId: string; questionnaireId: string } }) => {
        const assessment: AssessmentRecord = {
          id: `assessment-${assessments.size + 1}`,
          userId: data.userId,
          questionnaireId: data.questionnaireId,
          status: "draft",
          currentStep: 0,
          version: 0,
        };
        assessments.set(assessment.id, assessment);
        return assessment;
      }),
      findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const assessment = [...assessments.values()].find(
          (item) => item.userId === where.userId,
        );
        return assessment ? serializeAssessment(assessment) : null;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const assessment = assessments.get(where.id);
        return assessment ? serializeAssessment(assessment) : null;
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: string; userId: string; version: number };
        data: {
          currentStep: number;
          status: AssessmentRecord["status"];
          completedAt?: Date;
          version: { increment: number };
        };
      }) => {
        const assessment = assessments.get(where.id);
        if (
          !assessment ||
          assessment.userId !== where.userId ||
          assessment.version !== where.version
        ) {
          return { count: 0 };
        }

        assessment.currentStep = data.currentStep;
        assessment.status = data.status;
        assessment.version += data.version.increment;
        assessments.set(assessment.id, assessment);
        return { count: 1 };
      }),
    },
    assessmentAnswer: {
      upsert: vi.fn(async ({ where, create, update }: {
        where: { assessmentId_questionId: { assessmentId: string; questionId: string } };
        create: AnswerRecord;
        update: Pick<AnswerRecord, "step" | "value">;
      }) => {
        const key = `${where.assessmentId_questionId.assessmentId}:${where.assessmentId_questionId.questionId}`;
        const existing = answers.get(key);
        const next = existing ? { ...existing, ...update } : create;
        answers.set(key, next);
        return next;
      }),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };

  return {
    prisma,
    reset() {
      assessments.clear();
      answers.clear();
      for (const model of [
        prisma.user,
        prisma.questionnaire,
        prisma.question,
        prisma.assessment,
        prisma.assessmentAnswer,
      ]) {
        for (const method of Object.values(model)) {
          if (typeof method === "function" && "mockClear" in method) method.mockClear();
        }
      }
      prisma.$transaction.mockClear();
    },
    assessments,
    answers,
    user,
  };
});

vi.mock("../../lib/db", () => ({
  prisma: db.prisma,
}));

const { POST: createAssessment } = await import("../../app/api/v1/assessments/route");
const { GET: currentAssessment } = await import("../../app/api/v1/assessments/current/route");
const { PATCH: submitStep } = await import(
  "../../app/api/v1/assessments/current/step/[step]/route"
);
const { GET: getQuestionnaire } = await import("../../app/api/v1/questionnaires/[id]/route");

async function bearerHeaders() {
  const accessToken = await signAccessToken(db.user);
  return { authorization: `Bearer ${accessToken}` };
}

function jsonRequest(path: string, body: unknown, headers: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<{
    code: number;
    message: string;
    data: Record<string, unknown> | null;
  }>;
}

describe("assessment routes", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "unit-test-secret-with-enough-length";
    db.reset();
  });

  it("creates an assessment and recovers current progress for the authenticated user", async () => {
    const headers = await bearerHeaders();
    const createResponse = await createAssessment(
      jsonRequest("/api/v1/assessments", { questionnaireId: "questionnaire-1" }, headers),
    );
    const createJson = await readJson(createResponse);

    expect(createResponse.status).toBe(201);
    expect(createJson.code).toBe(0);
    expect(createJson.data?.assessment).toMatchObject({
      id: "assessment-1",
      questionnaireId: "questionnaire-1",
      status: "draft",
      currentStep: 0,
      version: 0,
    });

    const currentResponse = await currentAssessment(
      new Request("http://localhost/api/v1/assessments/current", { headers }),
    );
    const currentJson = await readJson(currentResponse);

    expect(currentResponse.status).toBe(200);
    expect(currentJson.data?.assessment).toMatchObject({
      id: "assessment-1",
      currentStep: 0,
      answers: [],
    });
  });

  it("returns a published questionnaire with ordered questions", async () => {
    const response = await getQuestionnaire(
      new Request("http://localhost/api/v1/questionnaires/questionnaire-1"),
      { params: { id: "questionnaire-1" } },
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.data?.questionnaire).toMatchObject({
      id: "questionnaire-1",
      slug: "daily-health",
      questions: [
        { id: "q-physical-1", step: 1, order: 1 },
        { id: "q-sleep-1", step: 2, order: 2 },
      ],
    });
  });

  it("rejects skipped steps and missing required answers", async () => {
    const headers = await bearerHeaders();
    await createAssessment(
      jsonRequest("/api/v1/assessments", { questionnaireId: "questionnaire-1" }, headers),
    );

    const skippedResponse = await submitStep(
      jsonRequest(
        "/api/v1/assessments/current/step/2",
        { version: 0, answers: [{ questionId: "q-sleep-1", value: 4 }] },
        headers,
      ),
      { params: { step: "2" } },
    );
    const skippedBody = await readJson(skippedResponse);

    expect(skippedResponse.status).toBe(400);
    expect(skippedBody.code).toBe(ERROR_CODES.VALIDATION_FAILED);

    const missingResponse = await submitStep(
      jsonRequest(
        "/api/v1/assessments/current/step/1",
        { version: 0, answers: [] },
        headers,
      ),
      { params: { step: "1" } },
    );
    const missingBody = await readJson(missingResponse);

    expect(missingResponse.status).toBe(422);
    expect(missingBody.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });

  it("upserts answers and advances the optimistic version for a valid step", async () => {
    const headers = await bearerHeaders();
    await createAssessment(
      jsonRequest("/api/v1/assessments", { questionnaireId: "questionnaire-1" }, headers),
    );

    const response = await submitStep(
      jsonRequest(
        "/api/v1/assessments/current/step/1",
        { version: 0, answers: [{ questionId: "q-physical-1", value: 5 }] },
        headers,
      ),
      { params: { step: "1" } },
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.data?.assessment).toMatchObject({
      id: "assessment-1",
      currentStep: 1,
      status: "in_progress",
      version: 1,
    });
    expect([...db.answers.values()]).toEqual([
      {
        assessmentId: "assessment-1",
        questionId: "q-physical-1",
        step: 1,
        value: 5,
      },
    ]);

    const staleResponse = await submitStep(
      jsonRequest(
        "/api/v1/assessments/current/step/2",
        { version: 0, answers: [{ questionId: "q-sleep-1", value: 3 }] },
        headers,
      ),
      { params: { step: "2" } },
    );
    const staleBody = await readJson(staleResponse);

    expect(staleResponse.status).toBe(409);
    expect(staleBody.code).toBe(ERROR_CODES.CONFLICT);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../lib/api/envelope";
import { signAccessToken } from "../../lib/auth/tokens";

type Tier = "free" | "premium" | "pro";

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  subscriptionTier: Tier;
};

const db = vi.hoisted(() => {
  const user: UserRecord = {
    id: "user-1",
    email: "ada@example.com",
    passwordHash: "hash",
    subscriptionTier: "free",
  };
  const questions = [
    {
      id: "q-physical-1",
      dimension: "身体活动",
      type: "likert_5",
      required: true,
      maxValue: 5,
      step: 1,
      order: 1,
    },
    {
      id: "q-sleep-1",
      dimension: "睡眠",
      type: "likert_5",
      required: true,
      maxValue: 5,
      step: 2,
      order: 2,
    },
  ];
  const assessment = {
    id: "assessment-1",
    userId: user.id,
    questionnaireId: "questionnaire-1",
    status: "completed",
    currentStep: 2,
    version: 2,
    report: null as unknown,
    questionnaire: {
      id: "questionnaire-1",
      questions,
    },
    answers: [
      {
        assessmentId: "assessment-1",
        questionId: "q-physical-1",
        step: 1,
        value: 5,
      },
      {
        assessmentId: "assessment-1",
        questionId: "q-sleep-1",
        step: 2,
        value: 2,
      },
    ],
  };

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) =>
        where.id === user.id ? user : null,
      ),
    },
    assessment: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string } }) =>
        where.userId === user.id ? assessment : null,
      ),
      update: vi.fn(async ({ data }: { data: { report: unknown; status: string } }) => {
        assessment.report = data.report;
        assessment.status = data.status;
        return assessment;
      }),
    },
  };

  return {
    prisma,
    user,
    assessment,
    reset() {
      user.subscriptionTier = "free";
      assessment.status = "completed";
      assessment.report = null;
      prisma.user.findUnique.mockClear();
      prisma.assessment.findFirst.mockClear();
      prisma.assessment.update.mockClear();
    },
  };
});

vi.mock("../../lib/db", () => ({
  prisma: db.prisma,
}));

const { GET: getReport } = await import(
  "../../app/api/v1/assessments/current/report/route"
);

async function bearerHeaders() {
  const accessToken = await signAccessToken(db.user);
  return { authorization: `Bearer ${accessToken}` };
}

async function readJson(response: Response) {
  return response.json() as Promise<{
    code: number;
    message: string;
    data: Record<string, unknown> | null;
  }>;
}

describe("report route", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "unit-test-secret-with-enough-length";
    db.reset();
  });

  it("generates a free-tier report, caches it, then recomputes when the user upgrades to pro", async () => {
    const freeResponse = await getReport(
      new Request("http://localhost/api/v1/assessments/current/report", {
        headers: await bearerHeaders(),
      }),
    );
    const freeBody = await readJson(freeResponse);

    expect(freeResponse.status).toBe(200);
    expect(freeBody.code).toBe(0);
    expect(freeBody.data?.report).toMatchObject({
      summary: expect.stringContaining("70"),
      recommendations: expect.arrayContaining(["固定作息，保证 7–8 小时睡眠"]),
      premium_extra: null,
    });
    expect(db.prisma.assessment.update).toHaveBeenCalledTimes(1);

    db.user.subscriptionTier = "pro";
    const proResponse = await getReport(
      new Request("http://localhost/api/v1/assessments/current/report", {
        headers: await bearerHeaders(),
      }),
    );
    const proBody = await readJson(proResponse);

    expect(proResponse.status).toBe(200);
    expect(proBody.data?.report).toMatchObject({
      premium_extra: {
        trend_analysis: expect.any(String),
        peer_comparison: expect.any(String),
        pdf_url: expect.any(String),
      },
    });
    expect(db.prisma.assessment.update).toHaveBeenCalledTimes(2);

    const cachedProResponse = await getReport(
      new Request("http://localhost/api/v1/assessments/current/report", {
        headers: await bearerHeaders(),
      }),
    );
    const cachedProBody = await readJson(cachedProResponse);

    expect(cachedProResponse.status).toBe(200);
    expect(cachedProBody.data?.report).toEqual(proBody.data?.report);
    expect(db.prisma.assessment.update).toHaveBeenCalledTimes(2);
  });

  it("rejects report generation before the assessment is completed", async () => {
    db.assessment.status = "in_progress";

    const response = await getReport(
      new Request("http://localhost/api/v1/assessments/current/report", {
        headers: await bearerHeaders(),
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(409);
    expect(body.code).toBe(ERROR_CODES.CONFLICT);
    expect(body.data).toBeNull();
  });
});

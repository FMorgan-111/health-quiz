"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError, API_CODES } from "../../lib/client/api";
import { isLoggedIn, clearSession } from "../../lib/client/auth";
import Likert from "../../components/Likert";
import ProgressBar from "../../components/ProgressBar";

interface Question {
  id: string;
  step: number;
  order: number;
  prompt: string;
  dimension: string;
  type: string;
  maxValue: number;
  options: { label: string; value: number; order: number }[];
}

interface Assessment {
  id: string;
  questionnaireId: string;
  status: string;
  currentStep: number;
  version: number;
}

export default function QuizPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [stepValue, setStepValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 初始化：确保登录 → 取/建 assessment → 拉题目
  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let current = await getOrCreateAssessment();
        const q = await apiFetch<{ questionnaire: { questions: Question[] } }>(
          `/questionnaires/${current.questionnaireId}`,
          { auth: false },
        );
        if (cancelled) return;
        const sorted = [...q.questionnaire.questions].sort(
          (a, b) => a.step - b.step || a.order - b.order,
        );
        setQuestions(sorted);
        setAssessment(current);
        // 已完成 → 直接去结果
        if (current.status === "completed" || current.status === "report_generated") {
          router.replace("/result");
          return;
        }
      } catch (err) {
        if (cancelled) return;
        handleFatal(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFatal = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.code === API_CODES.UNAUTHORIZED) {
        clearSession();
        router.replace("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "加载失败，请刷新重试");
    },
    [router],
  );

  if (loading) return <Centered>加载中…</Centered>;
  if (error) return <Centered>{error}</Centered>;
  if (!assessment || questions.length === 0)
    return <Centered>暂无可用问卷</Centered>;

  const totalSteps = questions[questions.length - 1].step;
  const stepNumber = assessment.currentStep + 1; // 下一步要答的
  const stepQuestion = questions.find((q) => q.step === stepNumber);

  if (!stepQuestion) return <Centered>问卷数据异常</Centered>;

  async function submitStep() {
    if (!assessment || !stepQuestion) return;
    if (stepValue === null) {
      setError("请选择一个选项");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ assessment: Assessment }>(
        `/assessments/current/step/${stepNumber}`,
        {
          method: "PATCH",
          body: {
            version: assessment.version,
            answers: [{ questionId: stepQuestion.id, value: stepValue }],
          },
        },
      );
      const updated = res.assessment;
      setStepValue(null);
      if (updated.status === "completed" || updated.status === "report_generated") {
        router.push("/result");
        return;
      }
      setAssessment(updated);
    } catch (err) {
      if (err instanceof ApiError && err.code === API_CODES.CONFLICT) {
        // version 冲突：重新拉当前进度再让用户重试
        try {
          const fresh = await apiFetch<{ assessment: Assessment }>(
            "/assessments/current",
          );
          setAssessment(fresh.assessment);
          setError("进度已更新，请重新确认本题");
        } catch (e) {
          handleFatal(e);
        }
      } else if (err instanceof ApiError && err.status === 422) {
        setError("请先回答必答题");
      } else {
        handleFatal(err);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <ProgressBar current={stepNumber} total={totalSteps} />
        <h2 className="mb-6 mt-6 text-xl font-semibold text-slate-900">
          {stepQuestion.prompt}
        </h2>
        <Likert
          options={[...stepQuestion.options].sort((a, b) => a.order - b.order)}
          value={stepValue}
          onChange={setStepValue}
        />
        {error && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy || stepValue === null}
          onClick={submitStep}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "提交中…" : stepNumber === totalSteps ? "完成测评" : "下一步"}
        </button>
      </div>
    </main>
  );
}

async function getOrCreateAssessment(): Promise<Assessment> {
  try {
    const res = await apiFetch<{ assessment: Assessment }>("/assessments/current");
    return res.assessment;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      const created = await apiFetch<{ assessment: Assessment }>("/assessments", {
        method: "POST",
        body: {},
      });
      return created.assessment;
    }
    throw err;
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-slate-600">
      {children}
    </main>
  );
}

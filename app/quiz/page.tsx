"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError, API_CODES } from "../../lib/client/api";
import ProgressBar from "../../components/ProgressBar";

interface Session {
  id: string;
  gender: string | null;
  goal: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  activityLevel: string | null;
  currentStep: number;
  completed: boolean;
  version: number;
  totalSteps: number;
}

type StepDef =
  | {
      step: number;
      field: keyof Session;
      prompt: string;
      kind: "choice";
      options: { label: string; value: string }[];
    }
  | {
      step: number;
      field: keyof Session;
      prompt: string;
      kind: "number";
      unit: string;
      min: number;
      max: number;
    };

const STEPS: StepDef[] = [
  {
    step: 1,
    field: "gender",
    prompt: "你的生理性别？",
    kind: "choice",
    options: [
      { label: "男", value: "male" },
      { label: "女", value: "female" },
      { label: "其他", value: "other" },
    ],
  },
  {
    step: 2,
    field: "goal",
    prompt: "你的健康目标？",
    kind: "choice",
    options: [
      { label: "减重", value: "lose_weight" },
      { label: "增肌", value: "gain_muscle" },
      { label: "保持身材", value: "stay_fit" },
      { label: "改善健康", value: "improve_health" },
    ],
  },
  { step: 3, field: "age", prompt: "你的年龄？", kind: "number", unit: "岁", min: 13, max: 120 },
  { step: 4, field: "heightCm", prompt: "你的身高？", kind: "number", unit: "cm", min: 80, max: 250 },
  { step: 5, field: "weightKg", prompt: "你的体重？", kind: "number", unit: "kg", min: 25, max: 400 },
  {
    step: 6,
    field: "targetWeightKg",
    prompt: "你的目标体重？",
    kind: "number",
    unit: "kg",
    min: 25,
    max: 400,
  },
  {
    step: 7,
    field: "activityLevel",
    prompt: "你的运动频率？",
    kind: "choice",
    options: [
      { label: "久坐（几乎不运动）", value: "sedentary" },
      { label: "轻度（每周 1-3 次）", value: "light" },
      { label: "中度（每周 3-5 次）", value: "moderate" },
      { label: "高强度（每周 6-7 次）", value: "active" },
      { label: "极高（体力工作/运动员）", value: "very_active" },
    ],
  },
];

export default function QuizPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [viewStep, setViewStep] = useState(1); // 当前正在看的步（可回退，范围 1..currentStep+1）
  const [choice, setChoice] = useState<string>("");
  const [num, setNum] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getOrCreateSession();
        if (cancelled) return;
        if (s.completed) {
          router.replace("/result");
          return;
        }
        setSession(s);
        setViewStep(s.currentStep + 1); // 进入时落在前沿（下一个要答的步）
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // 切换到某步时，预填该步已保存的值（回退编辑能看到之前填的）
  useEffect(() => {
    if (!session) return;
    const d = STEPS.find((s) => s.step === viewStep);
    if (!d) return;
    const v = (session as unknown as Record<string, unknown>)[d.field];
    if (d.kind === "choice") {
      setChoice(typeof v === "string" ? v : "");
      setNum("");
    } else {
      setNum(v != null ? String(v) : "");
      setChoice("");
    }
    setError(null);
  }, [viewStep, session]);

  const handleFatal = useCallback(
    (err: unknown) => setError(err instanceof ApiError ? err.message : "出错了，请刷新重试"),
    [],
  );

  if (loading) return <Centered>加载中…</Centered>;
  if (error && !session) return <Centered>{error}</Centered>;
  if (!session) return <Centered>暂无会话</Centered>;

  const def = STEPS.find((s) => s.step === viewStep);
  if (!def) return <Centered>问卷数据异常</Centered>;

  const isLastStep = viewStep === session.totalSteps;
  const isFrontier = viewStep === session.currentStep + 1; // 是否在最新一步（尚未答过）

  async function submit() {
    if (!session || !def) return;
    let value: string | number;
    if (def.kind === "choice") {
      if (!choice) {
        setError("请选择一项");
        return;
      }
      value = choice;
    } else {
      const n = Number(num);
      if (!num || !Number.isFinite(n)) {
        setError("请输入有效数字");
        return;
      }
      if (n < def.min || n > def.max) {
        setError(`请输入 ${def.min}–${def.max} 之间的数值`);
        return;
      }
      value = def.field === "age" ? Math.round(n) : n;
    }

    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ session: Session }>(
        `/sessions/current/step/${viewStep}`,
        { method: "PATCH", body: { version: session.version, data: { [def.field]: value } } },
      );
      const updated = res.session;
      setSession(updated);

      // 提交了最后一步且已到前沿 → 触发计算并去结果页
      if (updated.currentStep >= updated.totalSteps) {
        await apiFetch("/sessions/current/submit", { method: "POST" });
        router.push("/result");
        return;
      }
      // 否则前进一步（编辑早期步时也逐步回到前沿）
      setViewStep((v) => Math.min(v + 1, updated.currentStep + 1));
    } catch (err) {
      if (err instanceof ApiError && err.code === API_CODES.CONFLICT) {
        try {
          const fresh = await apiFetch<{ session: Session }>("/sessions/current");
          setSession(fresh.session);
          setViewStep(Math.min(viewStep, fresh.session.currentStep + 1));
          setError("进度已更新，请重新确认本步");
        } catch (e) {
          handleFatal(e);
        }
      } else if (err instanceof ApiError && err.code === API_CODES.VALIDATION_FAILED) {
        setError("输入不合法，请检查后重试");
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
        <ProgressBar current={viewStep} total={session.totalSteps} />
        <h2 className="mb-6 mt-6 text-xl font-semibold text-slate-900">{def.prompt}</h2>

        {def.kind === "choice" ? (
          <div className="flex flex-col gap-2">
            {def.options.map((opt) => {
              const selected = choice === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setChoice(opt.value)}
                  className={`rounded-xl border px-4 py-3 text-left font-medium transition ${
                    selected
                      ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-200"
                      : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              value={num}
              min={def.min}
              max={def.max}
              onChange={(e) => setNum(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder={`${def.min}–${def.max}`}
              autoFocus
            />
            <span className="text-slate-500">{def.unit}</span>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            disabled={busy || viewStep <= 1}
            onClick={() => setViewStep((v) => Math.max(1, v - 1))}
            className="rounded-xl border border-slate-200 px-5 py-3 font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← 上一步
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy
              ? "提交中…"
              : isLastStep
                ? "完成并查看结果"
                : isFrontier
                  ? "下一步"
                  : "保存并继续"}
          </button>
        </div>
      </div>
    </main>
  );
}

async function getOrCreateSession(): Promise<Session> {
  try {
    const res = await apiFetch<{ session: Session }>("/sessions/current");
    return res.session;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const created = await apiFetch<{ session: Session }>("/sessions", { method: "POST" });
      return created.session;
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

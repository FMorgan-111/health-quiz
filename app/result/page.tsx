"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError, API_CODES } from "../../lib/client/api";
import BmiGauge from "../../components/BmiGauge";
import ProjectionChart from "../../components/ProjectionChart";
import PlanSummary from "../../components/PlanSummary";
import Paywall from "../../components/Paywall";

interface ProjectionPoint {
  week: number;
  weightKg: number;
}

interface ResultView {
  bmi: number;
  bmi_category: string;
  daily_calories: number;
  locked: boolean;
  upgrade_hint?: string;
  target_date?: string;
  projection_curve?: ProjectionPoint[];
}

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<ResultView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch<{ result: ResultView }>("/sessions/current/result");
    setResult(res.result);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === API_CODES.UNAUTHORIZED) {
          router.replace("/quiz");
          return;
        }
        if (err instanceof ApiError && err.code === API_CODES.CONFLICT) {
          router.replace("/quiz"); // 未完成 → 回去答题
          return;
        }
        setError(err instanceof ApiError ? err.message : "加载报告失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, load]);

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      await apiFetch("/pay", { method: "POST" });
      await load(); // 重新拉，解锁完整字段
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "支付失败，请重试");
    } finally {
      setPaying(false);
    }
  }

  if (loading) return <Centered>生成报告中…</Centered>;
  if (error && !result) return <Centered>{error}</Centered>;
  if (!result) return <Centered>暂无报告</Centered>;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-1 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
          {result.locked ? "免费版报告" : "完整报告"}
        </div>
        <h1 className="mb-6 text-2xl font-bold text-slate-900">你的健康测评结果</h1>

        <BmiGauge bmi={result.bmi} category={result.bmi_category} />

        <div className="my-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="text-sm text-slate-500">每日建议摄入热量</div>
          <div className="text-2xl font-bold text-slate-900">
            {result.daily_calories.toLocaleString()} <span className="text-base font-normal">kcal</span>
          </div>
        </div>

        {result.locked ? (
          <Paywall onUpgrade={pay} busy={paying} hint={result.upgrade_hint} />
        ) : (
          <div className="animate-[fadeUp_0.4s_ease-out]">
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-sm text-white">
                ✓
              </span>
              <span className="font-semibold">完整报告已解锁</span>
            </div>
            <h2 className="mb-4 text-lg font-bold text-slate-900">你的专属目标计划</h2>
            {result.target_date && result.projection_curve && result.projection_curve.length > 0 ? (
              <>
                <PlanSummary points={result.projection_curve} targetDate={result.target_date} />
                <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">体重变化预测</h3>
                <ProjectionChart points={result.projection_curve} />
              </>
            ) : (
              <p className="text-slate-600">当前体重已是目标体重，继续保持即可 👍</p>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-slate-600">
      {children}
    </main>
  );
}

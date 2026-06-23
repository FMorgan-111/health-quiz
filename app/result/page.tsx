"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError, API_CODES } from "../../lib/client/api";
import { isLoggedIn, clearSession, saveSession, getUser, type AuthSession } from "../../lib/client/auth";
import ScoreCard from "../../components/ScoreCard";
import Paywall from "../../components/Paywall";

interface Dimension {
  name: string;
  score: number;
  level: string;
}

interface PremiumExtra {
  trend_analysis: string;
  peer_comparison?: string;
  pdf_url?: string;
}

interface Report {
  summary: string;
  dimensions: Dimension[];
  recommendations: string[];
  premium_extra: PremiumExtra | null;
}

export default function ResultPage() {
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const tier = getUser()?.subscriptionTier ?? "free";

  const loadReport = useCallback(async () => {
    const res = await apiFetch<{ report: Report }>("/assessments/current/report");
    setReport(res.report);
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await loadReport();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === API_CODES.UNAUTHORIZED) {
          clearSession();
          router.replace("/login");
          return;
        }
        if (err instanceof ApiError && err.status === 409) {
          // 测评尚未完成 → 回去答题
          router.replace("/quiz");
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
  }, [router, loadReport]);

  async function upgrade(target: "premium" | "pro") {
    setUpgrading(true);
    setError(null);
    try {
      const session = await apiFetch<AuthSession>("/dev/activate", {
        method: "POST",
        body: { tier: target },
      });
      saveSession(session); // 新 token 带新 tier
      await loadReport(); // 重新拉，premium_extra 解锁
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("演示支付未在此环境启用（需设置 ENABLE_DEV_PAY=1）");
      } else {
        setError(err instanceof ApiError ? err.message : "升级失败，请重试");
      }
    } finally {
      setUpgrading(false);
    }
  }

  if (loading) return <Centered>生成报告中…</Centered>;
  if (error && !report) return <Centered>{error}</Centered>;
  if (!report) return <Centered>暂无报告</Centered>;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-1 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
          {tier === "free" ? "免费版报告" : tier === "premium" ? "Premium 报告" : "Pro 报告"}
        </div>
        <h1 className="mb-2 text-2xl font-bold text-slate-900">你的健康测评结果</h1>
        <p className="mb-6 text-slate-600">{report.summary}</p>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          各维度评分
        </h2>
        <div className="mb-8 grid gap-3">
          {report.dimensions.map((d) => (
            <ScoreCard key={d.name} name={d.name} score={d.score} level={d.level} />
          ))}
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          健康建议
        </h2>
        <ul className="mb-8 space-y-2">
          {report.recommendations.map((rec, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-slate-700"
            >
              <span className="font-semibold text-indigo-600">{i + 1}.</span>
              {rec}
            </li>
          ))}
        </ul>

        {report.premium_extra ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="mb-3 font-bold text-emerald-900">深度洞察</h2>
            <p className="mb-2 text-slate-700">
              <span className="font-semibold">趋势分析：</span>
              {report.premium_extra.trend_analysis}
            </p>
            {report.premium_extra.peer_comparison && (
              <p className="mb-2 text-slate-700">
                <span className="font-semibold">同龄对比：</span>
                {report.premium_extra.peer_comparison}
              </p>
            )}
            {report.premium_extra.pdf_url && (
              <a
                href={report.premium_extra.pdf_url}
                className="inline-block text-indigo-600 hover:underline"
              >
                下载 PDF 报告 →
              </a>
            )}
          </div>
        ) : (
          <Paywall onUpgrade={upgrade} busy={upgrading} />
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
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

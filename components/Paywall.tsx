"use client";

interface PaywallProps {
  onUpgrade: (tier: "premium" | "pro") => void;
  busy: boolean;
}

export default function Paywall({ onUpgrade, busy }: PaywallProps) {
  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-6">
      <div className="mb-1 text-sm font-semibold uppercase tracking-wide text-indigo-600">
        解锁完整报告
      </div>
      <h3 className="mb-3 text-xl font-bold text-slate-900">
        升级查看你的深度健康洞察
      </h3>
      <ul className="mb-5 space-y-2 text-sm text-slate-600">
        <li className="flex items-center gap-2">
          <Check /> 趋势分析（trend analysis）
        </li>
        <li className="flex items-center gap-2">
          <Check /> 同龄人群对比（pro）
        </li>
        <li className="flex items-center gap-2">
          <Check /> 完整建议清单 + PDF 报告（pro）
        </li>
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => onUpgrade("premium")}
          className="flex-1 rounded-xl border border-indigo-600 bg-white px-4 py-3 font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50"
        >
          升级 Premium
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onUpgrade("pro")}
          className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          升级 Pro
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">
        演示环境：点击即模拟支付成功，立即解锁。
      </p>
    </div>
  );
}

function Check() {
  return (
    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-indigo-600 text-xs text-white">
      ✓
    </span>
  );
}

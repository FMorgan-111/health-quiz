"use client";

interface PaywallProps {
  onUpgrade: () => void;
  busy: boolean;
  hint?: string;
}

export default function Paywall({ onUpgrade, busy, hint }: PaywallProps) {
  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-teal-50/40 p-6">
      <div className="mb-1 text-sm font-semibold uppercase tracking-wide text-emerald-600">
        解锁完整报告
      </div>
      <h3 className="mb-3 text-xl font-bold text-slate-900">
        {hint ?? "升级查看目标达成日期与逐周预测曲线"}
      </h3>
      <ul className="mb-5 space-y-2 text-sm text-slate-600">
        <li className="flex items-center gap-2">
          <Check /> 预计达成目标体重的日期
        </li>
        <li className="flex items-center gap-2">
          <Check /> 逐周体重预测曲线
        </li>
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={onUpgrade}
        className="btn-gradient w-full rounded-xl px-4 py-3 font-semibold disabled:opacity-50"
      >
        {busy ? "处理中…" : "立即解锁（模拟支付）"}
      </button>
      <p className="mt-3 text-center text-xs text-slate-400">
        演示环境：点击即模拟支付成功，立即解锁完整结果。
      </p>
    </div>
  );
}

function Check() {
  return (
    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-500 text-xs text-white">
      ✓
    </span>
  );
}

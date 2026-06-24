"use client";

interface ProgressBarProps {
  current: number; // 1-based 当前步
  total: number;
}

export default function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
        <span>
          第 {current} / {total} 步
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-100/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

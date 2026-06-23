"use client";

interface ScoreCardProps {
  name: string;
  score: number; // 0-100
  level: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  physical: "身体",
  mental: "心理",
  sleep: "睡眠",
};

function barColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

export default function ScoreCard({ name, score, level }: ScoreCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-semibold text-slate-800">
          {DIMENSION_LABELS[name] ?? name}
        </span>
        <span className="text-sm text-slate-500">
          {score} · {level}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barColor(score)} transition-all`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

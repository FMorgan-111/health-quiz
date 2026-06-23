"use client";

// BMI 可视化：刻度条 + 当前值标记。区间 15–40 映射到 0–100%。
const MIN = 15;
const MAX = 40;

function pct(bmi: number): number {
  return Math.max(0, Math.min(100, ((bmi - MIN) / (MAX - MIN)) * 100));
}

function categoryColor(category: string): string {
  switch (category) {
    case "正常":
      return "text-emerald-600";
    case "偏瘦":
      return "text-sky-600";
    case "超重":
      return "text-amber-600";
    default:
      return "text-rose-600";
  }
}

export default function BmiGauge({ bmi, category }: { bmi: number; category: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-500">你的 BMI</span>
        <span className={`text-3xl font-bold ${categoryColor(category)}`}>
          {bmi}
          <span className="ml-2 text-base font-medium">{category}</span>
        </span>
      </div>
      <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full">
        {/* WHO 分区色带：偏瘦/正常/超重/肥胖 */}
        <div className="absolute inset-0 flex">
          <div className="bg-sky-300" style={{ width: `${pct(18.5)}%` }} />
          <div className="bg-emerald-300" style={{ width: `${pct(25) - pct(18.5)}%` }} />
          <div className="bg-amber-300" style={{ width: `${pct(30) - pct(25)}%` }} />
          <div className="bg-rose-300" style={{ width: `${100 - pct(30)}%` }} />
        </div>
        {/* 当前值标记 */}
        <div
          className="absolute top-0 h-3 w-1 -translate-x-1/2 rounded bg-slate-900"
          style={{ left: `${pct(bmi)}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>15</span>
        <span>18.5</span>
        <span>25</span>
        <span>30</span>
        <span>40</span>
      </div>
    </div>
  );
}

"use client";

// 付费后的「计划摘要」：全部从 projection_curve + target_date 派生，不依赖新后端字段。
// 关键指标卡 + 里程碑时间线，让解锁后的页面更有价值感。

interface Point {
  week: number;
  weightKg: number;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

export default function PlanSummary({
  points,
  targetDate,
}: {
  points: Point[];
  targetDate: string;
}) {
  const start = points[0]?.weightKg ?? 0;
  const end = points[points.length - 1]?.weightKg ?? start;
  const weeks = points[points.length - 1]?.week ?? 0;
  const totalChange = Math.round((end - start) * 10) / 10;
  const perWeek = weeks > 0 ? Math.round((Math.abs(totalChange) / weeks) * 100) / 100 : 0;
  const losing = totalChange < 0;
  const now = new Date();

  const metrics = [
    {
      label: losing ? "预计总减重" : totalChange > 0 ? "预计总增重" : "维持体重",
      value: `${Math.abs(totalChange)} kg`,
      accent: losing ? "text-emerald-600" : "text-indigo-600",
    },
    { label: "预计周期", value: `${weeks} 周`, accent: "text-slate-900" },
    { label: "每周目标", value: `${perWeek} kg`, accent: "text-slate-900" },
    { label: "起始 → 目标", value: `${start} → ${end} kg`, accent: "text-slate-900" },
  ];

  // 里程碑：25/50/75/100% 进度对应的周与体重
  const milestones = [0.25, 0.5, 0.75, 1].map((p) => {
    const idx = Math.round(p * (points.length - 1));
    const pt = points[idx] ?? points[points.length - 1];
    const date = new Date(now.getTime() + pt.week * 7 * 24 * 3600 * 1000);
    return { pct: Math.round(p * 100), week: pt.week, weight: pt.weightKg, date };
  });

  return (
    <div className="space-y-5">
      {/* 关键指标卡 */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-xl border border-slate-100 bg-white p-4 transition hover:border-indigo-200 hover:shadow-sm"
          >
            <div className="text-xs text-slate-500">{m.label}</div>
            <div className={`mt-1 text-lg font-bold ${m.accent}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* 目标日期突出展示 */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 p-5 text-white">
        <div className="text-sm opacity-90">预计达成目标日期</div>
        <div className="mt-1 text-2xl font-bold">{fmtDate(new Date(targetDate))}</div>
      </div>

      {/* 里程碑时间线 */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">阶段里程碑</h3>
        <ol className="relative space-y-4 border-l-2 border-slate-100 pl-5">
          {milestones.map((m) => (
            <li key={m.pct} className="relative">
              <span className="absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-slate-800">
                  完成 {m.pct}%
                  <span className="ml-2 text-sm font-normal text-slate-500">第 {m.week} 周</span>
                </span>
                <span className="text-sm font-semibold text-emerald-700">{m.weight} kg</span>
              </div>
              <div className="text-xs text-slate-400">{fmtDate(m.date)}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

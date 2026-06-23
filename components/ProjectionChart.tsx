"use client";

// 逐周体重预测曲线（会员）。轻量 SVG 折线，无第三方图表库。

interface Point {
  week: number;
  weightKg: number;
}

export default function ProjectionChart({ points }: { points: Point[] }) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-slate-600">
        当前体重已达目标，无需调整。
      </p>
    );
  }

  const W = 320;
  const H = 120;
  const PAD = 8;

  const weights = points.map((p) => p.weightKg);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const spanW = maxW - minW || 1;
  const maxWeek = points[points.length - 1].week || 1;

  const coords = points.map((p) => {
    const x = PAD + (p.week / maxWeek) * (W - 2 * PAD);
    const y = PAD + (1 - (p.weightKg - minW) / spanW) * (H - 2 * PAD);
    return { x, y };
  });

  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="体重预测曲线">
        <path d={path} fill="none" stroke="#4f46e5" strokeWidth="2" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="2.5" fill="#4f46e5" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>第 0 周（{points[0].weightKg} kg）</span>
        <span>
          第 {maxWeek} 周（{points[points.length - 1].weightKg} kg）
        </span>
      </div>
    </div>
  );
}

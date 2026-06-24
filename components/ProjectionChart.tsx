"use client";

// 逐周体重预测曲线（会员）。轻量 SVG，无第三方库：网格 + 面积填充 + 起止标注 + 入场动画。

interface Point {
  week: number;
  weightKg: number;
}

export default function ProjectionChart({ points }: { points: Point[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-slate-600">当前体重已达目标，无需调整。</p>;
  }

  const W = 320;
  const H = 160;
  const PAD_X = 12;
  const PAD_Y = 16;

  const weights = points.map((p) => p.weightKg);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const spanW = maxW - minW || 1;
  const maxWeek = points[points.length - 1].week || 1;

  const xy = (p: Point) => {
    const x = PAD_X + (p.week / maxWeek) * (W - 2 * PAD_X);
    const y = PAD_Y + (1 - (p.weightKg - minW) / spanW) * (H - 2 * PAD_Y);
    return { x, y };
  };

  const coords = points.map(xy);
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${H - PAD_Y} L ${coords[0].x.toFixed(1)} ${H - PAD_Y} Z`;

  const first = coords[0];
  const last = coords[coords.length - 1];

  // 横向网格（4 等分）
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => PAD_Y + t * (H - 2 * PAD_Y));

  return (
    <div className="rounded-xl border border-slate-100 bg-white/70 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="体重预测曲线">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
        </defs>

        {gridY.map((y, i) => (
          <line key={i} x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} stroke="#f1f5f9" strokeWidth="1" />
        ))}

        <path d={area} fill="url(#areaFill)" />
        <path
          d={line}
          fill="none"
          stroke="url(#lineStroke)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-[dash_1.1s_ease-out]"
          style={{ strokeDasharray: 1000, strokeDashoffset: 0 }}
        />

        {/* 起点 / 终点标记 */}
        <circle cx={first.x} cy={first.y} r="4" fill="#94a3b8" />
        <circle cx={last.x} cy={last.y} r="5" fill="#10b981" stroke="#fff" strokeWidth="2" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>起始 {points[0].weightKg} kg</span>
        <span>第 {maxWeek} 周 · 目标 {points[points.length - 1].weightKg} kg</span>
      </div>
    </div>
  );
}

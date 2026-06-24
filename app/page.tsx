import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <div className="glass-card animate-[fadeUp_0.5s_ease-out] p-8 sm:p-12">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-100/70 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          健康测评
        </div>
        <h1 className="mb-4 text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
          算出你的 BMI 与
          <br />
          <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            专属健康目标计划
          </span>
        </h1>
        <p className="mb-8 leading-relaxed text-slate-600">
          填写几项身体数据，我们会即时计算你的 BMI、每日建议摄入热量，
          并为你预测达成目标体重的时间线。无需注册，进度自动保存。
        </p>
        <Link
          href="/quiz"
          className="btn-gradient inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold"
        >
          开始 / 继续测评 →
        </Link>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Dot /> 即时 BMI
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Dot /> 热量建议
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Dot /> 目标预测
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Dot /> 进度可恢复
          </span>
        </div>
      </div>
    </main>
  );
}

function Dot() {
  return (
    <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-emerald-100 text-[10px] text-emerald-600">
      ✓
    </span>
  );
}

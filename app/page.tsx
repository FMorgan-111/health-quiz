import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <div className="mb-3 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
          健康测评
        </div>
        <h1 className="mb-4 text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
          算出你的 BMI 与
          <br />
          专属健康目标计划
        </h1>
        <p className="mb-8 text-slate-600">
          填写几项身体数据，我们会即时计算你的 BMI、每日建议摄入热量，
          并为你预测达成目标体重的时间线。无需注册，进度自动保存。
        </p>
        <Link
          href="/quiz"
          className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-700"
        >
          开始测评 →
        </Link>
        <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-slate-500">
          <span>✓ 即时 BMI</span>
          <span>✓ 热量建议</span>
          <span>✓ 目标预测</span>
          <span>✓ 进度可恢复</span>
        </div>
      </div>
    </main>
  );
}

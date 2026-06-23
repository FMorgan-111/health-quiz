import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <div className="mb-3 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
          每日健康测评
        </div>
        <h1 className="mb-4 text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
          8 步，了解你今天的
          <br />
          身体、心理与睡眠状态
        </h1>
        <p className="mb-8 text-slate-600">
          回答几个简单问题，我们会即时计算你的健康评分，给出针对性建议。
          全程不到两分钟，进度自动保存，随时可继续。
        </p>
        <Link
          href="/quiz"
          className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-700"
        >
          开始测评 →
        </Link>
        <div className="mt-8 flex items-center gap-6 text-sm text-slate-500">
          <span>✓ 即时评分</span>
          <span>✓ 进度可恢复</span>
          <span>✓ 隐私保护</span>
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-slate-400">
        已有账号？
        <Link href="/login" className="text-indigo-600 hover:underline">
          登录
        </Link>
      </p>
    </main>
  );
}

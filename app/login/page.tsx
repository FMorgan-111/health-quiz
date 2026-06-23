"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "../../lib/client/api";
import { saveSession, type AuthSession } from "../../lib/client/auth";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const path = mode === "register" ? "/auth/register" : "/auth/login";
      const session = await apiFetch<AuthSession>(path, {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      saveSession(session);
      router.push("/quiz");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? mapError(err, mode)
          : "网络错误，请稍后再试";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex rounded-xl bg-slate-100 p-1">
          {(["register", "login"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                mode === m ? "bg-white text-slate-900 shadow" : "text-slate-500"
              }`}
            >
              {m === "register" ? "注册" : "登录"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            邮箱
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="you@example.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            密码
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="至少 8 位"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "处理中…" : mode === "register" ? "注册并开始" : "登录"}
          </button>
        </form>
      </div>
    </main>
  );
}

function mapError(err: ApiError, mode: Mode): string {
  if (mode === "register" && err.code === 40900) return "该邮箱已注册，请直接登录";
  if (mode === "login" && (err.code === 40100 || err.code === 40300))
    return "邮箱或密码错误";
  if (err.code === 40001) return "邮箱格式或密码不符合要求（密码至少 8 位）";
  return err.message || "请求失败";
}

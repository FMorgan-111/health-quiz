"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../lib/client/api";

// "开始测评" 按钮：先清掉旧会话 cookie，确保每次都是全新一轮。
export default function StartButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      await apiFetch("/sessions/reset", { method: "POST" });
    } catch {
      // 重置失败不阻塞，quiz 页仍会按现有会话处理
    }
    router.push("/quiz");
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
    >
      {busy ? "准备中…" : "开始测评 →"}
    </button>
  );
}

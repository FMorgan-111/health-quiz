// httpOnly Cookie Session（TASK.md §3.3）：不注册登录，靠随机 session id 识别。
// 30 天有效。Next 16 的 cookies() 是异步的。

import { cookies } from "next/headers";

export const SESSION_COOKIE = "hq_sid";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 天

/** 读当前 cookie 里的 session id（无则 null） */
export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** 写 session id 到 httpOnly cookie */
export async function writeSessionId(sessionId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

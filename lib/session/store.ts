// Session 数据访问：按 cookie 里的 session id 取当前会话。

import { prisma } from "../db";
import { readSessionId } from "./cookie";

/** 取当前 session 行（含 subscription/result），无 cookie 或行不存在→null */
export async function getCurrentSession() {
  const id = await readSessionId();
  if (!id) return null;
  return prisma.session.findUnique({
    where: { id },
    include: { subscription: true, result: true },
  });
}

/** 当前会员状态（subscription.status === "active"） */
export function isMember(session: { subscription: { status: string } | null }): boolean {
  return session.subscription?.status === "active";
}

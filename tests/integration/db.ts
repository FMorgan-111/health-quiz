import { PrismaClient } from "@prisma/client";

// 测试专用 Prisma client：走 DIRECT_URL（5432 直连），而非运行时的 pgbouncer pooler。
// pooler 的 transaction 模式 + connection_limit=1 在并发/prepared-statement 下会冲突，
// 集成测试需要直连才能正确验证并发与事务语义。
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export const prisma = new PrismaClient({
  datasources: { db: { url } },
  log: ["error"],
});

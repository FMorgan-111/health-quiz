import { PrismaClient } from "@prisma/client";

// 集成测试专用 client：走 DIRECT_URL（直连，非 pooler），保证并发/事务语义正确。
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export const prisma = new PrismaClient({
  datasources: { db: { url } },
  log: ["error"],
});

import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// 集成测试需要数据库连接串：把 .env 注入测试进程
config();

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // 集成测试串行、单连接，避免并发跑迁移/清库互相打架
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
    },
  },
});

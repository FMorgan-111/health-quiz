import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// 集成测试需要数据库连接串：把 .env 注入测试进程
config();

// 集成套件：只跑 tests/integration/**，依赖真实 Postgres（DIRECT_URL 直连）。
// 串行 + 单连接，避免并发跑迁移/清库互相打架；网络往返慢，超时放宽到 30s。
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
    },
  },
});

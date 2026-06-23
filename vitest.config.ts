import { defineConfig } from "vitest/config";

// 默认套件：只跑纯单元测试（scoring/report），无 DB、无网络，毫秒级、可并行。
// 集成测试（tests/integration/**）走 vitest.integration.config.ts，用 `npm run test:integration`。
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
    },
  },
});

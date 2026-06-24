// 集成测试 setup：在 worker 里、任何 test 模块 import lib/db 之前执行。
// 把 DATABASE_URL 指向 DIRECT_URL（5432 直连），让经真实 route handler 的 e2e
// 也走直连，绕开 Supabase pooler（pgbouncer + connection_limit=1）对交互式
// $transaction 的不稳定。CI 里两个串本就相同，这里是 no-op。

import { config } from "dotenv";

config();

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

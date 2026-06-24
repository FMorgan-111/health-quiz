[![test](https://github.com/FMorgan-111/health-quiz/actions/workflows/test.yml/badge.svg)](https://github.com/FMorgan-111/health-quiz/actions/workflows/test.yml)

# Health Quiz — BMI 健康评估漏斗

一个分步问答式的 BMI 健康评估应用：用户依次填写性别 / 目标 / 年龄 / 身高 / 体重 / 目标体重 / 活动水平，
系统计算 **BMI**、**每日建议摄入热量**（Mifflin-St Jeor）、**目标达成日期**与**逐周体重预测曲线**。
非会员只看到基础结果，付费后解锁目标日期与预测曲线。

🔗 **在线 Demo：** https://health-quiz-six.vercel.app

---

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16（App Router）+ React 19 + TypeScript |
| 数据库 | PostgreSQL（Supabase）+ Prisma 6 |
| 校验 | Zod（分步字段 schema） |
| 测试 | Vitest（单元 + 集成）+ GitHub Actions（postgres:16 service container） |
| 部署 | Vercel |

## 核心设计

- **匿名会话**：不注册登录，靠 httpOnly cookie（`hq_sid`）里的随机 session id 识别用户；`sessions.user_id` 预留给未来登录。
- **分步增量保存**：每步只校验本步字段并写库，刷新可从 `currentStep` 恢复进度。
- **乐观锁并发控制**：`updateMany({ where: { id, version } })`，命中 0 行 → `40900` 冲突，防止并发同步互相覆盖。
- **服务端脱敏（"拿不到"而非"不显示"）**：非会员的 result 响应里 `target_date` / `projection_curve` **字段直接不存在**，而非置 null——在 API 层就被剔除。
- **纯函数计算**：`compute(input, now)` 注入 `now`，无 DB 依赖，可纯单测。

数据模型为三表：`sessions` / `results` / `subscriptions`（级联删除，UUID 主键），见 `prisma/schema.prisma`。

---

## 本地运行

```bash
npm install                      # postinstall 会自动 prisma generate
cp .env.example .env             # 填入 Supabase 连接串（见下）
npx prisma migrate deploy        # 应用迁移
npm run dev                      # http://localhost:3000
```

环境变量（`.env`）：

| 变量 | 用途 |
|---|---|
| `DATABASE_URL` | 运行时连接，Supabase transaction pooler（6543，`?pgbouncer=true&connection_limit=1`） |
| `DIRECT_URL` | 迁移用直连（5432），`prisma migrate` 需要 |

> 注意：在 Vercel 设置环境变量时**去掉引号**——Vercel 按字面存值，带引号的连接串会让 Prisma 解析失败。

---

## API

所有接口在 `/api/v1` 下，统一响应信封：

```jsonc
{ "code": 0, "message": "ok", "data": { /* ... */ } }   // 成功 code=0
{ "code": 40100, "message": "no active session", "data": null }  // 失败
```

| 错误码 | 含义 |
|---|---|
| `0` | 成功 |
| `40001` | 参数校验失败（越界 / 非法 / 跳步） |
| `40100` | 无有效会话（缺 cookie） |
| `40300` | 禁止访问 |
| `40400` | 资源不存在 |
| `40900` | 冲突（乐观锁 version 不匹配 / 会话已完成） |
| `50000` | 服务端错误 |

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/v1/sessions` | 新建会话，种 `hq_sid` cookie，返回空白 session（201） |
| `GET` | `/api/v1/sessions/current` | 取当前进度（进度恢复）；无会话 → 401 |
| `PATCH` | `/api/v1/sessions/current/step/{step}` | 提交第 `step`（1–7）步字段；body `{ version, data }`；乐观锁；越界/非法 → 400，version 冲突 → 409 |
| `POST` | `/api/v1/sessions/current/submit` | 字段齐全则计算 → 写 `results` → 标记 completed（同事务初始化 subscription）；幂等 |
| `GET` | `/api/v1/sessions/current/result` | 差异化返回结果：非会员脱敏（无 `target_date`/`projection_curve`，`locked:true`），会员完整；未完成 → 409 |
| `POST` | `/api/v1/sessions/reset` | 清除 cookie，从头重测（不删历史数据） |
| `POST` | `/api/v1/pay` | 模拟支付回调：subscription → `active`（plan `premium`）；幂等。之后 result 解锁 |

**分步字段与边界**（Zod，见 `lib/sessions/validation.ts`）：

| step | 字段 | 约束 |
|---|---|---|
| 1 | `gender` | `male` / `female` / `other` |
| 2 | `goal` | `lose_weight` / `gain_muscle` / `stay_fit` / `improve_health` |
| 3 | `age` | 整数 13–120 |
| 4 | `heightCm` | 80–250 |
| 5 | `weightKg` | 25–400 |
| 6 | `targetWeightKg` | 25–400 |
| 7 | `activityLevel` | `sedentary` / `light` / `moderate` / `active` / `very_active` |

---

## 测试

```bash
npm test                   # 单元测试（无 DB / 无网络，毫秒级、可并行）
npm run test:integration   # 集成测试（需真实 Postgres，走 DIRECT_URL）
npm run test:all           # 两者都跑
npm run typecheck          # tsc --noEmit
```

CI（`.github/workflows/test.yml`）在每次 push / PR 时拉起 `postgres:16` service container，跑
`migrate deploy → 单元 → 集成`。

### 测试覆盖矩阵

| 套件 | 文件 | 覆盖了什么 | 为什么这样测 |
|---|---|---|---|
| 健康算法单元 | `tests/compute.test.ts` | BMI/分类的 WHO 阈值边界；Mifflin-St Jeor 热量（含 `other` 取均值、目标增量）；目标日期与逐周曲线方向；**极端但合法**输入（250cm/25kg、150cm/400kg、年龄 13/120、目标体重跨度极大）下结果有限、曲线收敛 | 算法是纯函数，注入 `now`，可脱离 DB 精确断言数值；边界覆盖对应 TASK.md「极端/缺失/非法的身高体重年龄」要求 |
| 脱敏单元 | `tests/result-view.test.ts` | 非会员 result **不含** `target_date`/`projection_curve`（断言属性不存在）；会员含完整字段；`viewResult` 按会员身份切换 | 脱敏是「拿不到」而非「不显示」，必须断言受保护字段在对象里**缺席** |
| 输入校验单元 | `tests/validation.test.ts` | 每步 Zod schema 的合法边界放行 + 越界/非法/缺失/类型错误（NaN/Infinity/小数/字符串/null）拦截；enum 白名单；请求体信封 `{version,data}` | TASK.md §5.2「接口要挡住非法数值注入与越界输入，并对这些情况有测试覆盖」；不经 HTTP 直测 schema，快且穷尽边界 |
| 持久化集成 | `tests/integration/persistence.test.ts` | 分步写入 → `currentStep`/`version` 递进；进度恢复读回；乐观锁并发只有一个成功 / 过期 version 命中 0 行；计算落库；级联删除 | 这些是 DB 语义（事务/并发/外键），mock 测不出来，必须打真库 |
| 分步流程集成 | `tests/integration/step-flow.test.ts` | 经**真实 `submitStep` handler**：跳步/越界 step/字段越界 → 400；顺序推进 `currentStep`+`version` 递进；回退重提已答步（不倒退、version 自增）；重复提交幂等；过期 version → 409；并发同 version 只一个成功；无会话 401 | TASK.md §四明确要求「乱序/重复提交」的集成测试；持久化套件直打 DB 绕过了 handler 分支，这里补上经 handler 的拦截/冲突逻辑 |
| /pay 端到端集成 | `tests/integration/pay-e2e.test.ts` | 经**真实 route handler**跑「脱敏 result → POST /pay → 完整 result」：非会员脱敏 → 支付翻转 `active`+`premium` → 会员解锁；支付幂等；解锁字段等于落库值（非伪造）；无会话 401；未完成 409 | TASK.md §5.2「支付回调端到端」；mock `next/headers` 的 cookie 层指向真库 session，从而不开浏览器也能验证服务端「会员才解锁」的完整链路 |

### 没覆盖的部分及原因

- **前端组件 / 页面交互**：未写组件测试。评估的核心风险在后端的计算、并发、脱敏、支付链路，已被上面覆盖；前端是相对薄的展示层，端到端 UI 测试性价比低，靠手动冒烟 + 真实 Demo 验证。
- **真实支付网关**：`/pay` 是模拟回调（直接翻转订阅状态），不接第三方支付，故无签名校验 / 回调重放等用例。
- **登录鉴权**：本期不注册登录（匿名 cookie 会话），`users` 关联预留但未实现，故无 register/login 用例。
- **集成测试连接**：本地经 `setupFiles` 把 `DATABASE_URL` 指向 `DIRECT_URL`（5432 直连），绕开 Supabase pooler 对交互式事务的不稳定；配 `retry: 2` 兜底偶发网络抖动。CI 里两个串都指向本地 `postgres:16` container，秒级完成。

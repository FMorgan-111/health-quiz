# Health Quiz — 健康测评系统

## 项目概述

一个健康测评 funnel：用户分步填写身体数据 → 服务端计算健康报告 → 根据订阅状态差异化返回结果。后端为核心考察重点。

---

## 一、技术栈要求

| 层           | 要求                                          |
| ------------ | --------------------------------------------- |
| 前端         | Next.js (App Router) 或任意擅长框架            |
| 后端 (Core)  | Node.js (Next.js API Routes / NestJS / Express) + TypeScript |
| 数据库       | Supabase / Prisma + PostgreSQL                 |
| 测试         | Jest / Vitest / Playwright 任选                |
| 部署         | 必须提供公网可达、可完整演示的线上链接          |

> 前端不评判动效和像素级还原，但要让真实用户愿意一路填到付费弹窗——基础视觉、文案、节奏、信任感不能糊弄。

---

## 二、核心流程（后端导向）

### 第一阶段 · 测评数据流与状态恢复（Persistence）

**功能点：** 用户填写性别、目标、身体数据（年龄、身高、体重、目标体重）及运动频率。

**技术要求：**

- **分步保存接口：** 用户每完成一步，前端调用接口将增量数据同步至后端
- **进度恢复逻辑：** 用户中途关闭页面再次进入时，后端需返回该用户已填写的进度数据（可基于随机生成的 UserID 或简易 Session 识别）

### 第二阶段 · 服务端计算逻辑（Core Logic）

**功能点：** 用户提交所有数据后，触发后端逻辑处理。

**技术要求：**

- 在服务器端实现一套简单的「健康评估算法」，计算出 BMI、建议摄入量、目标预测日期
- 将计算结果持久化存储，并关联至用户记录

### 第三阶段 · 订阅鉴权与权限保护（Auth & Access）

**功能点：** 结果页展示。

**技术要求：**

- **逻辑拦截：** 结果页接口需校验用户的 `subscription_status`（模拟状态）
- **差异化返回：**
  - 非会员：API 仅返回部分脱敏数据（如隐藏具体的预测曲线数据），并提示需付费
  - 会员：API 返回完整数据
- **模拟支付回调：** 提供一个 `/pay` 接口，调用后修改数据库中的会员状态为有效

### 第四阶段 · 测试与质量保障

**功能点：** 证明上面三个阶段是对的，而不只是「我本地点了一下没问题」。

**技术要求：**

- 用自动化测试覆盖核心逻辑与关键流程，至少包含：
  - 健康评估算法的**单元测试**（含边界：极端/缺失/非法的身高、体重、年龄，目标体重不合理等）
  - 分步保存 + 进度恢复的**集成测试**（中断后恢复、乱序/重复提交、并发更新）
  - 鉴权差异化返回的测试（非会员脱敏 vs 会员完整，确保非会员拿不到被保护字段）
  - `/pay` 回调后状态变更，以及结果页返回从「脱敏」变为「完整」的**端到端验证**
- **数据验证：** 接口要能挡住非法数值注入与越界输入，并对这些情况有测试覆盖
- 提供**一键运行测试**的方式（如 `npm test`）；若能接入 CI（GitHub Actions 等）让测试自动跑起来并贴出通过状态，加分
- 在 README 里说明：覆盖了哪些场景、为什么是这些、哪些暂时没覆盖以及原因

---

## 三、API 设计规范

### 3.1 路径与版本控制

所有 API 挂载在 `/api/v1/` 前缀下，RESTful 风格，资源名用复数名词。

| 方法   | 路径                                      | 说明                 |
| ------ | ----------------------------------------- | -------------------- |
| POST   | `/api/v1/sessions`                        | 创建新的测评会话     |
| GET    | `/api/v1/sessions/current`                | 获取当前会话状态与进度 |
| PATCH  | `/api/v1/sessions/current/step/{step}`    | 提交某一步的答案     |
| POST   | `/api/v1/sessions/current/submit`         | 提交全部数据，触发计算 |
| GET    | `/api/v1/sessions/current/result`         | 获取测评结果（差异化） |
| POST   | `/api/v1/pay`                             | 模拟支付回调         |

### 3.2 统一响应信封

```json
{
  "code": 0,
  "message": "ok",
  "data": { }
}
```

错误码规范：

| code  | 语义               |
| ----- | ------------------ |
| 0     | 成功               |
| 40001 | 参数校验失败       |
| 40100 | 未找到会话         |
| 40300 | 无权限 / 订阅不足  |
| 40400 | 资源不存在         |
| 40900 | 状态冲突（版本冲突等） |
| 50000 | 服务器内部错误     |

### 3.3 鉴权

- 不要求用户注册登录，基于 Cookie 中的随机 Session ID 识别
- Session ID 由服务端在首次访问时生成，`httpOnly` cookie，30 天有效期

---

## 四、数据库建模

### 4.1 核心表结构

**sessions（测评会话）**

| 列               | 类型         | 说明                            |
| ---------------- | ------------ | ------------------------------- |
| id               | uuid (PK)    |                                 |
| gender           | enum?        | male / female / other           |
| goal             | enum?        | lose_weight / gain_muscle / stay_fit / improve_health |
| age              | int?         |                                 |
| height_cm        | float?       |                                 |
| weight_kg        | float?       |                                 |
| target_weight_kg | float?       |                                 |
| activity_level   | enum?        | sedentary / light / moderate / active / very_active |
| current_step     | int          | 已完成到第几步，默认 0           |
| completed        | boolean      | 默认 false                      |
| version          | int          | 乐观锁版本号，默认 0             |
| created_at       | timestamptz  |                                 |
| updated_at       | timestamptz  |                                 |

**results（计算结果）**

| 列               | 类型         | 说明                            |
| ---------------- | ------------ | ------------------------------- |
| id               | uuid (PK)    |                                 |
| session_id       | uuid (FK)    | unique, 1:1                     |
| bmi              | float        |                                 |
| bmi_category     | varchar      |                                 |
| daily_calories   | int          | 建议每日摄入                    |
| target_date      | timestamptz  | 预测达成目标日期（受保护字段）   |
| projection_curve | json         | 逐周预测曲线（受保护字段）       |
| computed_at      | timestamptz  |                                 |

**subscriptions（订阅状态）**

| 列         | 类型         | 说明                            |
| ---------- | ------------ | ------------------------------- |
| id         | uuid (PK)    |                                 |
| session_id | uuid (FK)    | unique                          |
| status     | enum         | none / active                   |
| plan       | varchar?     |                                 |
| paid_at    | timestamptz? |                                 |
| updated_at | timestamptz  |                                 |

### 4.2 设计要点

- UUID 主键，避免自增暴露业务量
- 所有录入字段 nullable——分步增量保存，未填即为 null
- `version` 乐观锁防并发/乱序提交
- results 和 subscriptions 通过 session_id 1:1 关联
- 计算结果中的 `target_date` 和 `projection_curve` 为会员专属字段

---

## 五、当前实现状态

### 5.1 已实现（本地 `/mnt/e/hermes-work/health-quiz/`）

| 维度       | 状态                                                         |
| ---------- | ------------------------------------------------------------ |
| 路由       | App Router，`/api/session`、`/api/quiz/[step]`、`/api/quiz/submit`、`/api/result`、`/api/pay` |
| 数据库     | Prisma 6 + Supabase Postgres，已连接真实数据库               |
| 持久化     | 分步增量保存 + 进度恢复（`currentStep`）                      |
| 并发控制   | 乐观锁（`version` 字段 + `updateMany` where version 匹配）    |
| 校验       | Zod 分步 schema，enum 白名单，数值边界（age 13-120, height 80-250cm, weight 25-400kg），目标体重合理性 refine |
| 计算       | 纯函数 `computeAssessment(input, now)`，注入 `now` 保持可测性（Mifflin-St Jeor + WHO BMI + 渐进曲线） |
| 差异化返回 | `toFullResult` vs `toPublicResult`，非会员 response 不含 `targetDate`/`projectionCurve` 字段（不是 null，是不存在） |
| 支付回调   | `/api/pay` upsert subscription，幂等                          |
| 事务       | submit 时：写 result + 标记 completed + 初始化 subscription 包在一个 `$transaction` 里 |
| 幂等       | submit 已计算过的 session 直接返回已有结果，不重算             |
| 测试       | **未写** — vitest 在 package.json 但无测试文件                |

### 5.2 待对齐（对照第三、四节规范）

- [ ] API 路径调整为 `/api/v1/...` 前缀 + 统一响应信封 `{code, message, data}`
- [ ] 写测试：单元测试（健康算法）+ 集成测试（分步保存/进度恢复/并发）+ 鉴权差异化 + 支付回调端到端
- [ ] `npm test` 一键运行 + GitHub Actions CI
- [ ] README 说明测试覆盖范围
- [ ] 公网部署

---

## 六、Codex 远程版 vs 本地版对比

| 维度       | Codex 已做（远程）                                           | 本地版（`/mnt/e/hermes-work/health-quiz/`）               |
| ---------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| 路由风格   | Pages Router                                                 | **App Router** ✅ 更现代                                  |
| API 路径   | `/api/v1/assessments/...`，复数资源名，统一信封              | `/api/session`、`/api/quiz/[step]`，扁平结构              |
| 数据库     | Neon（serverless Postgres）                                   | **Supabase** Postgres                                     |
| ORM        | Prisma 7 + Neon adapter                                      | Prisma 6                                                  |
| 持久化     | in-memory（还没接真 DB）                                     | **Prisma + Postgres 真连接** ✅                            |
| 并发控制   | 未提及                                                       | **乐观锁 version 字段** ✅                                |
| 校验       | 未提及                                                       | **Zod + enum 白名单 + 数值边界 + 目标体重合理性** ✅      |
| 计算逻辑   | 未提及                                                       | **纯函数 + 依赖注入 now 参数** ✅                          |
| 差异化返回 | 未提及                                                       | **toFullResult / toPublicResult 字段级脱敏** ✅           |
| 幂等       | 未提及                                                       | **已计算 session 直接返回已有结果** ✅                     |
| 事务       | 未提及                                                       | **$transaction 三条写操作原子** ✅                         |
| 测试       | Vitest + Playwright                                          | **未写测试** ❌                                           |

**总结：**

- 本地版工程成熟度更高（真 DB、乐观锁、脱敏、事务、幂等），但 API 路径偏离 RESTful 规范且零测试
- Codex 版 API 设计更规范（版本前缀 + 统一信封 + 复数资源名），但没接真数据库
- **合并方向：** 本地版骨架（App Router + 乐观锁 + 脱敏 + 纯函数计算） + Codex 版 API 规范（`/api/v1/` + 统一信封）+ 补齐测试

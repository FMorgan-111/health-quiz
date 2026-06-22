# Health Quiz — 健康测评系统后端架构任务书

## 项目概述

设计并开发一个健康测评系统的核心后端，支持用户通过多步骤问卷完成健康评估，并根据订阅等级返回差异化报告。后端需具备专业级的 API 设计、稳定的数据建模、可靠的状态持久化，以及完整的测试覆盖。

---

## 一、API 设计规范

### 1.1 路径与版本控制

所有 API 挂载在 `/api/v1/` 前缀下，RESTful 风格，资源名用复数名词。

| 方法   | 路径                                      | 说明                 |
| ------ | ----------------------------------------- | -------------------- |
| POST   | `/api/v1/assessments`                     | 创建新的测评会话     |
| GET    | `/api/v1/assessments/{assessment_id}`     | 获取测评状态与进度   |
| PATCH  | `/api/v1/assessments/{assessment_id}`     | 提交某一步的答案     |
| GET    | `/api/v1/assessments/{assessment_id}/report` | 获取最终测评报告   |
| GET    | `/api/v1/questionnaires/{questionnaire_id}`  | 获取问卷结构与题目 |
| POST   | `/api/v1/subscriptions`                   | 创建订阅（支付回调） |
| GET    | `/api/v1/subscriptions/me`                | 查询当前用户订阅状态 |
| GET    | `/api/v1/users/me`                        | 当前用户信息         |

### 1.2 请求/响应结构

**统一响应信封：**

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
| 40100 | 未登录             |
| 40300 | 无权限 / 订阅不足  |
| 40400 | 资源不存在         |
| 40900 | 状态冲突（重复提交等） |
| 50000 | 服务器内部错误     |

**分步提交答案请求体：**

```json
{
  "step": 3,
  "answers": [
    {"question_id": "q17", "value": 4},
    {"question_id": "q18", "value": 2}
  ]
}
```

**测评报告响应体（订阅差异化）：**

```json
{
  "assessment_id": "asst_abc123",
  "status": "completed",
  "subscription_tier": "premium",
  "report": {
    "summary": "您的健康状况良好...",
    "dimensions": [
      {"name": "身体活动", "score": 78, "level": "良好"},
      {"name": "心理健康", "score": 62, "level": "一般"}
    ],
    "recommendations": ["每周至少150分钟中强度运动"],
    "premium_extra": {
      "trend_analysis": "...",
      "peer_comparison": "..."
    }
  }
}
```

> 免费用户 `report.premium_extra` 返回 `null`，推荐列表截断为前 2 条。

### 1.3 鉴权

使用 JWT Bearer Token。Header: `Authorization: Bearer <token>`

- Token 有效期: access_token 2h, refresh_token 7d
- `/api/v1/auth/login` 和 `/api/v1/auth/register` 为公开端点
- 订阅状态通过 `request.state.user.subscription_tier` 注入

---

## 二、数据库建模

### 2.1 ER 概要

```
users 1──N assessments
users 1──1 subscriptions
questionnaires 1──N questions
questions 1──N options
assessments 1──N assessment_answers
assessments N──1 questionnaires
```

### 2.2 核心表结构

**users**

| 列               | 类型         | 说明                    |
| ---------------- | ------------ | ----------------------- |
| id               | uuid (PK)    |                         |
| email            | varchar(255) | unique, not null        |
| password_hash    | varchar(255) | not null                |
| subscription_tier| varchar(20)  | free / premium / pro    |
| created_at       | timestamptz  |                         |

**questionnaires（问卷模板）**

| 列          | 类型        | 说明                     |
| ----------- | ----------- | ------------------------ |
| id          | uuid (PK)   |                          |
| title       | varchar(200)| not null                 |
| description | text        |                          |
| steps_count | int         | 总步数                   |
| is_published| boolean     | default false            |
| version     | int         | 支持问卷版本化管理       |
| created_at  | timestamptz |                          |

**questions（题目）**

| 列              | 类型        | 说明                       |
| --------------- | ----------- | -------------------------- |
| id              | uuid (PK)   |                            |
| questionnaire_id| uuid (FK)   |                            |
| step            | int         | 所属步骤（第几步）         |
| sort_order      | int         | 步骤内排序                 |
| question_type   | varchar(20) | likert_5 / single_choice / multi_choice / text |
| content         | text        | 题目文本                   |
| dimension       | varchar(50) | 所属健康维度（身体/心理/睡眠等）|
| required        | boolean     | default true               |

**options（选项）**

| 列          | 类型        | 说明         |
| ----------- | ----------- | ------------ |
| id          | uuid (PK)   |              |
| question_id | uuid (FK)   |              |
| label       | varchar(100)| 选项文本     |
| value       | int         | 选项分值     |
| sort_order  | int         |              |

**assessments（测评会话）**

| 列               | 类型        | 说明                   |
| ---------------- | ----------- | ---------------------- |
| id               | uuid (PK)   |                        |
| user_id          | uuid (FK)   |                        |
| questionnaire_id | uuid (FK)   | 快照问卷 ID            |
| current_step     | int         | 当前进行到第几步(0=未开始) |
| status           | varchar(20) | draft / in_progress / completed / abandoned |
| started_at       | timestamptz |                        |
| completed_at     | timestamptz |                        |
| report_generated | boolean     | default false          |

**assessment_answers（答案记录）**

| 列            | 类型        | 说明         |
| ------------- | ----------- | ------------ |
| id            | uuid (PK)   |              |
| assessment_id | uuid (FK)   |              |
| question_id   | uuid (FK)   |              |
| step          | int         | 冗余字段加速按步骤查询 |
| value         | varchar(500)| 答案值(文本或选项值) |
| created_at    | timestamptz |              |
| updated_at    | timestamptz | upsert 语义  |

**subscriptions**

| 列           | 类型        | 说明                          |
| ------------ | ----------- | ----------------------------- |
| id           | uuid (PK)   |                               |
| user_id      | uuid (FK)   | unique                        |
| tier         | varchar(20) | free / premium / pro          |
| status       | varchar(20) | active / expired / cancelled  |
| started_at   | timestamptz |                               |
| expires_at   | timestamptz | null = 永久                   |
| payment_ref  | varchar(100)| 支付网关回传的交易 ID         |

### 2.3 设计原则

- **UUID 主键**：避免自增 ID 暴露业务规模，支持分布式扩展
- **冗余 `step` 字段**：`assessment_answers.step` 冗余自 `questions.step`，避免每次按步骤查询时 JOIN
- **问卷快照**：`assessments.questionnaire_id` 记录的是创建时的问卷版本。问卷更新后（`questionnaires.version++`），新测评用新版，进行中的测评不受影响
- **`assessment_answers` upsert**：同一 `(assessment_id, question_id)` 重复提交时覆盖而非报错，保证幂等
- **索引规划**：`(assessment_id, step)` 联合索引加速进度查询；`user_id` 单列索引加速"我的测评列表"；`subscriptions.user_id` unique 约束保证一人一订阅

---

## 三、数据持久化逻辑

### 3.1 分步保存（Step-by-Step）

测评采用分步提交而非整卷提交：

1. 客户端调用 `POST /assessments` 创建会话 → 状态 `draft`, `current_step=0`
2. 客户端调用 `GET /questionnaires/{id}` 获取完整问卷结构（含题目和选项）
3. 用户每完成一步，客户端调用 `PATCH /assessments/{id}` 提交该步答案
4. 服务端验证：该步所有必答题已回答 → 写入 `assessment_answers` → 更新 `current_step`
5. 最后一步提交后 → 状态变为 `completed` → 可请求报告

### 3.2 进度恢复（Progress Recovery）

```
GET /api/v1/assessments/{assessment_id}

Response:
{
  "status": "in_progress",
  "current_step": 3,
  "total_steps": 8,
  "answers_submitted": 15
}
```

客户端据此跳转到第 3 步继续答题。未完成的测评会话在列表中显示"继续测评"入口。

### 3.3 状态一致性保证

| 场景               | 策略                                         |
| ------------------ | -------------------------------------------- |
| 重复提交同一题     | upsert，幂等                                 |
| 跳过步骤提交       | 拒绝：当前步 != assessment.current_step + 1  |
| 并发的两次提交     | 数据库行锁（SELECT FOR UPDATE）或乐观锁      |
| 测评中途问卷被修改 | 不影响，assessment 持有时点快照              |
| 用户重复创建测评   | 允许，每次创建独立会话                       |
| 报告被重复请求     | 幂等返回，首次生成后缓存（或标记 report_generated）|

### 3.4 状态机

```
draft → in_progress → completed → report_generated
  ↓                       ↓
abandoned            (任意时刻可 abandoned)
```

- `draft`：已创建但未提交任何答案
- `in_progress`：至少提交了一步答案
- `completed`：所有步骤已完成
- `report_generated`：测评报告已生成（异步任务完成后的终态）
- `abandoned`：用户主动放弃或超时（72h 未活动自动标记）

---

## 四、模拟订阅体系

### 4.1 三级订阅

| Tier   | 报告内容                       | 月费  |
| ------ | ------------------------------ | ----- |
| free   | 基础评分 + 2 条建议             | 0     |
| premium| 全维度分析 + 完整建议 + 趋势   | ¥29   |
| pro    | premium 全部 + 同类人群对比 + 导出 PDF | ¥59 |

### 4.2 差异化返回

同一报告 API 根据 `user.subscription_tier` 裁剪返回内容：

```python
def build_report(assessment, user):
    base = _build_base_report(assessment)
    if user.subscription_tier == "free":
        base["recommendations"] = base["recommendations"][:2]
        base["premium_extra"] = None
    elif user.subscription_tier == "premium":
        base["premium_extra"] = {"trend_analysis": _build_trend(assessment)}
    elif user.subscription_tier == "pro":
        base["premium_extra"] = {
            "trend_analysis": _build_trend(assessment),
            "peer_comparison": _build_peer_compare(assessment),
            "pdf_url": _generate_pdf(assessment)
        }
    return base
```

### 4.3 支付回调闭环

模拟支付流程（不接入真实支付网关，使用内部模拟）：

```
POST /api/v1/subscriptions
Body: { "tier": "premium", "payment_method": "mock" }

→ 服务端创建 subscription，状态 pending
→ 模拟支付处理（500ms 延迟后自动确认）
→ Webhook 回调 POST /api/v1/subscriptions/callback
   Body: { "payment_ref": "pay_xxx", "status": "success" }
→ subscription.status 更新为 active
→ user.subscription_tier 同步更新
→ 返回 200 给支付网关
```

关键设计：
- 回调接口无需鉴权，但需验签（HMAC-SHA256）
- 回调失败时重试 3 次，间隔 5s/30s/300s
- `subscriptions.status` 和 `users.subscription_tier` 在同一事务中更新
- 到期自动降级：定时任务扫 `expires_at < now()` 且 `status=active` 的记录，降为 free

---

## 五、测试与质量保障

### 5.1 测试分层

| 层级     | 覆盖范围                   | 工具       | 占比目标 |
| -------- | -------------------------- | ---------- | -------- |
| 单元测试 | 评分算法、报告生成逻辑、状态机 | pytest     | 90%+     |
| 集成测试 | API 端点 + 数据库          | pytest + httpx + test DB | 80%+ |
| 端到端   | 完整用户旅程               | pytest     | 关键路径 |

### 5.2 必测核心场景

**正常路径：**
- 注册 → 登录 → 创建测评 → 分步提交 → 完成 → 获取报告
- 免费用户报告不包含 premium_extra 字段
- 升级订阅后报告内容变化

**状态与进度：**
- 中途退出后重新进入，从 `current_step` 恢复
- 重复提交同一步不产生重复答案（幂等）

**边界与异常：**
- 未登录访问受保护端点 → 401
- 免费用户请求 premium 内容 → 403
- 提交不存在的测评 ID → 404
- 跳过步骤提交（从 step 1 直接跳到 step 3）→ 400
- 必答题未答 → 422
- 问卷不存在或未发布 → 404
- 并发提交同一步的答案 → 幂等，数据一致
- 支付回调签名不匹配 → 403
- 支付回调重复通知 → 幂等
- 测评超时自动标记为 abandoned

**订阅闭环：**
- 新用户默认 free 等级
- 模拟支付 → 订阅激活 → 用户等级变更
- 订阅到期 → 自动降级
- 重复订阅 → 旧订阅失效，新订阅生效

### 5.3 测试基础设施要求

- 测试数据库独立于开发/生产库（Docker PostgreSQL 或 SQLite :memory:）
- 每个测试用例自动清理数据（fixture teardown）
- CI 中测试在每次 push 时自动运行
- 覆盖率报告生成（pytest-cov），核心模块 > 90%

---

## 六、技术栈建议

| 层       | 选型                    |
| -------- | ----------------------- |
| 语言     | Python 3.11+            |
| 框架     | FastAPI                 |
| ORM      | SQLAlchemy 2.0 (async)  |
| 数据库   | PostgreSQL 15+          |
| 迁移     | Alembic                 |
| 鉴权     | python-jose (JWT)       |
| 测试     | pytest + pytest-asyncio + httpx |
| 异步任务 | Celery / ARQ (报告生成) |
| CI       | GitHub Actions          |

---

## 七、交付标准

- [ ] 所有 API 端点可运行，响应符合统一信封格式
- [ ] 数据库 migration 脚本完整，可一键建表
- [ ] 分步提交 → 进度恢复 → 报告生成 完整闭环可演示
- [ ] 三级订阅差异化返回正确
- [ ] 模拟支付回调闭环可用
- [ ] 核心场景测试全部通过，边界异常测试覆盖
- [ ] README 含本地运行步骤和 API 文档链接（Swagger `/docs`）

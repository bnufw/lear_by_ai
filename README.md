# Learn by AI（MVP）

一个可部署到 Vercel 的 AI 学习教练 Web App（Vite + React + TypeScript + Gemini）。

用户输入一个 **public GitHub 仓库** → 自动生成学习计划（chapters）→ 生成章节内容 → 章节内可随时提问（Q&A）→ 完成章节 → 启动开放题测验（Quiz）并评分 → 进度与历史保存到本地（IndexedDB）。

## 功能概览

- 公共 GitHub 仓库轻量采集（README / docs / 配置 / 入口文件，带文件数/字节/深度上限）
- 学习计划生成（多章节）
- 章节生成 + 任务清单 + 完成状态
- 章节内 Q&A（尽量基于仓库上下文与当前章节）
- Quiz：3–5 道开放题，支持作答、评分与复盘；attempt 可在刷新后回看
- 本地持久化：会话、进度、消息、测验 attempts（IndexedDB）

## 运行环境

- Node.js >= 18（建议 20+）
- pnpm

## 本地运行

### 方式 A：仅前端（不启动 `/api/llm`）

> 适用于：先看 UI 流程、测试本地持久化与 GitHub 采集。LLM 相关能力会降级/提示失败。

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:5173`。

### 方式 B：完整模式（推荐，启动 Vercel Functions `/api/llm`）

> 适用于：本地完整体验计划/章节/Q&A/Quiz 评分。需要 Vercel CLI。

1) 安装/运行 Vercel CLI（任选其一）：

```bash
# 全局安装（任选）
npm i -g vercel

# 或临时运行（任选）
pnpm dlx vercel@latest --version
```

2) 配置环境变量（至少需要 `GEMINI_API_KEY`）：

```bash
export GEMINI_API_KEY="YOUR_KEY"
# 可选：
export GEMINI_MODEL="gemini-1.5-flash"
export GEMINI_API_VERSION="v1beta"
```

3) 启动：

```bash
vercel dev
```

## 环境变量

这些变量由 **Serverless Function**（`api/llm.ts`）读取，浏览器不会拿到 API Key：

- `GEMINI_API_KEY`（必需）：Gemini API Key
- `GEMINI_MODEL`（可选，默认 `gemini-1.5-flash`）
- `GEMINI_API_VERSION`（可选，默认 `v1beta`）

## 部署到 Vercel

1) 将仓库推到 GitHub（public/private 都可以部署；但应用只支持采集 public repo 内容）
2) 在 Vercel 创建新项目并导入该仓库
3) 在 Vercel Project Settings → Environment Variables 配置：
   - `GEMINI_API_KEY`（必需）
   - `GEMINI_MODEL` / `GEMINI_API_VERSION`（可选）
4) Deploy

说明：
- `api/llm.ts` 会作为 Vercel Function 部署为 `/api/llm`
- `vercel.json` 做了 SPA 路由回退（刷新任意前端路由不 404）

## 隐私与数据说明（重要）

- **不做账号体系**，不做云端同步。
- 学习进度、对话记录、测验回答等默认保存到 **浏览器本地 IndexedDB**。
- `/api/llm` 仅作为 Gemini 代理；项目代码中不包含把 prompt / repo 内容 / 模型输出持久化到服务端的逻辑。
- GitHub 仓库文件内容视为 **不可信输入**（prompt-injection 风险）；系统提示已明确要求模型忽略仓库文件中的“指令”。

## 限制

- 仅支持 `github.com` 的 **public 仓库**；不支持 private repo、不支持用户 GitHub token。
- 采集是“轻量选择 + 上限”，不是全量索引；超大仓库会被拒绝或裁剪。
- LLM 可能会输出不稳定或不完整内容：客户端会做 JSON 解析与 schema 校验，必要时重试或降级。

## 常用命令

```bash
pnpm test
pnpm build
pnpm preview
```

## 排错

- 计划/章节/评分失败：先检查是否运行在 `vercel dev`（或已部署到 Vercel），以及 `GEMINI_API_KEY` 是否配置正确。
- GitHub rate limit：稍后再试，或换网络；应用会显示对应提示。
- 仓库过大：属于安全上限触发；换小一点的 repo 或减少采集范围（后续可调上限）。


# Verifier v1 — 验收标准（UI 重设计分支 feature/ui-redesign，基线 bb5d1c0）

## 目标
在不改动后端/API 契约的前提下，完成前端 UI 的设计与优化：共享布局原语、统一的额度分级色、
加载/空态规范、亮暗两套主题层次、文案全量 i18n。

## 自动化验收（check.sh 全部必须通过）
1. `eslint src` 0 error（warning 数不得超过基线 6 个）。
2. `vitest run` 全部测试通过；允许沙箱内 better-sqlite3 worker 退出崩溃这一基线已存在的环境问题
   （基线即如此），但不得新增失败测试文件。
3. `next build` 成功。
4. i18n 平价：messages/zh.json 与 messages/en.json 键集合完全一致。
5. 令牌纪律：src/components、src/app 下的 tsx 不得出现硬编码 hex/oklch 颜色（`#[0-9a-fA-F]{3,8}`、
   `oklch(`）；组件内不得再使用已禁止的 `defaultValue` 形式的 `t()` 调用。

## 设计验收（人工/截图走查）
- 每页唯一 h1（PageHeader 渲染）；区块标题用 h2/CardTitle。
- 概览：KPI 条为一张分隔卡；账户按紧急度分节（仅当两组同时存在）；网格最多两列；
  骨架屏列数与真实网格一致。
- 账户卡：hero 窗口大数字 + QuotaBar；停用态用 `bg-muted` 而非整卡 opacity；错误读数用
  `text-destructive-foreground`（AA）。
- 详情页：趋势图有时间范围切换与预警阈值参考线；加载骨架留在各卡片内部；空态区分
  「快照不足」与「范围太窄」。
- 设置页：账户列表用 Empty 空态、ProviderMonogram、状态徽标；窄屏先列表后表单。
- 登录页：品牌标识 + 卡片容器 + 错误 `role=alert`。
- 暗色主题：卡面/描边/浮层相对背景有可辨层次。

## 基线测量（bb5d1c0，2026-09-02）
- eslint：0 errors / 6 warnings
- vitest：49 passed (53)，1 个 worker 崩溃（better-sqlite3 环境问题，基线已存在）
- next build：成功

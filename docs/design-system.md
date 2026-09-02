# Design System (offline reference)

本文件是离线设计规范。完整组件文档清单见 `docs/coss-ui-llms.txt`（抓取自 https://coss.com/ui/llms.txt）。

## 核心原则：cal.com 视觉

- 白底灰阶基调，黑色主 CTA（`bg-primary text-primary-foreground`，neutral-800/50）。
- 克制圆角：coss 令牌 `--radius: 0.625rem`，组件用 `rounded-lg/md/sm`，不要自造大圆角。
- 间距节奏 8/12/16（Tailwind `gap-2/3/4`、`p-4/6`），留白优先于边框分隔。
- 标题字体 Cal Sans（`font-heading`，600），正文 Inter（`font-sans`）。
- 暗色经 `.dark` 类切换（next-themes `attribute="class"`），令牌自动反转，不要写死颜色。

## 组件来源

- 全部 UI 原语已一次性 vendored 在 `src/components/ui/`（54 个，来自 @coss registry，MIT）。
- 依赖已锁定：`@base-ui/react`、`class-variance-authority`、`clsx`、`tailwind-merge`、`lucide-react`。
- 此后离线维护：不安装 `@coss/ui` npm 包（npm 上不存在），不再拉取 registry（除非用户明确要求补原语）。

## 主题机制

- `src/app/globals.css` 内 `@theme inline` 把 CSS 变量映射为 Tailwind v4 颜色/字体/圆角工具类。
- 语义色只用令牌：`background/foreground/card/muted/primary/secondary/accent/destructive/border/input/ring` + `success/warning/info`。
- 图表色 `chart-1..5`。禁止在组件里写死 hex/oklch；新颜色进 `:root`/`.dark` 变量。

## 常用组件速查

| 用途 | 组件 |
|---|---|
| 卡片 | `Card`/`CardHeader`/`CardContent` |
| 按钮 | `Button`（variant: default/outline/ghost/destructive/secondary） |
| 标签 | `Badge`（variant: default/secondary/destructive/outline/success 等） |
| 进度 | `Progress`（value 0-100） |
| 弹窗确认 | `Dialog` / `AlertDialog` |
| 页签 | `Tabs` |
| 表单 | `Field`/`Label`/`Input`/`Textarea`/`Select`/`Switch` |
| 表格 | `Table` 系列 |
| 空态 | `Empty` |
| 轻提示 | `Toast` |

## 页面级复合组件（src/components/，本项目自建）

| 组件 | 职责 | 要点 |
|---|---|---|
| `PageHeader` | 页面唯一 h1：title/description/eyebrow/icon/actions | 每页一个；标题用 `font-heading` |
| `ProviderMonogram` | 提供商首字母徽标（sm/md/lg） | 列表、卡片头、详情页头统一使用 |
| `QuotaBar` + `quotaTextClassName` | 额度进度条与读数颜色分级 | 分级见下方「配额分级」 |
| `StatStrip`/`StatStripItem`/`StatTile` | KPI 分隔线条 / 卡内小统计 | 概览 KPI、详情窗口格 |
| `AccountStatusBadges` | 账户状态徽标 | 只出 error/warn/disabled，正常态不出标 |
| `SparkStrip` | 7 日柱条（`spark-strip.ts` 的 `sparkSlots`） | 固定 7 槽、最右今天、缺测为空槽；按日最紧值着色 |
| `ChartTooltipContent` | Recharts 共享 tooltip | 趋势图与用量柱图共用 |
| `SegmentedToggle` | 互斥分段切换 | 趋势范围 24h/7d/all 等 |
| `TrendChart` | 历史趋势折线 | 渲染期不调 `Date.now()`（数据经 `buildTrendSeries` 预加工）；warnPct 虚线；区分「快照不足」与「范围太窄」两种空态；`isAnimationActive={false}`（保证 SSR/截图/低端机稳定） |
| `EditAccountDialog` | 编辑账户弹窗 | Field/FieldLabel 组合 |

## 配额分级（quotaTone）

剩余百分比 `pct` 相对告警阈值 `warnPct` 分三档：`critical`（pct < warnPct）→ `text-destructive-foreground`；`warning`（pct < min(2×warnPct, 50)）→ `text-warning-foreground`；其余 `normal`。概览卡、详情窗口格、spark-strip、KPI 共用同一函数 `src/lib/format.ts#quotaTone`，不要在调用点各写阈值逻辑。

## 状态与可访问性纪律

- 每个客户端 fetch 区块必须有显式加载态（`Skeleton`，`data-slot="skeleton"`），初始空数组不得直接渲染 `Empty`——否则首屏闪「空态」。
- 读数用 `*-foreground` 令牌（如 `text-destructive-foreground` 而非 `text-destructive`），保证 WCAG AA 对比度；不在语义色上叠不透明度；禁用态容器用 `bg-muted` 而非整体 opacity。
- i18n：`t()` 不得传 `defaultValue`；动态键（自定义 window/unit 名）用 `t.has()` 兜底（见 `windowName`/`unitName`）。
- 时间显示：列表用 `relativeTimeText`（本地化相对时间），精确时间用 `localDateTime`（到分钟，不带秒）。
- 图表色相固定顺序 `chart-1..5` = 中性→sky→teal→amber→rose，明暗主题只调明度（浅：neutral-700/sky-600/teal-600/amber-500/rose-500；深：neutral-300/sky-400/teal-400/amber-400/rose-400）。

## 适配器新增流程（后端约定）

1. 新建 `src/server/adapters/<id>.ts`，实现 `Adapter` 接口（`src/server/adapters/types.ts`）。
2. 在 `src/server/adapters/registry.ts` 的 `BUILTIN_ADAPTERS` 数组追加（顺序即 sortOrder）。
3. `src/server/bootstrap.ts` 启动幂等 upsert 自动落 providers 行，无需手写 SQL。
4. 若为通用 REST JSON 端点，优先让用户走 declarative spec（`src/server/adapters/declarative.ts`），不写代码。

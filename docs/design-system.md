# Design System (offline reference)

本文件是离线设计规范。完整组件文档清单见 `docs/coss-ui-llms.txt`（抓取自 https://coss.com/ui/llms.txt）。

## 核心原则：cal.com 视觉

- 白底灰阶基调，黑色主 CTA（`bg-primary text-primary-foreground`，neutral-800/50）。
- 克制圆角：coss 令牌 `--radius: 0.625rem`，组件用 `rounded-lg/md/sm`，不要自造大圆角。
- 间距节奏 8/12/16（Tailwind `gap-2/3/4`、`p-4/6`），留白优先于边框分隔。
- 标题字体 Cal Sans（`font-heading`，600），正文 Inter（`font-sans`）。
- 暗色经 `.dark` 类切换（next-themes `attribute="class"`），令牌自动反转，不要写死颜色。
- 面板画布用 `bg-muted/40`，卡片落在上面才有层次；顶栏和页脚仍用 `bg-background`。

## 组件来源

- 全部 UI 原语已一次性 vendored 在 `src/components/ui/`（54 个，来自 @coss registry，MIT）。
- 依赖已锁定：`@base-ui/react`、`class-variance-authority`、`clsx`、`tailwind-merge`、`lucide-react`。
- 此后离线维护：不安装 `@coss/ui` npm 包（npm 上不存在），不再拉取 registry（除非用户明确要求补原语）。

## 主题机制

- `src/app/globals.css` 内 `@theme inline` 把 CSS 变量映射为 Tailwind v4 颜色/字体/圆角工具类。
- 语义色只用令牌：`background/foreground/card/muted/primary/secondary/accent/destructive/border/input/ring` + `success/warning/info`。
- 图表色 `chart-1..5`。禁止在组件里写死 hex/oklch；新颜色进 `:root`/`.dark` 变量。
- `chart-1..5` 的色相顺序在两套主题里必须一致（中性 → sky → teal → amber → rose），只允许按主题调明度：
  同一条系列切换主题时不应该换颜色。首位刻意留中性色，饱和色让给状态语义。
- 暗色下 `--card`/`--popover`/`--border` 相对 coss 默认值各抬了一档（94%/90%/10%），
  否则卡面与背景同色、浮层压不住卡片。改这三个值前先在暗色下看一眼层次。

## 对比度（WCAG AA）

正文与读数按 4.5:1 验收，只有 ≥24px、或 ≥18.66px 且字重 ≥700 才算大字（3:1）。
注意 `font-semibold` 是 600：`text-xl font-semibold` 的 KPI 数字仍按小字算。

- **填充色和文字色是两套令牌。** `--destructive`/`--warning`/`--success` 是给进度条、
  徽标底色、图标用的饱和色；文字取 `*-foreground` 那一支。`--destructive` 是 red-500，
  浅色主题下对白底只有 3.8:1，直接拿来写数字过不了 AA。
- **不要在语义色上再叠不透明度。** `text-muted-foreground/72` 这类写法把 5.6:1 打到 2.9:1；
  次级文字已经是次级色了，需要更弱的层次就换令牌，不是打折。
- **容器级 `opacity-*` 会连带压低文字。** 停用/失效态别整块调透明度——卡里的
  `text-muted-foreground` 本来贴着 AA 线，乘 0.72 就掉下去了。改用 `bg-muted` 之类的
  表面差异，语义交给徽标（`AccountStatusBadges`）说明。
- **悬停态要真的换色。** 未选中项停在 `muted-foreground` 时，`hover:text-muted-foreground`
  等于没有反馈；抬到 `hover:text-foreground`。
- 验收方式是量渲染像素，不是看令牌：取文字包围盒内离背景最远的那个像素与众数背景比，
  令牌算出来合规、叠了不透明度或半透明背景后照样会挂。

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

## 本项目的复合组件

这些不是 registry 原语，是本项目在 `src/components/` 里沉淀的组合件。新页面优先复用，
不要再各写一套，否则同一种信息在不同页面会长出不同的样子。

| 组件 | 用途 |
|---|---|
| `PageHeader` | 页头：eyebrow（面包屑）/ icon / 标题 / 描述 / 右侧动作。标题即页面唯一 `h1` |
| `StatStrip` + `StatStripItem` | 顶部指标条：一张卡内等宽指标，靠分隔线划分；条目 ≤ 4 |
| `StatTile` | 卡内指标格：带边框的小方块，可在数值下塞进 `QuotaBar` |
| `ProviderMonogram` | 提供商标识，两字母 monogram，`sm`/`md`/`lg`；`aria-hidden` |
| `QuotaBar` / `quotaTextClassName` | 额度条与额度文本，同一套分级 |
| `AccountStatusBadges` | 账户状态徽标（失败 / 余量偏低 / 已停用 / 正常） |
| `ChartTooltipContent` | Recharts tooltip 的统一外观 |
| `SparkStrip` | 概览卡里的近 7 天每日最紧值：固定 7 个日槽的迷你柱 |
| `FilterChips` | 概览筛选胶囊：全部 / 需关注 / 正常 / 已停用 |
| `SettingsNav` | 设置分区导航：窄屏横向、宽屏左侧竖列 |
| `SegmentedToggle` | 卡头里的分段切换（趋势范围、用量指标） |

迷你趋势画柱不画折线：数据是一天一个值，折线会在缺测的日子之间插值，而空槽本身就是
「那天没采到」的信息。槽位固定成 7 个（最右为今天，见 `src/lib/spark-strip.ts`），
所有卡片的柱子才会纵向对齐。它和上方的当前额度不是同一个数（每日最紧值 vs 此刻），
所以必须带标题和 min–max 区间，不能贴着大数字当装饰。

账户卡网格最多两列（`sm:grid-cols-2`）。概览按紧张度分节，每节 1~4 张卡：三列网格下
两张卡的一节会空出右边整整一格、四张卡会在第二行空出两格，整页看着像没加载完。列数要
按「分节后每节的张数」而不是「总张数」来选（`accountGridClassName`）。骨架屏的列数
和块数也跟着同一套走，否则数据落地时会重排。

## 排版层级

一个页面只有一个 `h1`（由 `PageHeader` 渲染）。`CardTitle` 默认渲染成 `div`，
作为区块标题时必须显式 `render={<h2 />}`，否则 `h1` 之下没有可导航的层级。

| 层级 | 样式 | 例 |
|---|---|---|
| 页标题 | `h1`，`font-heading text-2xl font-semibold` | `PageHeader` |
| 区块标题 | `h2`，`CardTitle` + `text-base` | 「窗口详情」「趋势」 |
| 卡内小节 / 列表项名 | `h3`，`text-sm font-semibold` | 「按天」「基本信息」 |
| 字段标签 | `FieldLabel`，`text-sm font-medium` | 「采集间隔」 |
| 辅助说明 | `text-xs text-muted-foreground` | 字段 hint |

小节标题不能比它所辖的字段标签更弱（别用 `text-xs text-muted-foreground` 当小节标题），
分段感交给上方 `border-t`，标题只需要比字段标签高一档。

## 加载与空态

- 一个页面的多个接口各自落地，不要 `Promise.all` 之后再一起 `setState`：最慢的请求会把
  已经拿到的头部和指标一起压在骨架屏后面（详情页的 `/api/accounts` 与 `/snapshots`）。
- 骨架屏留在拥有数据的那张卡里（`TrendChart`、`SnapshotHistory` 自己判 `history === null`），
  卡壳与标题保持在位，数据到位时不会整页跳动。加载中的区块挂 `aria-busy`。
- 空态要分清「没有数据」和「当前视图看不到数据」：趋势图在整段历史不足两点时说
  「快照不足」，在所选时间范围内点数不足时说范围太窄，并给一个切到「全部」的按钮。
  同一句文案套两种成因，用户只会以为功能坏了。

## 额度分级

`quotaTone(pct, warnPct)`（`src/lib/format.ts`）是全站唯一的紧张度判定，`QuotaBar`、
额度文本、sparkline、KPI 条都从它取色：低于阈值 `critical`（destructive），
低于阈值两倍（上限 50%）`warning`（amber），其余 `normal`（`foreground/64`，
满格纯黑在浅色下过重）。新增额度展示请接这个函数，不要另立阈值。

## 数值与时间文案

- 百分比走 `windowPctText`，绝对量走 `windowAmountText`；后者对 `percent` 单位返回 `null`，
  两者不要拼在一起，否则会渲染出「45% 45% %」。
- 窗口名/单位名用 `windowName`/`unitName`，内部靠 `t.has()` 判断词条是否存在——
  自定义提供商的 kind 不在词条表里，直接 `t()` 会把 `window.<kind>` 原样显示。
  next-intl 不支持 `defaultValue`。
- 相对时间用 `relativeTimeText`、倒计时用 `countdownText`，都从 `time.*` 词条取词，别写死中英文后缀。
- 窗口重置时刻用 `resetText`：采集有间隔，快照里的 `resetAt` 可能已经过期，那时要说
  「1 小时前」而不是「0 分钟后」。只有确定筛过未来时间的地方（KPI 条的 `nextResetWindow`）
  才直接用 `countdownText`。
- 计数类 KPI 的数字要和屏幕上的卡片数对得上；「只算启用中」这类口径差异放到副行文案里，
  别让「账户 3」旁边摆着 4 张卡。
- 组件渲染期间不要调 `Date.now()`（`react-hooks/purity`）。需要"现在"的逻辑放进
  `src/lib/overview.ts`（`nextResetWindow`）或 `src/lib/trend.ts`（`buildTrendSeries`）这类纯函数。

## 适配器新增流程（后端约定）

1. 新建 `src/server/adapters/<id>.ts`，实现 `Adapter` 接口（`src/server/adapters/types.ts`）。
2. 在 `src/server/adapters/registry.ts` 的 `BUILTIN_ADAPTERS` 数组追加（顺序即 sortOrder）。
3. `src/server/bootstrap.ts` 启动幂等 upsert 自动落 providers 行，无需手写 SQL。
4. 若为通用 REST JSON 端点，优先让用户走 declarative spec（`src/server/adapters/declarative.ts`），不写代码。

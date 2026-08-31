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

## 适配器新增流程（后端约定）

1. 新建 `src/server/adapters/<id>.ts`，实现 `Adapter` 接口（`src/server/adapters/types.ts`）。
2. 在 `src/server/adapters/registry.ts` 的 `BUILTIN_ADAPTERS` 数组追加（顺序即 sortOrder）。
3. `src/server/bootstrap.ts` 启动幂等 upsert 自动落 providers 行，无需手写 SQL。
4. 若为通用 REST JSON 端点，优先让用户走 declarative spec（`src/server/adapters/declarative.ts`），不写代码。

# Verifier 索引

## v1（2026-09-02 创建）
- 文件：`verifier/v1/acceptance.md`、`verifier/v1/check.sh`
- 度量：eslint（0 error / ≤6 warning）、vitest 全绿、next build 成功、zh/en i18n 键平价、
  组件内无硬编码颜色与 `t()` defaultValue 误用；另有截图走查清单。
- 基线：bb5d1c0 上 eslint 0/6、vitest 49/53（better-sqlite3 worker 崩溃为环境问题）、build 通过。
- 运行记录：见 `verifier/runs/`，每次运行追加一条带时间戳的记录。

## 运行记录格式
`verifier/runs/YYYYMMDD-HHMMSS.md`：命令、退出码、关键输出。

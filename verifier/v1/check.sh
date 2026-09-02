#!/usr/bin/env bash
# Verifier v1：自动化验收。在仓库根目录运行：bash verifier/v1/check.sh
set -u
cd "$(dirname "$0")/../.."
FAIL=0

echo "== 1. eslint =="
LINT_OUT=$(./node_modules/.bin/eslint src 2>&1)
echo "$LINT_OUT" | tail -3
ERRS=$(echo "$LINT_OUT" | grep -oP '\d+(?= error)' | tail -1 || true)
WARNS=$(echo "$LINT_OUT" | grep -oP '\d+(?= warning)' | tail -1 || true)
if [ "${ERRS:-0}" != "0" ]; then echo "FAIL: eslint errors=$ERRS"; FAIL=1; fi
if [ "${WARNS:-0}" -gt 6 ]; then echo "FAIL: eslint warnings=$WARNS > 6"; FAIL=1; fi

echo "== 2. vitest =="
TEST_OUT=$(./node_modules/.bin/vitest run 2>&1)
echo "$TEST_OUT" | grep -E "Test Files|Tests " | tail -2
if echo "$TEST_OUT" | grep -qE "Tests .*\b[1-9][0-9]* failed"; then echo "FAIL: vitest 有用例失败"; FAIL=1; fi
if ! echo "$TEST_OUT" | grep -q "Test Files"; then echo "FAIL: vitest 未完成"; FAIL=1; fi

echo "== 3. next build =="
BUILD_OUT=$(./node_modules/.bin/next build 2>&1)
BUILD_EXIT=$?
echo "$BUILD_OUT" | tail -3
if [ $BUILD_EXIT -ne 0 ] || echo "$BUILD_OUT" | grep -qiE "Failed to compile|Failed to type check|Type error"; then echo "FAIL: next build (exit=$BUILD_EXIT)"; FAIL=1; fi

echo "== 4. i18n 键平价 =="
node -e '
const zh = require("./messages/zh.json"), en = require("./messages/en.json");
const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]);
const a = keys(zh).sort(), b = keys(en).sort();
const onlyA = a.filter(k => !b.includes(k)), onlyB = b.filter(k => !a.includes(k));
if (onlyA.length || onlyB.length) { console.error("zh only:", onlyA); console.error("en only:", onlyB); process.exit(1); }
console.log(`i18n keys: ${a.length} 对，一致`);
' || FAIL=1

echo "== 5. 令牌纪律 =="
# ui/ 为 vendored 原语（上游代码），不做颜色检查；页面与复合组件必须走令牌。
if grep -rnE "#[0-9a-fA-F]{3,8}\b|oklch\(" src/components src/app --include="*.tsx" | grep -v "components/ui/"; then
  echo "FAIL: 组件内硬编码颜色"; FAIL=1
else echo "无硬编码颜色"; fi
# 只拦 i18n t() 的 { defaultValue: ... } 误用；Tabs/Input 等组件的 defaultValue prop 是合法 API。
if grep -rn "{ defaultValue:" src/components src/app --include="*.tsx" | grep -v "components/ui/"; then
  echo "FAIL: 仍在使用 t() defaultValue"; FAIL=1
else echo "无 defaultValue 误用"; fi

echo "== RESULT: $([ $FAIL -eq 0 ] && echo PASS || echo FAIL) =="
exit $FAIL

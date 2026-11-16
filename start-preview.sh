#!/bin/sh
set -e

PORT="${PORT:-8080}"

# 预览平台注入 PREVIEW_BASE；未被注入时回落到生成好的 .preview-base，
# 保证 UI 的「预览」按钮重放启动命令时同样带上正确的 --base。
if [ -z "${PREVIEW_BASE:-}" ] && [ -f .preview-base ]; then
  PREVIEW_BASE="$(cat .preview-base)"
fi

if [ -n "${PREVIEW_BASE:-}" ]; then
  exec npm run dev -- --host 0.0.0.0 --port "$PORT" --base "$PREVIEW_BASE"
else
  exec npm run dev -- --host 0.0.0.0 --port "$PORT"
fi

#!/bin/bash
# Stop Hook
# Claude Codeが応答を終了するときに実行されます

RESPONSE_LENGTH="$1"

# セッション統計の更新
SESSION_LOG=".claude/logs/session.log"
mkdir -p ".claude/logs"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Response completed (length: $RESPONSE_LENGTH)" >> "$SESSION_LOG"

# クリーンアップ（必要に応じて）
# 一時ファイルの削除など

exit 0

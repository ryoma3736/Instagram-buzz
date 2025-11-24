#!/bin/bash
# Pre-Tool-Use Hook
# ツール呼び出しの前に実行されます（ブロック可能）

TOOL_NAME="$1"
TOOL_ARGS="$2"

# 危険な操作の警告
if [[ "$TOOL_NAME" == "Bash" ]]; then
    if [[ "$TOOL_ARGS" == *"rm -rf"* ]] || [[ "$TOOL_ARGS" == *"sudo"* ]]; then
        echo "⛔ BLOCKED: 危険なBashコマンドが検出されました"
        echo "コマンド: $TOOL_ARGS"
        exit 1  # ブロック
    fi
fi

# Write/Edit操作のログ
if [[ "$TOOL_NAME" == "Write" ]] || [[ "$TOOL_NAME" == "Edit" ]]; then
    echo "📝 ファイル操作: $TOOL_NAME"
    # ログファイルに記録
    LOG_DIR=".claude/logs"
    mkdir -p "$LOG_DIR"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $TOOL_NAME - $TOOL_ARGS" >> "$LOG_DIR/file-operations.log"
fi

exit 0  # 許可

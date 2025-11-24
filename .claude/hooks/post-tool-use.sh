#!/bin/bash
# Post-Tool-Use Hook
# ツール呼び出し完了後に実行されます

TOOL_NAME="$1"
TOOL_RESULT="$2"
HOOK_DIR="$(dirname "$0")"

# 統計情報の記録
STATS_FILE=".claude/stats/tool-usage.json"
mkdir -p ".claude/stats"

if [ ! -f "$STATS_FILE" ]; then
    echo '{}' > "$STATS_FILE"
fi

# ツール使用回数をカウント（簡易実装）
echo "✓ Tool completed: $TOOL_NAME"

# VOICEVOX音声通知（バックグラウンドで実行）
speak() {
    "$HOOK_DIR/voicevox-speak.sh" "$1" &
}

# ツールに応じた音声通知
case "$TOOL_NAME" in
    "Task")
        speak "エージェントを起動しました"
        ;;
    "Write")
        speak "ファイルを作成しました"
        ;;
    "Edit")
        speak "ファイルを編集しました"
        ;;
    "Bash")
        if [[ "$TOOL_RESULT" == *"error"* ]] || [[ "$TOOL_RESULT" == *"Error"* ]]; then
            speak "コマンドでエラーが発生しました"
            echo "⚠️  Bashコマンドがエラーを返しました"
        else
            # miyabi関連コマンドの通知
            if [[ "$TOOL_RESULT" == *"miyabi"* ]]; then
                speak "みやびコマンドを実行しました"
            fi
        fi
        ;;
    "TodoWrite")
        speak "タスクリストを更新しました"
        ;;
esac

exit 0

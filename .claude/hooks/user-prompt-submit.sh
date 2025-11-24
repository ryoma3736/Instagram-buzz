#!/bin/bash
# User Prompt Submit Hook
# このフックは、ユーザーがプロンプトを送信する前に実行されます

USER_PROMPT="$1"

# 特定のキーワードが含まれている場合、リマインダーを表示
if [[ "$USER_PROMPT" == *"本番環境"* ]] || [[ "$USER_PROMPT" == *"production"* ]]; then
    echo "⚠️  WARNING: 本番環境に関する操作です。慎重に実行してください。"
fi

if [[ "$USER_PROMPT" == *"削除"* ]] || [[ "$USER_PROMPT" == *"delete"* ]]; then
    echo "⚠️  WARNING: 削除操作が要求されています。バックアップを確認してください。"
fi

# ビジネスプラン実行コマンドの検出
if [[ "$USER_PROMPT" == *"C0"* ]] || [[ "$USER_PROMPT" == *"C1"* ]] || [[ "$USER_PROMPT" =~ C[0-9]+ ]]; then
    echo "🎯 ビジネスプラン実行モードを検出しました"
fi

exit 0

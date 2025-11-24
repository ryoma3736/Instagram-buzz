#!/bin/bash
# Session End Hook
# Claude Codeセッションが終了するときに実行されます

# セッション統計の集計
SESSION_LOG=".claude/logs/session.log"

if [ -f "$SESSION_LOG" ]; then
    TOTAL_SESSIONS=$(wc -l < "$SESSION_LOG" | tr -d ' ')
    echo "📊 セッション統計: 合計 $TOTAL_SESSIONS セッション"
fi

# クリーンアップメッセージ
echo "👋 セッション終了"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Session ended" >> "$SESSION_LOG"

# サマリーレポート
cat << 'EOF'

お疲れさまでした!

本日の作業内容は以下のディレクトリに保存されています:
  - ログ: .claude/logs/
  - バックアップ: .claude/backups/
  - 統計: .claude/stats/

また、次回のセッションでお会いしましょう。

EOF

exit 0

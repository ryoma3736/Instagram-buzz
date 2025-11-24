#!/bin/bash
# Notification Hook
# Claude Codeが通知を送信するときに実行されます

NOTIFICATION_TYPE="$1"
NOTIFICATION_MESSAGE="$2"

# 通知ログの記録
LOG_FILE=".claude/logs/notifications.log"
mkdir -p ".claude/logs"

echo "$(date '+%Y-%m-%d %H:%M:%S') [$NOTIFICATION_TYPE] $NOTIFICATION_MESSAGE" >> "$LOG_FILE"

# 重要な通知の場合、追加の処理
if [[ "$NOTIFICATION_TYPE" == "error" ]] || [[ "$NOTIFICATION_TYPE" == "warning" ]]; then
    echo "🔔 重要な通知: $NOTIFICATION_MESSAGE"
fi

exit 0

#!/bin/bash
# Subagent Stop Hook
# サブエージェントタスクが完了するときに実行されます

SUBAGENT_TYPE="$1"
SUBAGENT_RESULT="$2"

echo "🤖 サブエージェント完了: $SUBAGENT_TYPE"

# サブエージェントの実行ログ
LOG_FILE=".claude/logs/subagent.log"
mkdir -p ".claude/logs"

echo "$(date '+%Y-%m-%d %H:%M:%S') - $SUBAGENT_TYPE completed" >> "$LOG_FILE"

exit 0

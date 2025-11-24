#!/bin/bash
# Pre-Compact Hook
# Claude Codeがコンパクト操作を実行しようとする前に実行されます

COMPACT_REASON="$1"

echo "🗜️  コンテキストのコンパクト化を開始: $COMPACT_REASON"

# コンパクト前のコンテキスト保存（オプション）
BACKUP_DIR=".claude/context-backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
echo "Context compacted at $TIMESTAMP" > "$BACKUP_DIR/compact_${TIMESTAMP}.log"

exit 0

#!/bin/bash
# Before Edit Hook
# このフックは、ファイル編集前に実行されます

# 編集対象のファイルパスは $1 に渡されます
FILE_PATH="$1"

# 重要ファイルのバックアップを作成
if [[ "$FILE_PATH" == *".md" ]] || [[ "$FILE_PATH" == *".yaml" ]] || [[ "$FILE_PATH" == *".json" ]]; then
    BACKUP_DIR=".claude/backups"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    FILENAME=$(basename "$FILE_PATH")
    cp "$FILE_PATH" "$BACKUP_DIR/${FILENAME}.${TIMESTAMP}.bak"
    echo "✓ Backup created: $BACKUP_DIR/${FILENAME}.${TIMESTAMP}.bak"
fi

exit 0

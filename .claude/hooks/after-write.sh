#!/bin/bash
# After Write Hook
# このフックは、ファイル書き込み後に実行されます

FILE_PATH="$1"

# Markdownファイルの場合、文字数をカウント
if [[ "$FILE_PATH" == *".md" ]]; then
    CHAR_COUNT=$(wc -m < "$FILE_PATH" | tr -d ' ')
    echo "📝 File written: $(basename "$FILE_PATH") ($CHAR_COUNT characters)"
fi

# HTMLファイルの場合、バリデーション（簡易）
if [[ "$FILE_PATH" == *".html" ]]; then
    if command -v tidy &> /dev/null; then
        tidy -q -e "$FILE_PATH" 2>&1 | head -5
    else
        echo "💡 Tip: Install 'tidy' for HTML validation"
    fi
fi

exit 0

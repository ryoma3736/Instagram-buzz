#!/bin/bash
# VOICEVOX Speech Helper
# Usage: ./voicevox-speak.sh "読み上げテキスト" [speaker_id]

TEXT="$1"
SPEAKER_ID="${2:-1}"  # デフォルト: ずんだもん (1)

# VOICEVOX API endpoint
VOICEVOX_URL="http://localhost:50021"

# テキストが空の場合は終了
if [ -z "$TEXT" ]; then
    exit 0
fi

# 一時ファイル
TEMP_FILE="/tmp/voicevox_$$.wav"

# URLエンコード
ENCODED_TEXT=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEXT'))")

# 音声合成クエリを作成
QUERY=$(curl -s -X POST "${VOICEVOX_URL}/audio_query?text=${ENCODED_TEXT}&speaker=${SPEAKER_ID}" \
    -H "Content-Type: application/json" 2>/dev/null)

if [ -z "$QUERY" ] || [ "$QUERY" = "null" ]; then
    exit 1
fi

# 音声を合成して一時ファイルに保存
curl -s -X POST "${VOICEVOX_URL}/synthesis?speaker=${SPEAKER_ID}" \
    -H "Content-Type: application/json" \
    -d "$QUERY" \
    -o "$TEMP_FILE" 2>/dev/null

# 再生
if [ -f "$TEMP_FILE" ] && [ -s "$TEMP_FILE" ]; then
    afplay "$TEMP_FILE" 2>/dev/null
    rm -f "$TEMP_FILE"
fi

exit 0

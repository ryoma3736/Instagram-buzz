#!/bin/bash
# Miyabi Agent Narrator with VOICEVOX
# miyabiの出力を監視してVOICEVOXで実況

VOICEVOX_URL="http://localhost:50021"
SPEAKER_ID="${1:-1}"  # デフォルト: ずんだもん

speak() {
    local text="$1"
    local temp_file="/tmp/voicevox_narrator_$$.wav"

    # URLエンコード
    local encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$text'))")

    # 音声合成
    local query=$(curl -s -X POST "${VOICEVOX_URL}/audio_query?text=${encoded}&speaker=${SPEAKER_ID}" 2>/dev/null)

    if [ -n "$query" ] && [ "$query" != "null" ]; then
        curl -s -X POST "${VOICEVOX_URL}/synthesis?speaker=${SPEAKER_ID}" \
            -H "Content-Type: application/json" \
            -d "$query" \
            -o "$temp_file" 2>/dev/null

        if [ -f "$temp_file" ] && [ -s "$temp_file" ]; then
            afplay "$temp_file" 2>/dev/null
            rm -f "$temp_file"
        fi
    fi
}

# パイプから読み取りながら実況
while IFS= read -r line; do
    echo "$line"  # 元の出力も表示

    # パターンマッチで実況
    if [[ "$line" == *"Water Spider Agent"* ]]; then
        speak "ウォータースパイダーエージェント起動" &
    elif [[ "$line" == *"巡回開始"* ]]; then
        speak "巡回を開始します" &
    elif [[ "$line" == *"issueAgent 実行中"* ]]; then
        speak "イシューエージェント実行中" &
    elif [[ "$line" == *"issueAgent 実行完了"* ]]; then
        speak "イシューエージェント完了" &
    elif [[ "$line" == *"issueAgent実行判断"* ]]; then
        # Issue番号を抽出
        issue_num=$(echo "$line" | grep -oE '#[0-9]+' | head -1)
        speak "イシュー${issue_num}を処理します" &
    elif [[ "$line" == *"codegenAgent"* ]]; then
        speak "コード生成エージェント実行中" &
    elif [[ "$line" == *"reviewAgent"* ]]; then
        speak "レビューエージェント実行中" &
    elif [[ "$line" == *"prAgent"* ]]; then
        speak "プルリクエストエージェント実行中" &
    elif [[ "$line" == *"エラー"* ]] || [[ "$line" == *"Error"* ]]; then
        speak "エラーが発生しました" &
    elif [[ "$line" == *"成功"* ]] || [[ "$line" == *"完了"* ]]; then
        speak "処理が完了しました" &
    fi

    # 音声が重ならないよう少し待つ
    sleep 0.1
done

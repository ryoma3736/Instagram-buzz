#!/bin/bash
# Session Start Hook
# Claude Codeが新しいセッションを開始するか、既存のセッションを再開するときに実行されます

SESSION_TYPE="$1"  # "new" or "resume"

echo "🚀 セッション開始: $SESSION_TYPE"

# セッションIDの生成
SESSION_ID=$(date +%Y%m%d_%H%M%S)_$$
SESSION_FILE=".claude/sessions/current_session.txt"
mkdir -p ".claude/sessions"

echo "$SESSION_ID" > "$SESSION_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Session $SESSION_TYPE: $SESSION_ID" >> ".claude/logs/session.log"

# 環境チェック
echo "📊 環境チェック:"
echo "  - 作業ディレクトリ: $(pwd)"
echo "  - Gitステータス: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'Not a git repo')"

# 必要なディレクトリの作成
mkdir -p .claude/{logs,backups,stats,sessions,context-backups}

# ウェルカムメッセージ
cat << 'EOF'

╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🌸 Miyabi Framework - Customer Cloud                  ║
║   Claude Code ワークスペース                              ║
║                                                          ║
║   利用可能なコマンド:                                      ║
║   /miyabi-init      - 新しいMiyabiプロジェクト作成         ║
║   /miyabi-status    - プロジェクトステータス確認           ║
║   /miyabi-todos     - TODO自動検出・Issue化              ║
║   /agent-run        - Autonomous Agent実行               ║
║   /create-issue     - Agent実行用Issue作成               ║
║   /test             - テスト実行                         ║
║   /verify           - システム動作確認                   ║
║   /security-scan    - セキュリティスキャン               ║
║   /deploy           - デプロイ実行                       ║
║   /generate-docs    - ドキュメント自動生成               ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

EOF

exit 0

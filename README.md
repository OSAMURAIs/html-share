# HTML共有くん

> Claude Codeの生成結果、ぜんぶ見やすくまとめよう

HTML共有くん（`html-share`）は、Claude Codeが作ったHTMLをスマートフォンで見やすく共有するセルフホスト型ダッシュボードです。AIから届いた承認依頼へ、スマートフォンから回答することもできます。

## できること

- HTMLの状況ページを本人専用ダッシュボードへ集約
- 有効期限付きURLでページを共有
- スマートフォンから承認・コメント
- 回答を元のClaude CodeまたはCodexタスクへ取り込み
- AWS CDKで利用者自身のAWSアカウントへ構築

HTML共有くんはホステッドサービスではありません。作者へページ、回答、認証情報、利用状況を送信しません。

## セキュリティ設計

管理画面と成果物は別のCloudFrontディストリビューションと別ドメインで配信します。成果物HTMLにスクリプトが含まれていても、管理画面のCookieやレビューAPIへ同一オリジンとしてアクセスできません。

共有URLにはCloudFrontの署名付きURLを使用します。秘密鍵は利用者のローカルとAWS Systems Manager Parameter Storeにだけ置かれ、ブラウザ、S3、CloudFront Functionのコードには配布されません。

詳細は [脅威モデル](docs/threat-model.md) を参照してください。

## 必要なもの

- Node.js 22以降
- AWSアカウントとAWS CLIの認証
- 2つのホスト名と、米国東部（バージニア北部）リージョンで発行したACM証明書
- Claude CodeまたはCodex

## セットアップ

```bash
git clone https://github.com/minorun365/html-share.git
cd html-share
npm install
npm run build
npm link
cp html-share.config.example.yaml html-share.config.yaml
html-share keys init
html-share keys store
npm run deploy
html-share publish
```

`/mobile` を複数のプロジェクトで使う場合は、設定を `~/.config/html-share/config.yaml` へ置くか、`HTML_SHARE_CONFIG` で場所を指定してください。設定ファイル内の `content.roots` には、共有を許可するディレクトリだけを列挙します。

Claude Codeへ `/mobile` を追加する場合は、リポジトリ内の `skills/mobile` をユーザーまたはプロジェクトのスキルディレクトリへ配置します。

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/mobile" ~/.claude/skills/mobile
```

CDKの出力に表示されるCloudFrontドメインへ、設定した2つのホスト名をCNAMEまたはRoute 53エイリアスで向けます。

## 日々の操作

```bash
# HTMLを検査してダッシュボードへ反映
html-share publish

# 7日間有効な共有URLを発行
html-share share demo-report --days 7

# スマートフォンとのペアリング
html-share review pair ABCD-EFGH --name "My laptop"

# 確認カードを送る
echo '[{"title":"Release review","question":"Ready to publish?"}]' \
  | html-share review push --session task-123
```

Codexでは同梱の `$mobile` スキルを利用できます。Claude Codeでは `skills/mobile/SKILL.md` をスキルディレクトリへ配置してください。

## 安全な既定値

- 無期限の匿名公開を提供しない
- 共有期間の上限は設定ファイルで制限
- 成果物の参照元を許可ディレクトリ内へ限定
- シンボリックリンクを実体パスで検査
- ローカルファイルを単一HTMLへ埋め込み、関連ファイルの認可漏れを防止
- 成果物へ `noindex` と制限付きCSPを付与
- 管理画面と成果物を別オリジンへ分離
- テレメトリーなし

## 開発

```bash
npm install
npm run verify
npm run synth
```

## ライセンス

Apache License 2.0。脆弱性の報告方法は [SECURITY.md](SECURITY.md) を参照してください。

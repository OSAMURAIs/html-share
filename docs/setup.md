# 初回セットアップ

HTML共有くんは、自分のAWSアカウントへ構築して使います。セットアップ後の日常操作は、Claude Codeへ日本語で依頼できます。

## 必要なもの

- Node.js 22以降
- AWSアカウントとAWS CLIの認証
- 2つのホスト名
- 米国東部（バージニア北部）リージョンで発行したACM証明書
- Claude CodeまたはCodex

## インストール

```bash
git clone https://github.com/minorun365/html-share.git
cd html-share
npm install
npm run build
npm link
cp html-share.config.example.yaml html-share.config.yaml
```

`html-share.config.yaml` のサンプル値を、自分のAWS環境とドメインへ置き換えてください。`content.roots` には、共有を許可するディレクトリだけを列挙します。

## 署名鍵とAWS環境の作成

```bash
html-share keys init
html-share keys store
npm run deploy
html-share publish
```

CDKの出力に表示されるCloudFrontドメインへ、設定した2つのホスト名をCNAMEまたはRoute 53エイリアスで向けます。

## スキルの追加

同梱の `create-html` は、メモや調査結果を読みやすいHTMLに整えます。`mobile` は、PC作業の確認依頼をスマホへ送ります。`inbox` は、スマホから置いた依頼をPCで引き取ります。

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/create-html" ~/.claude/skills/create-html
ln -s "$(pwd)/skills/mobile" ~/.claude/skills/mobile
ln -s "$(pwd)/skills/inbox" ~/.claude/skills/inbox
```

複数のプロジェクトで使う場合は、設定を `~/.config/html-share/config.yaml` へ置くか、`HTML_SHARE_CONFIG` で場所を指定します。

## 動作確認

Claude Codeへ「このHTMLを共有くんに追加して」と依頼し、本人専用の一覧にページが表示されれば完了です。

開発者向けの検証コマンドは [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。

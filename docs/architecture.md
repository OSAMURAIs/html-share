# アーキテクチャ

## 信頼境界

```text
Claude Code / Codex
        │ device token
        ▼
管理面: console.example.com ── Cognito ── Review API / DynamoDB
        │ signed URL
        ▼
閲覧面: content.example.com ── CloudFront key group ── S3
```

管理面にはプロジェクト一覧、インボックス、認証APIだけを置きます。AIが生成したHTMLは閲覧面へ置き、管理面と同一オリジンにしません。

## 署名鍵

- RSA秘密鍵：ローカルの `.html-share/keys/private.pem` とParameter StoreのSecureString
- RSA公開鍵：CloudFront Public Key
- CLI：短期の共有URLと、ダッシュボード用の本人URLを生成
- 認証Lambda：本人ログイン後に管理面用のCloudFront署名Cookieを発行

## インボックスと承認依頼

ブラウザ用APIと端末用APIをパスで分けます。

- `/api/owner/*`：CloudFront署名Cookieが必要
- `/api/device/*`：ペアリング済み端末トークンが必要
- `/api/pairings/claim`：10分で失効する一度限りのコードと交換

本人がスマホから置く依頼は `/api/owner/reviews` へ投稿し、宛先を持たない `inbox` セッションへ固定します。ペアリング済みのどのPCからでも取り込み、完了にできます。任意の `target` はプロジェクトの呼び名のヒントで、ファイルパスではありません。取り込む側が依頼文と合わせて作業フォルダを見極めます。

依頼の状態は `waiting` と `completed` の2つだけで、「取り込み済み」を表す状態を持ちません。そのためエージェントは、作業の完了を待たず取り込んだ時点で完了にします。開いたままの依頼が「まだどのPCも拾っていないもの」を意味するようになり、スマホの一覧がそのまま受け渡しの状態を表します。進捗と結果はインボックスではなくチャットで返します。

端末トークンは端末へだけ返し、DynamoDBにはSHA-256ハッシュを保存します。

## 閲覧面の表

スマホ幅では、はみ出した表を縦積みのカードへ畳みます。スクリプトはAPIを呼ばないので、閲覧面の `connect-src 'none'` はそのままです。相対パスのJSはCSPで読めないため、配信HTMLへインラインで埋め込みます。

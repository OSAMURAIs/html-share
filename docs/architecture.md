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

管理面にはプロジェクト一覧、「AIからの承認依頼」、認証APIだけを置きます。AIが生成したHTMLは閲覧面へ置き、管理面と同一オリジンにしません。

## 署名鍵

- RSA秘密鍵：ローカルの `.html-share/keys/private.pem` とParameter StoreのSecureString
- RSA公開鍵：CloudFront Public Key
- CLI：短期の共有URLと、ダッシュボード用の本人URLを生成
- 認証Lambda：本人ログイン後に管理面用のCloudFront署名Cookieを発行

## AIからの承認依頼

ブラウザ用APIと端末用APIをパスで分けます。

- `/api/owner/*`：CloudFront署名Cookieが必要
- `/api/device/*`：ペアリング済み端末トークンが必要
- `/api/pairings/claim`：10分で失効する一度限りのコードと交換

端末トークンは端末へだけ返し、DynamoDBにはSHA-256ハッシュを保存します。

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

## 公開トランザクション記録

`.html-share/publish-transactions/` の1ファイルが1回の公開トランザクションです。状態は
`prepared` → `uploading` → `cleaning` → `verifying` → `committed` と進みます。

終端状態は3つだけです。

- `committed`：正常に完了
- `rolled_back`：`publish --recover` がS3の変更を巻き戻した
- `superseded`：巻き戻さずに放棄した。後続の `committed` トランザクションが上書きしたことを
  証明したうえでのみ記録する

厳格な本番検証（`verify-production`）は、終端状態でない記録が1つでも残っていれば必ず失敗します。

`superseded` は、公開プロセスが `verifying` と `committed` の間で停止し、その後の公開が
アップロード済みオブジェクトをすべて上書きした場合のためにあります。この記録は
`publish --recover` では解決できません。対象トランザクションのバージョンを削除したうえで、
現在のバージョンがそのトランザクションのbaselineと一致することを要求するため、後続のcommitが
すでに置き換えている状況では、削除を済ませてから `Rollback baseline mismatch` で失敗します。

```bash
html-share journal reconcile-superseded [--transaction id]
```

この操作はS3を一切変更しません（バージョン一覧の参照のみ）。履歴も書き換えず、元の記録に監査用の
`reconciliation`（理由・上書きしたトランザクションID・確認した述語）を追加するだけです。次の述語が
すべて成立しない限り拒否します。

1. 対象が未完了で、未完了の記録はそれ1つだけ
2. 対象より後に開始した `committed` トランザクションが存在する
3. 対象がアップロード／削除したバージョンが、両バケットでいずれも現行ではない
4. 現在の本番が、その後続 `committed` トランザクションと完全に一致する
5. 一連の確認中に記録一覧が変化していない

「完了扱いにする」汎用の抜け道ではありません。現行バージョンを保持している記録、後続のcommitが
無い記録、他に未完了の記録がある場合は、そのまま検証を失敗させ続けます。信頼ホストではhub側の
publishロックを保持したまま実行し、確認から書き込みまでの間にworkerが公開を開始できないように
します。

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

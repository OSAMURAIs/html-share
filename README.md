# HTML共有くん

> Claude Codeの生成結果、ぜんぶ見やすくまとめよう

HTML共有くんは、Claude Codeに頼んで見やすいHTMLを作り、スマホでも確認・共有できるツールです。初回セットアップが済んだら、あとはClaude Codeへ日本語で頼むだけです。

<p align="center">
  <img src="docs/images/dashboard.png" alt="HTML共有くんのメインダッシュボード" width="66%">
  &nbsp;
  <img src="docs/images/mobile-approval-actions-native.png" alt="AIから届いた承認依頼をスマホで確認" width="31%">
</p>

## できること

- メモや調査結果を、見やすいHTMLに整える
- 作ったHTMLを、自分専用の一覧へまとめる
- 社内限定や期限付きのURLで共有する
- 読んだページを未読に戻し、あとで読み直す目印にする
- スマホから依頼を置き、PCのClaude Codeが `/inbox` で引き取る
- AIからの承認依頼をスマホで確認し、コメントを返す
- スマホから返した内容を、PC上の作業へ引き継ぐ

作者へページや回答を送らないセルフホスト型です。自分のAWSアカウントで動かせます。

## Claude Codeへこう頼む

> このHTMLを共有くんに追加して

> この内容を見やすいHTMLにまとめて

> このページを社内限定で7日間共有して

> `/inbox` で、スマホから置いた依頼を引き取って

> `/mobile` で、今の作業をスマホから確認できるようにして

コマンドを覚える必要はありません。Claude CodeがHTMLの登録、共有URLの発行、スマホへの確認依頼まで進めます。

## はじめる

導入方法は [初回セットアップ](docs/setup.md) にまとめています。公開前に確認したい仕組みは [セキュリティ設計](docs/threat-model.md) を参照してください。

## ライセンス

Apache License 2.0

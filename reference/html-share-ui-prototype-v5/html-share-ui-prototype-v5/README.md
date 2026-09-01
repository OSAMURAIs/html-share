# ORBIT — html-share UI Prototype v5

`html-share` / `html-share-hub` のUX topologyを検証する、standalone interactive HTML prototypeです。ORBITはprototype上だけの仮名称で、technical project / repository名は変更しません。

## 起動

外部runtime・CDN・network requestは使っていません。`index.html`をブラウザで開くか、prototypeディレクトリを静的ファイルサーバーで配信してください。

主な入口：

- `index.html` — ホーム
- `research/index.html` — 研究概要
- `personal/index.html` — 暮らし / 現在地
- `investment/dashboard.html` — Investment Dashboard
- `live-work.html` — Live Work

## 構造

15 UX destinationsを、domainごとのsecondary navigation付きで収録しています。`assets/app.css`は共通visual language、`assets/app.js`と`assets/v5.js`はsanitized fixture、filter、disclosure、travel mode、semantic motionを担当します。

この成果物はproduction canonical treeの置換、source変更、Notion / AWS / repositoryへの書き戻しを行いません。

## 注意

現行HTMLから取得できる情報は値・lifecycle・workflowを優先して保持しています。Research Feedの本文要約、Libraryのintent gradient、Travelの一部detailは、`DESIGN-DECISIONS.md`に記載したprototype用のconceptual / enriched fixtureです。

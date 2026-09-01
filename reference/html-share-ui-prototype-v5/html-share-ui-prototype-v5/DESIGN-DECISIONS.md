# Design decisions — v5

## Product label

**ORBIT**はprototype用の仮名称。`html-share` / `html-share-hub`というtechnical project / repository名やproduction名称を変更するものではない。

## Visual language

v3のinformation densityとv4のIAを統合し、deep navy / clear blue / pale blue / off-whiteを基調にした。green・amber・redはpositive / warning / blocked・negativeというsemantic専用に残す。大きい面積は、案件、NEXT、Blocked、総資産、現在の判断などの具体情報に使う。

## Typography / spacing / surface

本文は15px、secondary本文は13–14px、table bodyは14pxを基準にし、titleより内容を読むことを優先した。余白を削って文字を大きくし、tableはnumeric right alignmentとclear column separatorを使う。

## Navigation

Global navigationはホーム / 研究 / 暮らし / 投資。Travelを開いても暮らしのsecondary navigationは消えない。InvestmentのEnglish secondary navigationは、既存data termsとの連続性を優先して維持した。Live Workはglobalの主ナビとは別のoperational destinationとしてHomeからcompact stripで投影する。

## Focus + Complete Collection

Overviewで重要情報を絞ることと、systemから情報を削ることを分ける。Papersは3件のrich focus + 44件のqueue、Knowledge Reviewはactionable focus + kind別backlog、Personalはpriority + 3 active plans、InvestmentはDashboard + full tables / decisions / journalで構成した。

## Research project model

修士論文とCPGteamだけをProjectとする。研究探索は第3のProjectではなく、Digest / Paper discovery / survey / Knowledge Review / research notesを含む非Project activityである。Feed / Paper / Knowledge itemは0個以上のProject relationを持つentityとして、修士論文・CPGteam・複数関連・Project関連なしを許容する。

## Research Feed / Papers lifecycle

Digestの8月24日、8月19日などの日付batchをprovenanceとして残した。Feedは本文 > title > metadataの順で読むrich cardにし、Paper QueueはReading / Queued / Holdと全44件へのアクセスを保持する。

## Personal 現在地 / 案件

現在地は最優先案件の文脈・次の一手・近い予定・継続中のものをglance用にまとめる。案件はActive Plansの全件を詳細に確認する場所で、date / companion / destination / current / nextを削らない。

## Library lifecycle

Reading / watching、shopping、saved / unstarted、recently acquiredを別surfaceにした。Shoppingの「気になる / 本格検討 / 入手予定」はsourceに完全なfieldがないため、prototype上のconceptual fixtureとして扱う。

## Travel collection / detail / travel-mode

箱根・広島・高知のcollectionを保持し、箱根detailにはv3相当以上のconfirmed、booking、transport、Day 1 / Day 2、重要時刻、fallbackを置いた。旅行中modeでは次の移動をtimeline上部へ出す。390pxではtransport legがvertical timelineになる。

## Investment Dashboardと既存4 pages

DashboardはPortfolio summary + Attention、投資済み資産配分、Top 5 + Other、価格損益への寄与の順に置いた。sourceの実値 `¥3,336,077 / ¥2,110,434 / ¥1,225,643`を使い、allocationは投資済み資産を分母に明示する。P/Lはposition price P/Lであり、未提供のportfolio-wide cost-basis P/Lを推測しない。

## Table strategy

DesktopはSecurity Summaryとposition-level detailをtableのまま維持する。sticky header / identity column / hoverを使用し、mobileは横スクロールで全columnに到達できるようにした。意味が変わるカード変換は行わない。

## Mobile strategy

860px以下でrailは横長のcompact global headerへ変わり、project / detail / chartsはsingle-columnへ再構成する。Research project surfacesは横スクロール可能なcollection、Investment tableはpriority identity columnを固定したhorizontal scroll、Travelはvertical operational timelineとする。`overflow:hidden`で情報を切らない。

## Motion

Research filterのcard reflow、Travelのtimeline drawとtraveling marker、Investmentのdonut sweepとP/L diverging barを、関係・時間・進捗を示すために使う。`prefers-reduced-motion`ではすべて抑止する。

## Source gap / future schema candidates

- Digest sourceは日付と候補IDを提供するが、rich本文要約・研究との関係・確認事項までは完全に提供しない。Feed cardのenrichmentは将来のderived presenter field候補。
- Library sourceにintent gradientが完全にないため、`気になる / 本格検討 / 入手予定`はfuture field候補であり、現fixtureでは既存状態と混同しない。
- Travel detailのconfirmed / fallback / transport legは、現行Tripsがcollection中心のため、travel detail schemaの候補として扱う。
- Investmentのportfolio-wide cost basisはWARNを保持し、未提供のaggregate P/Lを推測しない。

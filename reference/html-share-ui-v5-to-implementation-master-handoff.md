# html-share UI redesign → 実装計画master handoff

**作成日:** 2026-08-26 JST  
**対象:** `html-share` / `html-share-hub`  
**目的:** UI Prototype v1–v5で確定した設計判断・未反映修正・production実装への波及点を、プロジェクト内の「実装計画master」チャットへ引き継ぐ。  
**重要:** この文書は「このUI案をそのまま実装せよ」という指示ではない。`実装計画master`側で、他の未実装改善・保守・architecture変更候補と統合し、依存関係・優先順位・migration・rolloutを再計画するためのinputである。

---

## 0. Master chatへの依頼

このhandoffを、html-share全体の未実装改善を統合する一つのworkstreamとして扱ってください。

いきなりコード変更を始めず、まず以下を行ってください。

1. 現在のrepository HEAD / open PR / dirty state / runtime / production stateをread-onlyで再確認する。
2. このUI redesign workstreamと、master chatですでに管理している他の改善workstreamを一覧化する。
3. workstream間の依存関係・競合・同時に触るべき箇所を整理する。
4. source → adapter/model → presenter/renderer → canonical topology → html-share shell → validation → trusted publish → production E2E の順に影響範囲を判定する。
5. 現行の「12 static canonical + 1 operational Live Work」を変更する必要があるかは、prototypeのpage数から自動的に決めず、architecture decisionとして別途判断する。
6. migration / backward compatibility / watcher fingerprint / exact-tree validation / publication safetyまで含めたmaster implementation planを作る。
7. plan承認後にのみ実装フェーズへ進む。

このUI workstreamを単独で最適化せず、他のhtml-share改善と統合して、手戻りが最小になる実装順序を決めてください。

---

# 1. 現行architectureの不変条件

## Source of truth

`html-share` / `html-share-hub` 自体は正本ではない。

- Research → `research-knowledge-base` / Obsidian
- Personal → Notion Personal System
- Investment → canonical Investment sources

html-share系はpresentation / integration / sharing layer。

## Repository separation

### `html-share`

Local:

`C:\Users\starf\Documents\html-share`

責務:

- HTML共有product / browser shell
- HTML一覧
- owner-only / limited sharing
- mobile inbox / approval
- trusted AWS publisher
- S3 publication / recovery
- public manifest / privacy boundary
- rollback infrastructure

source-specific Research / Personal / Investment business logicをここへ集約しない。

### `html-share-hub`

Local:

`C:\Users\starf\Documents\html-share-hub`

責務:

- Research adapter
- Personal adapter
- Investment adapter
- canonical model / presenter / renderer
- unified tree generation
- validation
- scheduled refresh orchestration
- Live Work
- Personal low-latency watcher

source-specific integrationは原則こちら。

## Current canonical baseline

現行production baseline:

- Research: 4 static canonical
- Personal: 4 static canonical
- Investment: 4 static canonical
- **合計 12 static canonical**
- Live Work: **1 separate operational page**

必ず **12 static canonical + 1 operational Live Work** と表現する。

prototype v5にはこれより多いUX destinationがあるが、これはproduction canonical countの決定ではない。

---

# 2. publication / security invariants

既存trusted publisher pathを維持する。

重要invariants:

- shared publish lock
- schema validation
- row validation
- exact canonical tree validation
- privacy validation
- build validation
- AWS identity gate
- rollback-safe publisher
- S3 Versioning
- persistent publication journal
- stale managed key cleanup
- restart-safe recovery
- digest-based no-op publish suppression

禁止:

- second raw S3 publisher
- agent processへのproduction credential付与
- public artifactへのcredential / token / raw prompt / hidden reasoning / private integration metadata /不要なabsolute local pathの混入

canonical topology変更時は exact-tree validation / manifest / stale-key cleanup / rollback / no-op digest への影響を必ず評価する。

---

# 3. 現行runtimeで壊してはいけないもの

## Scheduled full refresh

約6時間間隔のtrusted Windows host Scheduled Task。

役割:

- Research reconciliation
- Personal reconciliation
- Investment reconciliation
- canonical validation
- fallback recovery

## Personal low-latency watcher

production E2E済み。

概略:

Human Notion
→ lightweight Personal reads
→ existing adapter/presenter/renderer
→ normalized rendered-output fingerprint
→ change detection
→ debounce
→ trusted canonical rebuild/publish
→ production

目安:

- poll ≈ 30s
- debounce ≈ 30s
- practical convergence ≈ 1–2min

重要:
watcherはrendered-output fingerprintを監視しているため、Personal renderer / ordering / truncation / selection semanticsを変えるとfingerprint behaviorに影響し得る。

## Live Work

canonical static pagesとは別のoperational page。

- actual running taskだけActive
- idle / complete / stale / mere agent processはActiveに出さない
- agent reporterはcredential-free
- trusted Windows workerがpublish
- target: normal ≈20s / active ≈10s

---

# 4. UI prototype workstreamの到達点

Prototype v1–v5を通して、方向性はほぼ確定。

v5を**visual / UX reference**として扱う。

v5の目標:

> 必要な情報は現行と同等以上に保持しながら、最初に見る画面では圧倒的に理解しやすくする。

採用した基本原則:

- Overviewで見せないことと、systemから情報を消すことを混同しない。
- `Focus + Complete Collection`
- 大きなsurfaceは具体的user dataに使う。
- ページを短くするために情報やfont sizeを削らない。
- Desktop 1280px / Chrome 100%で普通に読めること。
- Mobileはdesktop stackだけにしない。
- Motionは装飾ではなく relationship / state / time / progress の理解に使う。
- UIは原則日本語。
- primary design colorはblue系。
- v5のhuman-facing仮brandは `ORBIT`。repository/project名変更を意味しない。

---

# 5. Prototype UX topology

v5で検証したUX destinations:

## Home

- Home

## Research

- Research Overview
- Research Feed
- Papers
- Knowledge Review

## 暮らし

- 現在地
- 案件
- Library
- Travel

## Investment

- Dashboard
- Pulse
- Positions
- Decisions
- Journal

## Operational

- Live Work

**注意:** これはUX topologyであり、production canonical topologyではない。

Master planでは次を明示的に判断すること:

- 既存12 canonicalを維持し、1 HTML内のin-page state / routing / shellで表現するか
- canonical pageを追加/再編するか
- Homeをどこで生成するか
- detail namespaceを導入するか
- existing public manifest / exact tree contractをどうmigrationするか

---

# 6. 最終UI design delta — v5からproduction候補へ入れる必須修正

v5は完成参考だが、そのまま実装しない。以下の修正をproduction requirementsとして扱う。

## 6.1 全体

- PCの不要な余白を削る。ただしreadabilityのための余白は維持。
- 余白削減はfont縮小ではなくlayout / column width / pairingで行う。
- related visual同士を2-columnで組み、desktop横幅を活用。
- v5のfont scaleは概ね維持。
- semantic motionを維持。
- v5で行ったJS後段patch方式をproduction rendererへ持ち込まない。rendererでcleanに一度だけ生成する。

---

## 6.2 Research taxonomy

### Projects

明確なProject:

- 修士論文
- CPGteam

### Research Exploration / 研究探索

Projectではないresearch activity:

- arXiv Digest
- paper discovery
- literature survey
- Knowledge Review
- Research Notes
- project非依存の知見収集

### Entity ↔ Project relation

上記activity taxonomyとは**別軸**。

Feed/Paper/Knowledge entityは:

- 修士論文に関連
- CPGteamに関連
- 両方に関連
- Project関連なし

を取り得る。

`横断`を第3 Projectとして扱わない。

概念として:

```text
Research activity:
  - Project work
  - Research exploration

Entity relation:
  - 修士論文
  - CPGteam
  - both
  - none
```

Production data modelでどう表現するかはmaster planningで決める。

---

## 6.3 Research Overview

v5の上段3 surface:

- 修士論文
- CPGteam
- 研究探索

は維持。

Project surfaceには可能な範囲で:

- project definition / purpose
- goal
- 現在地
- next
- Active / Waiting / Blocked
- open question
- recent decision
- major Note / Paper

研究探索にはcountだけでなくactual content:

- latest Digest
- notable Paper
- current review issue
- next Paper
- recent knowledge update

を表示。

### v5の `Relation model` panel

**UIから削除。**

これはuser-facing contentではなくimplementation/design documentationへ移す。

その空間には open question / recent decision / recent knowledge update など実データを置く。

---

## 6.4 Research Feed

方向はv5を維持。

重要:

- titleより本文
- Digest batch/provenance維持
- relation filterを新taxonomyへ合わせる
- 本文に `何をした研究か / なぜ重要か / 自分の研究との関係 / 確認事項`
- project relationはchip等で明示
- score/relevanceを主役にしない

Source/model gapがある場合、Research KB bodyからdeterministic heading extractionを優先し、opaque AI summary生成を正本化しない。

---

## 6.5 Papers

`Focus + Complete Collection`維持。

Rich layer:

- title
- authors/year
- status
- summary
- 自分の研究との関係
- important result
- next reading
- question / next action

Collection layer:

- Reading / Queued / Hold
- full queueへアクセス可能

現行Paper Queueのcomplete collectionを失わない。

---

## 6.6 Knowledge Review

v5はまだ認知負荷が高いためproductionでは再構成。

### 主分類

#### 事実・記述を確認する

source上の `#workflow/knowledge-review` に相当。

表示例:

- 確認事項
- なぜ確認するか
- 確認先
- related project/entity
- state

#### 研究への適用を検討する

source上の `#workflow/research-review` に相当。

表示例:

- 検討事項
- なぜ必要か
- related project
- source paper/note

### その下

- 不確実な情報 (`Uncertain`)
- 矛盾 (`Conflict`)
- 未review backlog

Backlogは:

- Papers
- Notes
- Conversations
- Other

をfold可能にする。

### 重要

- `Explicit / Uncertain / Conflict`のsource semanticsは失わない。
- user-facing primary labelsは日本語で認知しやすくする。
- v5の「featured review」をAIが勝手にpriority扱いしない。sourceにpriority contractがないなら、単なる例/先頭項目を「最優先」と表示しない。

現行Knowledge Reviewでは明示的review taskとUncertain/backlogが既に存在するため、このworkflow semanticsをpreserveする。

---

# 7. 暮らし / Personal

Human-facing global labelは `暮らし` を第一候補。

technical stream/repository semanticsとしてPersonalを変える必要はない。

secondary nav:

- 現在地
- 案件
- ライブラリ
- 旅行

---

## 7.1 現在地

v5方向を維持:

- 優先active plansを2件程度
- 現在地
- 次の一手
- その他active plans
- dated timeline
- non-dated focus

現行Personal Pulse/Active Plansにある複数active planの情報を落とさない。

`次の一手` / `現在地` はNotion human-managed property。AI automatic writebackは導入しない。

---

## 7.2 案件

現行Active Plansのinformation contractを維持:

- status
- kind
- date
- companion
- destination
- 現在地
- 次の一手

Overviewよりcomplete active work detailを担う。

---

## 7.3 Library

production orderを以下へ修正:

1. 今見ている / 使っている
2. あとで見る
3. 最近入手
4. 検討中

semanticを混同しない:

- Reading/Watching
- Saved Content
- Shopping
- Recently acquired

Shopping intent gradientは将来候補:

- 気になる
- 本格検討
- 入手予定

現行sourceに完全なcontractがないため、schema変更は別途source audit後に決定する。

---

# 8. Travel

Travelはv5の重要reference。

## Collection

- 次の旅行 / 旅行中
- 計画中
- 最近完了

現行Trips archiveを維持。

## Detail

v3/v5相当のhigh-density detailを保持:

- Overview
- Confirmed / bookings
- transportation
- Day 1 / Day 2...
- exact times
- important times
- fallback
- day-of operational info

### Final visual delta

Trip Detail全体を一つの大きなworkspace containerとして視覚的にgroupingする。

Collection側のselected tripとDetailの関係を明示:

- selected state
- detailへscroll / transition
- 「選択中の旅行: 箱根旅行」等

### Confirmed / bookingsを固定slotにしない

Prototypeの:

- 往路
- 復路
- 宿
- ticket

という固定slotをproduction data modelへ焼き込まない。

UI/modelはrepeatable record前提:

```text
Transportation[]
Accommodation[]
ReservationOrTicket[]
```

各recordに必要となり得る例:

- date/time
- start/end
- provider / service
- reservation state
- booking reference / link
- notes
- day association

これにより:

- 複数ホテル
- 新幹線 + bus + rental car
- 複数restaurant/activity booking
- 複数ticket

に対応可能。

### Source gap

現行Personal adapterは主にNotion DB propertiesを扱うが、Travelのbooking / itinerary / fallbackはpage body側に豊富な情報がある。

Master planningでは:

- Notion page body retrieval
- deterministic section parser
- normalized Travel model
- validation / missing-field handling
- watcher fingerprint cost

を設計する必要がある可能性が高い。

Notion schemaをUI都合で無理に歪めない。

---

# 9. Investment

最重要原則:

> 現行4 HTMLのinformation contractを維持し、その前にDashboardを追加する。

現行:

- Pulse
- Positions
- Decisions
- Journal

は情報量を大幅に変えない。

Prototype UXでは:

- Dashboard
- Pulse / 要確認
- Positions / 保有
- Decisions / 判断
- Journal / 履歴

の5 destination。

canonical topologyとして5 static pagesにするかはmaster planningで判断する。

---

## 9.1 Investment Dashboard final delta

### Top

- 総資産
- attention / review

### Row: 50 / 50

#### 投資済み資産の配分

Donut。

実値:

- 広範囲Index: ¥1,354,668
- 個別株: ¥323,620
- レバレッジ商品: ¥242,358
- 貴金属: ¥189,788
- 投資済み資産合計: ¥2,110,434

denominator、%、円額を明示。

#### 上位保有銘柄

Top 5 + Other donut。

**slice / legendを1対1で完全一致させる。**

候補:

- 大和iFree NASDAQ100
- eMAXIS Slim S&P500
- TQQQ
- QQQ
- CLSK
- Other

legendには各sliceの:

- security
- %
- exact value

を表示。

### 次のRow: 50 / 50

#### 価格損益への寄与

v5のdiverging barをhalf-width化。

0 lineからpositive / negativeを表示。

このmetricがcomplete portfolio cost-basis P/Lではなく、position price P/Lである場合は誤認させない。

#### leverage-adjusted exposure

隣に別visualとして配置する候補。

### Cash / holdings split

最上位priorityではない。必要なら下位。

---

## 9.2 Investment Pulse

Job:

> quantitative dashboardではなく、今何を確認・判断するか。

### 上部

`次回確認`を強調。

例: TQQQの具体的売却量・価格・段階利確、SBI側の上限・逆指値・再評価条件。

### Action / Review

現行情報維持。

### 資産構成

barではなくdonutを第一候補。

### Top Holdings

half-width tableを廃止。

Pulseではcompact ranked list:

- rank
- security
- value
- %

詳細tableはPositionsへ。

これでv5のoverflow bugを根絶する。

### ±上位

文章列挙ではなくDashboardと同じdiverging visual grammarを使う。

Top positive/negative数件でよい。

---

## 9.3 Positions

v5/現行のtable information contractを維持。

保持:

- security
- account / brokerage
- value
- total asset %
- price P/L
- quantity
- local price
- cost
- known-cost P/L
- stance
- role

### 未反映必須修正

市場 / 商品区分でgrouping:

#### 投資信託

- 大和iFree NASDAQ100
- eMAXIS Slim S&P500

#### 日本株

- NTT

#### 米国上場

- その他US-listed holdings

group内はvalue descendingを第一候補。

### Table

- font sizeは維持
- horizontal whitespaceを削る
- numeric right-align
- column separatorsを少し明確に
- security columnを適切に広く
- 無意味に100% stretchしない
- columnsを勝手に削らない

Mobile solutionは別途responsive design。

---

## 9.4 Decisions / Journal

現行information semanticsを維持。

Decisions:

- Action / Review / Holdings / Exited
- status
- stance
- role
- value / weight / P/L
- Thesis
- Buy Criteria
- Exit Criteria
- Key Risks
- Open Questions
- Primary Source

Journal:

- unfinished / next check
- categories
- Decision
- Rationale
- Next Check
- Lesson / Note
- related securities
- date

主にvisual modernization / typography / navigation改善。

---

# 10. Home

v5方向をほぼ維持。

- 巨大NOW heroは不要
- Research: 修士論文 / CPGteam / 研究探索
- 暮らし: next / active / near-term
- Investment: total / attention / index-related info
- Live Work: Activeのみcompact projection

Home cross-domain data projectionは現行source/modelにないため、`html-share-hub`側でcompact projection contractが必要になる可能性がある。

`html-share` shell自身がNotion/Research KB/Investmentへ直接問い合わせない。

---

# 11. Motion

v5で検証したsemantic motionを参考にする。

候補:

- same-origin navigation continuity
- Research filter/reflow
- disclosure
- Personal timeline
- Plan → Travel continuity
- Travel itinerary current marker
- Investment donut sweep
- P/L diverging bars
- Live Work active indicator

要件:

- no CDN / external runtime dependency
- static semantic fallback
- `prefers-reduced-motion`
- decorative ambient animationは不要

PrototypeのJS patch implementationそのものをproductionへコピーしない。

---

# 12. Source/model/presenter impact matrix

Master planningで最低限以下を調査する。

| UI requirement | Current source | Likely production work |
|---|---|---|
| Research project purpose/current/open question/recent decision | Research KB project bodyに存在し得る | Research reader/model section extraction |
| Research Feed rich body | Digest/Paper bodyに存在 | deterministic heading extraction / model extension |
| Entity↔Project relation | 一部contextはあるがexplicit contractは未確定 | source audit → additive model/schema candidate |
| Papers rich focus | Paper bodyに存在 | reader/model extension |
| Knowledge Review workflow | 現行sourceに存在 | presenter redesign、必要ならclassification normalization |
| Personal current/next/date | Notion propertiesに存在 | presenter/UI中心 |
| Library order | sourceあり | presenter ordering |
| Shopping intent gradient | 現source不足 | future Notion schema候補、要audit |
| Travel bookings/itinerary/fallback | Notion page bodyに存在 | page-body retrieval + parser + normalized model |
| Home cross-domain summary | constituent dataは存在 | hub projection/presenter contract |
| Investment Dashboard charts | canonical Investment valuesは概ね十分 | presenter/renderer中心 |
| Investment current 4 pages | source/model十分 | information preservation + restyle |
| Live Work | operational sourceあり | visual integration / Home projection |

---

# 13. Canonical topologyは未決定

ここはmaster chatで明示的にarchitecture decisionする。

Prototype UXが15 destinationになったからといって、productionをそのまま15 static canonicalにしてはいけない。

検討軸:

1. 現行12 static canonicalを維持し、各HTML内でworkspace tabs / sectionsを表現
2. static canonicalを追加/再編
3. detail pagesだけmanaged namespace化
4. Homeをhtml-share shellのdynamic/aggregate projectionとして追加
5. Homeもhub-generated canonical outputにする
6. Travel detailのURL strategy
7. browser history / deep link / sharing policy
8. existing mobile shell / search / favorites / unreadとの統合
9. exact canonical tree validationへの影響
10. backward-compatible redirects / stale managed keys

最適解はprototypeのpage countではなくproduction constraintsから決める。

---

# 14. Implementation planningで同時に確認すべき既存features

UI redesignによって壊さない:

- owner-only / limited sharing
- Home/page list search
- favorites
- unread/new
- grouping
- browser/mobile shell
- external URL safety
- privacy allowlist
- third-party runtime request禁止
- canonical network-self-contained contract
- Performance Contract / Browser Baseline
- publication/recovery
- Personal low-latency watcher
- scheduled full refresh
- Live Work semantics
- no-op publish suppression

---

# 15. Git / runtime safety

重要変更workflow:

1. read-only diagnosis
2. architecture / root-cause determination
3. implementation
4. focused tests
5. regression tests
6. independent review
7. merge
8. trusted-host runtime verification
9. production E2E

Git禁止:

- `git reset --hard`
- `git clean`
- unrelated stash
- destructive checkout
- unrelated file deletion
- force push

sibling repoのdirty filesを保護。

branch / narrow commit / PR workflow。

trusted Windows hostでruntime/versionを確認し、system `python` を無条件に仮定しない。

`hub.ps1 refresh`はPersonal deterministic maintenance writeを伴い得るため、read-only調査時に気軽に実行しない。

---

# 16. Master planに求めるdeliverable

最終的に「実装計画master」では、UI redesignだけのimplementation promptではなく、html-shareの他の残存改善と統合した**一つのmaster roadmap**を作ってほしい。

最低限:

## A. Current-state inventory

- repo HEADs
- branches / PRs
- dirty files
- current tests / CI
- current production canonical tree
- current runtime/tasks
- existing planned improvements

## B. Workstream inventory

UI redesignを含むすべての未実装改善を列挙。

## C. Dependency graph

どの変更が:

- source
- adapter
- model
- presenter
- renderer
- shell
- validation
- publication
- runtime

へ依存するか。

## D. Architecture decisions

特に:

- canonical topology
- Home generation responsibility
- Research relation model
- Travel body extraction/model
- Investment Dashboard page strategy
- shared CSS/component strategy
- motion implementation
- browser/mobile shell integration

## E. Phased implementation

各phaseについて:

- scope
- repo
- model / reasoning effort
- preconditions
- files/modules
- tests
- migration
- acceptance
- rollback point
- production verification

を定義。

## F. Migration / compatibility

- old URLs
- manifest
- exact tree
- watcher
- no-op digest
- stale keys
- current production rollback

## G. Final production E2E

PC + mobileで:

- Home
- Research
- 暮らし
- Travel
- Investment
- Live Work
- Personal low-latency update
- scheduled refresh
- owner-only/privacy
- rollback/recovery

まで確認。

---

# 17. Master chatへ添付すべき資料

## 必須

1. **この `handoff.md`**
2. **UI Prototype v5 ZIP**
3. **`html-share / Project Reference` 最新版**
4. **現行production HTML一式**
   - Research 4
   - Personal 4
   - Investment 4
   - Live Work 1

## Master chat内ですでに十分なcontextがあるなら再添付不要

- repository paths
- prior implementation phases
- current pending improvement list
- recent PR/CI/runtime findings

## Optional

- v3 prototype ZIP  
  Travel / Investment visualizationをv5と比較する必要が生じたときだけ。
- v4 prototype ZIP  
  基本不要。v5 + handoffで十分。

v1/v2は原則不要。古いdecisionを再導入するノイズになりやすい。

---

# 18. Master chatへ送る短いメッセージ案

このhandoffは、別チャットで進めていたhtml-share UI redesign workstreamの最終引き継ぎです。

Prototype v5まで作成し、prototype iterationは終了する判断になりました。v5をそのまま実装するのではなく、`handoff.md`に記載したfinal deltaをproduction requirementsとして扱ってください。

このチャットで管理している他のhtml-share改善workstreamと統合し、まずread-onlyで現状を再確認した上で、source / adapter / model / renderer / canonical topology / shell / publication / runtimeまで含むmaster implementation planを作ってください。

特に、prototypeの15 UX destinationsをそのままproduction canonical countへ変換しないこと、現行baselineは12 static canonical + 1 operational Live Workであること、Personal watcher / publication invariants / repository responsibility separationを維持することを重視してください。

いきなり実装は開始せず、まず統合計画を提示してください。

---

# 19. 現時点での判断

UI/UX prototype phaseは終了してよい。

残っている問題は新しいvisual prototypeを作らないと判断できない問題ではなく、主に:

- architecture integration
- source/model gap
- canonical topology
- renderer design
- data normalization
- migration
- production compatibility
- implementation detail

である。

したがって次は、UI workstream単独のv6を作るのではなく、`実装計画master`へ統合してproduction implementation planを作る。

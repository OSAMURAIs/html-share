# Information preservation matrix — v5

判定の原則は、Overviewで常時表示しない情報もdetail / collectionで到達できれば `Preserved` とすること。fixtureだけで補った情報は `Conceptual / enriched` と明記する。

| Current information | v5 result | Location / treatment | Status |
|---|---|---|---|
| Research project Active / Waiting / Blocked | project state rows | Research Overview / Home | Preserved |
| 修士論文のdefinition・goal・current・NEXT | project surface | Research Overview | Preserved |
| CPGteamの主要task + `+3件`相当 | 主要5件 + disclosure | Research Overview | Preserved |
| Research exploration summary | Digest / Paper / Review / Knowledge concrete items | Home / Research Overview | Preserved / enriched fixture |
| Digestの日付batch | 8/24・8/19・過去batch | Research Feed | Preserved |
| DigestのarXiv候補全件へのアクセス | batch / Paper collection導線 | Research Feed / Papers | Preserved |
| Digestのtitle /本文要約/関係/確認事項 | rich card | Research Feed | Enriched fixture |
| Paper Reading / Queued / Hold | lifecycle filter + counts | Papers | Preserved |
| Paper Queue 44件 | searchable compact table | Papers | Preserved |
| Important Paperのsummary / relation / result / next | rich focus cards | Papers | Preserved / enriched wording |
| Knowledge Review Explicit / Uncertain / Conflict | summary + focus | Knowledge Review | Preserved |
| Knowledge Review Explicit 18件 | focus list + backlog access | Knowledge Review | Preserved |
| Unreviewed 84件のkind内訳 | Papers 58 / Notes 14 / Conversations 12 / Other 0 | Knowledge Review | Preserved |
| backlog全件への到達 | kind disclosure + remaining marker | Knowledge Review | Preserved |
| Personal active plans 3件 | priority + all plan cards | Personal 現在地 / 案件 | Preserved |
| Plan title/status/kind/date/companion/destination | plan facts | 案件 | Preserved |
| Plan current / next | readable long copy | 現在地 / 案件 | Preserved |
| Travel collection: 箱根 / 広島 / 高知 | collection rows | 旅行 | Preserved |
| Travel detail overview / bookings / transportation / itinerary | confirmed facts + Day 1 / Day 2 operational itinerary | 旅行 | Preserved / sanitized fixture |
| Travel important times / fallback | operational facts + timeline | 旅行 | Preserved / sanitized fixture |
| Library reading / watching | Active surface | Library | Preserved |
| Library shopping | shopping surface | Library | Preserved |
| Library recently acquired | acquired surface | Library | Preserved |
| Library saved / unstarted | saved surface | Library | Preserved |
| Library intent gradient | conceptual labels | Library | Conceptual fixture |
| Investment total / holdings / cash | KPI + total/cash donut | Dashboard / Pulse / Home | Preserved |
| Investment allocation | sum-checked donut with yen / % / denominator | Dashboard / Pulse | Preserved |
| Investment leverage exposure | explicit rows / 2x・3x / source values | Pulse / Dashboard | Preserved |
| Investment top positions / P/L contributors | Top 5 + Other donut / exact list / diverging position price P/L bars | Dashboard / Pulse | Preserved |
| Investment Data Quality / Freshness | visible WARN + foldable detail | Pulse | Preserved |
| Security Summary | full table | Positions | Preserved |
| Position detail: broker/account/value/weight/P&L/quantity/price/cost/policy/role | full wide table | Positions | Preserved |
| Decisions Action / Review / Holdings / Exited | index + status chips | Decisions | Preserved |
| Decision Thesis / Buy / Exit / Risks / Questions / Primary Source | readable decision cards | Decisions | Preserved |
| Journal unfinished / next check | prominent open card | Journal / Pulse | Preserved |
| Journal categories and entry fields | category + chronology cards | Journal | Preserved |
| Live Work Active / Recent / History | separate operational surface | Live Work | Preserved |
| Live Work repo/agent/status/current/next/completed/events/timestamps | active side facts + recent rows | Live Work | Preserved |
| v3 title-only large hero | removed | concrete data starts earlier | Deliberately removed |
| v3 fake Investment values and fake trend | removed | current source values; no history chart | Deliberately removed |
| source path / commit SHA always visible | not shown by default | not useful for human overview; source semantics remain in docs/fixture | Deliberately removed from chrome |

## 消した情報について

有用なsource情報を視認性のためだけに削ったものはない。常時表示からdetailへ移したものは、Paper path、レビューbacklogの全item、Investmentのquality warning detail、Live Work Historyである。これらはsurfaceを圧迫しないよう折りたたみ・検索・横スクロールへ移したが、到達経路は残している。

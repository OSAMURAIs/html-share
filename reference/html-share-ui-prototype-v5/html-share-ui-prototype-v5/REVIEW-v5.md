# Review v5

## Review 1 — requirements

- ORBIT is clearly marked as a provisional prototype name; source repositories and production are untouched.
- Global navigation is ホーム / 研究 / 暮らし / 投資. The Living secondary navigation remains visible on Travel.
- Research separates the two Projects from 研究探索. Feed filters use Project relation semantics, including 複数関連 and Project関連なし.
- Living puts 龍宮城スパ and ふるさと納税 at equal priority and retains other plans, dated plans, and expandable continuing items.
- Travel combines the v4 collection with v3-level booking, exact-time, transport, itinerary, critical-time, and fallback detail.
- Allocation uses the supplied values and sums to ¥2,110,434. Dashboard includes Top 5 + Other and a clearly qualified diverging position price P/L chart.
- Existing Papers, Knowledge Review, Plans, Library, Positions, Decisions, Journal, and Live Work destinations remain available and retain their v4 complete-collection structures.

## Review 2 — desktop and mobile

Static responsive review checked the 1280px and 390px breakpoints: standard body and table copy is 14–15px; headings are 22–34px. Tables retain their columns, use right-aligned numeric values, and scroll horizontally only where their data contract requires it.

At 390px, research cards and priority plans stack, Travel’s itinerary stays a vertical timeline, collection tables remain reachable by horizontal scroll, and ongoing Living items use expansion rather than nested scroll. The supplied cloud browser cannot connect to this workspace’s local static server, so a live screenshot capture is not included in this artifact.

## Review 3 — first impression

The first screen identifies the four domains without a large abstract hero. Research makes the Project / exploration boundary explicit. Living shows more than one active commitment. The Travel page is credible as an on-trip reference because the return deadline, confirmed legs, and fallback choices are all visible. The investment dashboard communicates both its denominator and the non-aggregate nature of its P/L chart.

## Motion check

Motion is tied to semantic change: Feed filtering reflows candidates, itinerary lines draw the travel sequence, traveling mode reveals the next move, and allocation / P-L charts reveal their quantities. `prefers-reduced-motion` disables these transitions.

---
name: create-html
description: Create a polished, self-contained, responsive HTML briefing from notes, research, comparisons, plans, or reports. Use when the user asks to turn content into a readable HTML page, visual brief, dashboard, comparison, timeline, or shareable report, including Japanese requests such as 「見やすいHTMLにして」 or 「HTMLでまとめて」.
---

# Create HTML

Turn the user's content into one complete HTML file that is calm, readable, and ready to share. Keep the information primary; styling should make the structure easier to scan.

## Workflow

1. Confirm the source material, audience, and purpose from the conversation and local files. Do not invent facts to fill empty sections.
2. Decide the information structure before styling. Prefer a short narrative, comparison table, timeline, or paired question-and-answer layout over a grid of generic cards. Read [layout-patterns.md](references/layout-patterns.md) when the page has multiple content types.
3. Copy [brief-template.html](assets/brief-template.html) as the starting point. Remove unused components and replace every `{{PLACEHOLDER}}`.
4. Write a single self-contained `.html` file. Keep CSS and any small SVG illustrations inline. Do not require a build step, JavaScript framework, CDN, external font, or analytics.
5. Verify the content and public-safety boundary before presenting or publishing it.
6. Check the rendered page at desktop width and around 390 px. Fix overflow, awkward wrapping, tiny text, and excessive empty space.

## Design contract

- Use light mode with deep blue as the base, neutral white surfaces, and gold as the only accent.
- Reserve the blue gradient for the hero, section markers, and table headers. Do not fill every component with gradients.
- Keep the main content at about 940 px, body text at least 16 px, and line height around 1.8.
- Use Japanese system fonts first: `-apple-system`, `BlinkMacSystemFont`, `"Hiragino Sans"`, `"Yu Gothic UI"`, `sans-serif`.
- Give each section one clear message. Use cards only for genuinely independent facts or metrics.
- Make tables horizontally scrollable inside their own container; never let the page itself scroll sideways.
- Use semantic headings in order, visible focus styles, sufficient color contrast, and descriptive link text.
- Keep decorative icons minimal. Prefer CSS shapes or inline SVG to emoji-heavy decoration.

## Required checks

Before delivery:

- Search for unresolved placeholders with `rg -n '\{\{[A-Z0-9_]+\}\}' <file>`.
- Confirm the file has `<!doctype html>`, `lang`, UTF-8, viewport metadata, and `robots` set to `noindex, nofollow`.
- Confirm there are no secrets, credentials, private URLs, real IP allowlists, personal data, customer names, or internal-only identifiers unless the user explicitly supplied and authorized them for this output.
- Treat `noindex` and a hard-to-guess URL as discovery controls only, never as access control.
- Confirm images have useful `alt` text, links work, and `scrollWidth` does not exceed the viewport.

If the user also asks to share or publish the result, complete the HTML first, show any generated image for review, then use the repository's sharing workflow.

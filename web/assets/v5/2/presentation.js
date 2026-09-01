/*
 * html-share v5 presentation profile 2 — progressive enhancement only.
 *
 * The document is fully meaningful and correctly laid out with no JS at all
 * (see shell.css). Everything here is additive: it must never be required to
 * reconstruct or complete the page.
 */
(() => {
  "use strict";

  // Embedded vs standalone is a pure cosmetic refinement (tighter top
  // padding, since the shell's own domain-nav bar already sits above the
  // iframe) — never a structural difference. See shell.css.
  try {
    var embedded = window.top !== window.self;
    document.documentElement.setAttribute("data-html-share-frame", embedded ? "embedded" : "standalone");
  } catch (error) {
    // Cross-origin access to window.top throws in some sandboxed embeds.
    // Standalone is the safe default: it is the more generous spacing, not a
    // missing one.
    document.documentElement.setAttribute("data-html-share-frame", "standalone");
  }

  // <details> disclosures get a small open/close affordance; the element is
  // fully usable with none of this, native <details> semantics already work.
  document.querySelectorAll(".v5-disclosure").forEach((node) => {
    node.addEventListener("toggle", () => {
      node.classList.toggle("is-open", node.open);
    });
  });
})();

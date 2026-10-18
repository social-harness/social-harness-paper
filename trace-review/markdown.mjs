/** @fileoverview GFM rendering with safe links and consistent trace citations. */
import { Marked } from "./vendor/marked.esm.js";

/** @param {*} value @return {string} */
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

/** @param {string} href @return {?string} */
function safeHref(href) {
  try {
    const url = new URL(href, "https://trace-review.invalid/");
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

/** @param {string} href @return {?string} */
export function citationLabel(href) {
  const message = /\/message-([QP]?\d+)$/.exec(href);
  if (message) return /^\d/.test(message[1]) ? "M" + message[1] : message[1];
  const document = /\/(instructions|calendar)-([a-z-]+)$/.exec(href);
  if (document) {
    const name = document[2].charAt(0).toUpperCase() + document[2].slice(1);
    return (
      (document[1] === "instructions" ? "Instructions: " : "Calendar: ") + name
    );
  }
  if (/\/run-\d+$/.test(href)) return "Run";
  if (href === "setup.md") return "Setup";
  return null;
}

/** @param {string} releaseViewer @param {number=} headingOffset
 * @return {function(string): string} */
export function createMarkdownRenderer(releaseViewer, headingOffset = 1) {
  const markdown = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      html({ text }) {
        return escapeHtml(text);
      },
      image({ text }) {
        return escapeHtml(text);
      },
      heading({ tokens, depth }) {
        const level = Math.min(6, depth + headingOffset);
        return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>`;
      },
      link({ href, tokens }) {
        const label = this.parser.parseInline(tokens);
        const safe = safeHref(href);
        if (safe === null) return label;
        const target = escapeHtml(safe);
        if (href !== "setup.md" && !href.startsWith(releaseViewer + "#")) {
          return `<a href="${target}" rel="noopener">${label}</a>`;
        }
        const canonical = citationLabel(href);
        if (!canonical) return `<a href="${target}">${label}</a>`;
        // Preserve prose in legacy reports; only the citation is normalized.
        const prefix = label === escapeHtml(canonical) ? "" : label + " ";
        return (
          prefix +
          `<a class="evidence-citation" data-evidence-link ` +
          `href="${target}" title="Open ${escapeHtml(canonical)}">` +
          `[${escapeHtml(canonical)}]</a>`
        );
      },
    },
  });
  return (source) => markdown.parse(source);
}

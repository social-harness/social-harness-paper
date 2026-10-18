/** @fileoverview Final summaries and linked evidence in the native run viewer. */
import { createMarkdownRenderer } from "./markdown.mjs";
import {
  REPORT_VIEWER,
  decodeCases,
  outcomeLabel,
  referenceTarget,
  resolveRecord,
  snapshotPath,
} from "./data.mjs";

const $ = (id) => root?.querySelector(`#${id}`);
const renderMarkdown = createMarkdownRenderer(REPORT_VIEWER);
const mobile = matchMedia("(max-width: 999px)");
const files = new Map();
const reports = new Map();
const EXPERIMENTS = {
  E1: "Direct messages",
  E2: "Shared context",
  E3: "Multicast",
  E4: "Stalling",
  E5: "Manipulation",
  E6: "Malicious goals",
};
let cases = [];
let root = null;
let activeCase = null;
let generation = 0;
let returnFocus = null;

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

function name(value) {
  return String(value ?? "")
    .replace(/-agent$/, "")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function textFile(url) {
  if (!files.has(url)) {
    files.set(
      url,
      fetch(new URL(url, import.meta.url), { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`Could not load ${url}.`);
          return response.text();
        })
        .catch((error) => {
          files.delete(url);
          throw error;
        }),
    );
  }
  return files.get(url);
}

async function jsonFile(url) {
  return JSON.parse(await textFile(url));
}

function fullTraceHref(item, target = "") {
  return `#${item.runId}${target && target !== "run" ? "/" + target : ""}`;
}

function routeHref(item, target = "") {
  return `#${item.runId}/summary${target ? "/" + target : ""}`;
}

function readRoute() {
  const [conditionId, runName, section, target = "", ...rest] = location.hash
    .slice(1)
    .split("/");
  return {
    item: cases.find(
      (item) =>
        item.runId === `${conditionId}/${runName}` &&
        item.caseId === root?.dataset.caseId,
    ),
    target,
    valid: section === "summary" && rest.length === 0,
  };
}

function setMarkdown(element, source, item) {
  element.innerHTML = renderMarkdown(source);
  for (const link of element.querySelectorAll("a")) {
    const target = referenceTarget(item, link.getAttribute("href"));
    if (target === "setup") {
      link.remove();
      continue;
    }
    if (!target) {
      link.replaceWith(...link.childNodes);
      continue;
    }
    link.href = routeHref(item, target);
    link.dataset.evidenceTarget = target;
  }
  for (const table of element.querySelectorAll("table")) {
    const wrapper = document.createElement("div");
    wrapper.className = "table-scroll";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", "Scrollable evidence table");
    table.replaceWith(wrapper);
    wrapper.append(table);
  }
}

async function reportFor(item) {
  if (!reports.has(item.caseId)) {
    reports.set(
      item.caseId,
      Promise.all([
        textFile(`${item.caseId}.revised.md`),
        jsonFile(`cases/${item.caseId}/revised-completion.json`),
      ])
        .then(([source, completion]) => {
          if (completion.status !== "complete")
            throw new Error("The final summary is not ready.");
          const [story] = source.split(/^## Review changes\s*$/m);
          const title =
            /^# (.+)$/m.exec(story)?.[1] ??
            `${EXPERIMENTS[item.experiment]} · ${outcomeLabel(item)}`;
          return {
            story,
            title,
            humanReview: completion.humanReview,
            llmReview: completion.llmReview,
          };
        })
        .catch((error) => {
          reports.delete(item.caseId);
          throw error;
        }),
    );
  }
  return reports.get(item.caseId);
}

function closeEvidence(restoreFocus = true) {
  if ($("evidence")?.open) $("evidence").close();
  for (const link of root?.querySelectorAll('[aria-current="true"]') ?? []) {
    link.removeAttribute("aria-current");
  }
  if (restoreFocus && returnFocus?.isConnected)
    returnFocus.focus({ preventScroll: true });
}

function showEvidence() {
  if (!$("evidence").open) {
    const y = window.scrollY;
    if (mobile.matches) $("evidence").showModal();
    else $("evidence").show();
    window.scrollTo(0, y);
    if (!mobile.matches && returnFocus?.isConnected)
      returnFocus.focus({ preventScroll: true });
  }
  fitEvidence();
}

function fitEvidence() {
  if (!root?.isConnected || !$("evidence")?.open) return;
  $("evidence").style.maxHeight = mobile.matches
    ? ""
    : `${Math.max(180, innerHeight - $("evidence").getBoundingClientRect().top - 16)}px`;
}

function navigate(item, target = "", origin = null) {
  history.replaceState({ scrollY: window.scrollY }, "", location.href);
  history.pushState(
    { scrollY: item === activeCase ? window.scrollY : 0 },
    "",
    routeHref(item, target),
  );
  if (origin) returnFocus = origin;
  void renderRoute();
}

function messageNavigation(item, reference, references) {
  const messages = references.filter((entry) => entry.kind === reference.kind);
  const index = messages.indexOf(reference);
  return (
    `<nav class="message-navigation" aria-label="Adjacent ${reference.kind === "message" ? "messages" : "principal messages"}">` +
    [-1, 1]
      .map((offset) => {
        const next = messages[index + offset];
        return (
          `<button type="button" data-message-direction="${offset}" ${next ? `data-evidence-target="${escapeHtml(referenceTarget(item, next.viewerUrl))}"` : "disabled"}>` +
          `${offset < 0 ? "← Previous" : "Next →"}</button>`
        );
      })
      .join("") +
    "</nav>"
  );
}

async function evidenceHtml(item, target) {
  const index = await jsonFile(`cases/${item.caseId}/sources.json`);
  const matches = index.references.filter(
    (reference) => referenceTarget(item, reference.viewerUrl) === target,
  );
  if (!matches.length)
    throw new Error("This citation is not in this run’s source index.");
  const reference = matches[0];
  if (reference.kind === "run") {
    return {
      title: "Run overview",
      html: `<p>${escapeHtml(outcomeLabel(item))}</p><p>${escapeHtml(item.messages)} agent-to-agent messages.</p><p>Explore the complete conversation, calendars, and personas in the full trace viewer below.</p>`,
    };
  }
  if (reference.kind === "message" || reference.kind === "principal") {
    const source =
      reference.kind === "message"
        ? "result/transcript.json"
        : reference.source;
    const url = snapshotPath(item, index.sources, source);
    const record = resolveRecord(await jsonFile(url), reference);
    const sender =
      reference.kind === "message"
        ? name(record.sender?.name ?? record.sender?.id)
        : reference.reference.startsWith("Q")
          ? "Principal"
          : name(record.agent);
    const recipients =
      reference.kind === "message"
        ? record.recipients
            .map((recipient) => name(recipient.name ?? recipient.id))
            .join(", ")
        : reference.reference.startsWith("Q")
          ? name(record.agent)
          : "Principal";
    const category =
      reference.kind === "message"
        ? "Message"
        : reference.reference.startsWith("Q")
          ? "Principal request"
          : "Principal reply";
    return {
      title: `${reference.label} · ${category}`,
      message: record.text,
      html:
        messageNavigation(item, reference, index.references) +
        `<p class="message-meta">${escapeHtml(sender)} → ${escapeHtml(recipients)}</p>` +
        "<div data-message-content></div>",
    };
  }
  const documents = await Promise.all(
    matches.map(async (entry) => {
      const url = snapshotPath(item, index.sources, entry.source);
      return { source: entry.source, text: await textFile(url) };
    }),
  );
  // Keep both frozen states. Present the final calendar first, without merging it.
  documents.sort(
    (a, b) =>
      Number(b.source.startsWith("result/")) -
      Number(a.source.startsWith("result/")),
  );
  return { title: reference.label, documents };
}

async function renderEvidence(item, target, token) {
  const focusedDirection = document.activeElement?.dataset.messageDirection;
  showEvidence();
  $("evidence-title").textContent = "Loading evidence…";
  $("evidence-body").textContent = "Loading the original source…";
  $("evidence-body").setAttribute("aria-busy", "true");
  $("evidence-full-trace").href = fullTraceHref(item, target);
  for (const link of root.querySelectorAll("[data-evidence-target]")) {
    if (link.dataset.evidenceTarget === target)
      link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }
  try {
    const evidence = await evidenceHtml(item, target);
    if (token !== generation) return;
    $("evidence-title").textContent = evidence.title;
    if (evidence.markdown)
      setMarkdown($("evidence-body"), evidence.markdown, item);
    else if (evidence.documents) {
      $("evidence-body").replaceChildren();
      const finalCalendar = evidence.documents.find((entry) =>
        entry.source.startsWith("result/calendars/"),
      );
      const log = finalCalendar?.text
        .split(/^## Log[ \t]*\r?$/m)[1]
        ?.split(/^## /m)[0]
        ?.trim();
      if (log) {
        const changes = document.createElement("section");
        setMarkdown(changes, "## Recorded booking log\n\n" + log, item);
        $("evidence-body").append(changes);
      }
      for (const document of evidence.documents) {
        const calendar = document.source.includes("/calendars/");
        const initial = document.source.startsWith("inputs/");
        const section = window.document.createElement("section");
        setMarkdown(section, document.text, item);
        if (calendar) {
          const disclosure = window.document.createElement("details");
          disclosure.open = !initial && !log;
          const summary = window.document.createElement("summary");
          summary.textContent = initial
            ? "Starting calendar"
            : "Final calendar";
          disclosure.append(summary, section);
          $("evidence-body").append(disclosure);
        } else $("evidence-body").append(section);
      }
    } else {
      $("evidence-body").innerHTML = evidence.html;
      if (typeof evidence.message === "string") {
        setMarkdown(
          $("evidence-body").querySelector("[data-message-content]"),
          evidence.message,
          item,
        );
      }
    }
  } catch (error) {
    if (token !== generation) return;
    $("evidence-title").textContent = "Evidence could not load";
    $("evidence-body").innerHTML =
      `<p class="error">${escapeHtml(error.message)}</p><button type="button" data-retry>Try again</button>`;
  }
  if (token === generation) {
    $("evidence-body").removeAttribute("aria-busy");
    $("evidence-body").scrollTop = 0;
    fitEvidence();
    if (focusedDirection) {
      const button = $("evidence-body").querySelector(
        `[data-message-direction="${focusedDirection}"]`,
      );
      (button && !button.disabled ? button : $("close-evidence")).focus({
        preventScroll: true,
      });
    }
  }
}

async function renderRoute() {
  if (!root?.isConnected || root.hidden) return;
  const token = ++generation;
  const { item, target: requestedTarget, valid } = readRoute();
  const target = requestedTarget === "setup" ? "" : requestedTarget;
  if (!item || !valid) {
    closeEvidence(false);
    $("notice").hidden = false;
    $("notice").textContent = "That summary is not available for this run.";
    root.querySelector(".reading-layout").hidden = true;
    return;
  }
  $("notice").hidden = true;
  if (requestedTarget === "setup") {
    history.replaceState(history.state, "", routeHref(item));
  }
  root.querySelector(".reading-layout").hidden = false;
  if (
    item !== activeCase ||
    $("story").dataset.failed === "true" ||
    $("story").getAttribute("aria-busy") === "true"
  ) {
    closeEvidence(false);
    activeCase = item;
    returnFocus = null;
    $("story").setAttribute("aria-busy", "true");
    $("story").textContent = "Loading the final summary…";
    try {
      const report = await reportFor(item);
      if (token !== generation) return;
      setMarkdown($("story"), report.story, item);
      if (!/^# /m.test(report.story)) {
        const heading = document.createElement("h2");
        heading.textContent = report.title;
        $("story").prepend(heading);
      }
      if (report.humanReview === "pending") {
        const status = document.createElement("p");
        status.className = "review-status";
        status.textContent =
          report.llmReview === "complete"
            ? "LLM-checked summary · Human review pending"
            : "Human review pending";
        $("story").prepend(status);
      }
      delete $("story").dataset.failed;
    } catch (error) {
      if (token !== generation) return;
      $("story").dataset.failed = "true";
      $("story").innerHTML =
        `<p class="error">${escapeHtml(error.message)}</p><button type="button" data-retry>Try again</button>`;
    }
    $("story").removeAttribute("aria-busy");
  }
  if (token !== generation) return;
  if (typeof history.state?.scrollY === "number") {
    window.scrollTo(0, history.state.scrollY);
  }
  if (target) {
    if (!returnFocus) {
      returnFocus =
        [...$("story").querySelectorAll("[data-evidence-target]")].find(
          (link) => link.dataset.evidenceTarget === target,
        ) ?? $("story");
      if (!history.state && returnFocus !== $("story")) {
        returnFocus.scrollIntoView({ block: "center" });
      }
    }
    await renderEvidence(item, target, token);
  } else closeEvidence();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("evidence")?.open && !mobile.matches)
    navigate(activeCase);
});
document.addEventListener("click", (event) => {
  if (!root?.isConnected || root.hidden || !(event.target instanceof Element))
    return;
  const target = event.target.closest(
    "[data-evidence-target], [data-retry], #close-evidence",
  );
  if (
    !target ||
    !root.contains(target) ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  if (target.id === "close-evidence") {
    navigate(activeCase);
    return;
  }
  if (target.hasAttribute("data-retry")) {
    files.clear();
    reports.delete(activeCase.caseId);
    void renderRoute();
  } else
    navigate(
      activeCase,
      target.dataset.evidenceTarget,
      target.closest("#evidence") ? null : target,
    );
});
mobile.addEventListener("change", () => {
  if (!$("evidence")?.open) return;
  $("evidence").close();
  showEvidence();
});
let fitScheduled = false;
function scheduleFit() {
  if (fitScheduled) return;
  fitScheduled = true;
  requestAnimationFrame(() => {
    fitScheduled = false;
    fitEvidence();
  });
}
addEventListener("scroll", scheduleFit, { passive: true });
addEventListener("resize", scheduleFit);

/** Close pending evidence when the native viewer leaves this summary. */
export function hideSummary() {
  ++generation;
  closeEvidence(false);
}

/** Render a final summary inside the native viewer's existing run shell. */
export async function renderSummary(element, caseId) {
  if (root !== element) {
    hideSummary();
    root = element;
    activeCase = null;
    returnFocus = null;
    root.dataset.caseId = caseId;
    root.innerHTML = `
      <p id="notice" role="status" hidden></p>
      <div class="reading-layout">
        <article id="story" class="markdown story" tabindex="-1" aria-label="Trace summary" aria-busy="true">
          <p class="muted">Loading the final summary…</p>
        </article>
        <div class="evidence-slot">
          <dialog id="evidence" aria-labelledby="evidence-title">
            <header class="evidence-header">
              <h2 id="evidence-title">Evidence</h2>
              <button id="close-evidence" class="close-evidence" type="button" aria-label="Close evidence" title="Close evidence">×</button>
            </header>
            <div id="evidence-body" class="evidence-body markdown" aria-live="polite"></div>
            <footer class="evidence-footer">
              <a id="evidence-full-trace" target="_blank" rel="noopener">Open in full trace ↗</a>
            </footer>
          </dialog>
        </div>
      </div>`;
    $("evidence").addEventListener("cancel", (event) => {
      event.preventDefault();
      navigate(activeCase);
    });
  }
  if (!document.querySelector("[data-summary-styles]")) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = new URL("styles.css", import.meta.url).href;
    stylesheet.dataset.summaryStyles = "";
    document.head.append(stylesheet);
  }
  try {
    if (!cases.length) cases = decodeCases(await jsonFile("manifest.json"));
    if (root !== element || !element.isConnected || element.hidden) return;
    await renderRoute();
  } catch (error) {
    if (root !== element || !element.isConnected || element.hidden) return;
    $("story").removeAttribute("aria-busy");
    $("story").innerHTML =
      `<p class="error">${escapeHtml(error.message)}</p><p>Reload this page to try again.</p>`;
  }
}

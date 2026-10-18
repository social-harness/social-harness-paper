/** @fileoverview Identity-preserving helpers for frozen trace-review inputs. */

export const REPORT_VIEWER = "../../../release/index.html";

export function decodeCases(manifest) {
  if (!Array.isArray(manifest?.cases) || !manifest.cases.length) {
    throw new Error("The story manifest has no cases.");
  }
  const ids = new Set();
  const runs = new Set();
  for (const item of manifest.cases) {
    if (
      typeof item?.caseId !== "string" ||
      typeof item?.runId !== "string" ||
      !/^[a-z0-9][a-z0-9_-]*$/i.test(item?.caseId ?? "") ||
      !/^[a-z0-9-]+\/run-\d+$/i.test(item?.runId ?? "") ||
      typeof item.publishedPass !== "boolean" ||
      ![
        "every student booked",
        "group coordinated",
        "attack succeeded",
      ].includes(item.passMeans) ||
      ids.has(item.caseId) ||
      runs.has(item.runId)
    ) {
      throw new Error(
        "The story manifest contains an invalid or repeated case.",
      );
    }
    ids.add(item.caseId);
    runs.add(item.runId);
  }
  return manifest.cases;
}

export function outcomeLabel(item) {
  if (item.passMeans === "attack succeeded") {
    return item.publishedPass ? "Attack succeeded" : "Attack failed";
  }
  if (item.passMeans === "every student booked") {
    return item.publishedPass
      ? "All students booked"
      : "Not all students booked";
  }
  return item.publishedPass ? "Group coordinated" : "Group not coordinated";
}

/** Resolve only references belonging to this exact run, not a similar run ID. */
export function referenceTarget(item, viewerUrl) {
  if (viewerUrl === "setup.md") return "setup";
  const base = `${REPORT_VIEWER}#${item.runId}`;
  if (viewerUrl === base) return "run";
  if (!viewerUrl.startsWith(base + "/")) return null;
  const target = viewerUrl.slice(base.length + 1);
  return /^(message-(?:[QP]?\d+)|(?:calendar|instructions)-[a-z-]+)$/.test(
    target,
  )
    ? target
    : null;
}

/** The reference's sourceIndex is authoritative; M numbers are display order. */
export function resolveRecord(records, reference) {
  if (
    !Array.isArray(records) ||
    !Number.isInteger(reference.sourceIndex) ||
    reference.sourceIndex < 0
  )
    throw new Error("Invalid evidence index.");
  const record = records[reference.sourceIndex];
  if (
    !record ||
    typeof record.text !== "string" ||
    (reference.kind === "message" &&
      record.messageId !== reference.messageId) ||
    (reference.kind === "principal" &&
      (record.agent !== reference.agent || record.key !== reference.key))
  ) {
    throw new Error("The evidence does not match the cited record.");
  }
  return record;
}

export function snapshotPath(item, sources, relative) {
  if (
    !/^(inputs|result)\/[a-z0-9/_.-]+$/i.test(relative) ||
    relative.split("/").includes("..")
  )
    throw new Error("Invalid source path.");
  const snapshot = `cases/${item.caseId}/source/${relative}`;
  const released = `../runs/${item.runId}/${relative}`;
  const source = sources.find(
    (entry) => entry.snapshot === snapshot || entry.snapshot === released,
  );
  if (!source) {
    throw new Error("This source is not part of the frozen case.");
  }
  return source.snapshot;
}

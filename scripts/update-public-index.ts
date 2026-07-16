import { readFile, writeFile } from "node:fs/promises";

import { normalizeXkcdRecord } from "../src/lib/normalize.ts";
import type { ComicRecord, XkcdRawComic } from "../src/lib/types.ts";
import {
  DEFAULT_DELAY_MS,
  createRequestGate,
  fetchCurrentXkcd,
  fetchExplainXkcdPage,
  fetchJson,
  parseArgs,
} from "./lib/corpus.ts";
import { formatPublicRecords, publicRecordChangeLabel } from "./lib/public-index.ts";

const DEFAULT_SEARCH_INDEX = "public/search-index.json";
const DEFAULT_RECENT_COUNT = 10;

type UpdateChangeType = "added" | "updated";
type UpdateHitType = "miss" | "new-comics" | "recent-metadata" | "mixed";

interface UpdateChange {
  num: number;
  title: string;
  type: UpdateChangeType;
}

interface UpdateSummary {
  currentNum: number;
  targetCount: number;
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  changed: boolean;
  hitType: UpdateHitType;
  changes: UpdateChange[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = String(args.get("output") ?? DEFAULT_SEARCH_INDEX);
  const summaryJsonPath = optionalString(args.get("summary-json"));
  const delayMs = Number.parseInt(String(args.get("delay-ms") ?? DEFAULT_DELAY_MS), 10);
  const recentCount = Number.parseInt(String(args.get("recent-count") ?? DEFAULT_RECENT_COUNT), 10);
  const records = await readPublicRecords(outputPath);
  const recordsByNum = new Map(records.map((record) => [record.num, record]));
  const current = await fetchCurrentXkcd();
  const currentNum = Number(current.num);
  const targets = resolveTargets(records, currentNum, recentCount);
  const gate = createRequestGate(delayMs);
  const changes: UpdateChange[] = [];
  let unchanged = 0;
  let skipped = 0;

  if (targets.length === 0) {
    console.log(`No update targets; current xkcd is #${currentNum}.`);
    await writeUpdateSummary(summaryJsonPath, {
      currentNum,
      targetCount: 0,
      added: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      changed: false,
      hitType: "miss",
      changes: [],
    });
    return;
  }

  console.log(`Refreshing ${targets.length} public records through xkcd #${currentNum}.`);

  for (const num of targets) {
    const previous = recordsByNum.get(num);
    const xkcd = num === currentNum ? current : await fetchXkcd(num, gate);
    const explain = await fetchExplainXkcdPage(num, gate).catch((error) => {
      console.warn(`explainxkcd ${num} skipped: ${formatError(error)}`);
      return null;
    });
    const normalized = normalizeXkcdRecord(xkcd, explain);

    if (!normalized) {
      console.warn(`xkcd ${num} did not normalize to a public record.`);
      skipped += 1;
      continue;
    }

    const next = preserveExistingCommunityTranscript(toPublicRecord(normalized), previous);

    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      recordsByNum.set(num, next);
      const type = publicRecordChangeLabel(previous).toLowerCase() as UpdateChangeType;
      changes.push({ num, title: next.title, type });
      console.log(`${publicRecordChangeLabel(previous)} #${num} ${next.title}`);
    } else {
      unchanged += 1;
      console.log(`Unchanged #${num} ${next.title}`);
    }
  }

  const summary = createUpdateSummary(currentNum, targets.length, unchanged, skipped, changes);

  await writeUpdateSummary(summaryJsonPath, summary);

  if (!summary.changed) {
    console.log("Public search index already up to date.");
    return;
  }

  const nextRecords = Array.from(recordsByNum.values()).sort((a, b) => a.num - b.num);

  await writeFile(outputPath, formatPublicRecords(nextRecords));
  console.log(`Wrote ${nextRecords.length} records to ${outputPath}`);
}

function createUpdateSummary(
  currentNum: number,
  targetCount: number,
  unchanged: number,
  skipped: number,
  changes: UpdateChange[],
): UpdateSummary {
  const added = changes.filter((change) => change.type === "added").length;
  const updated = changes.filter((change) => change.type === "updated").length;

  return {
    currentNum,
    targetCount,
    added,
    updated,
    unchanged,
    skipped,
    changed: changes.length > 0,
    hitType: hitType(added, updated),
    changes,
  };
}

function hitType(added: number, updated: number): UpdateHitType {
  if (added > 0 && updated > 0) return "mixed";
  if (added > 0) return "new-comics";
  if (updated > 0) return "recent-metadata";
  return "miss";
}

async function writeUpdateSummary(
  filePath: string | null,
  summary: UpdateSummary,
): Promise<void> {
  if (!filePath) {
    return;
  }

  await writeFile(filePath, `${JSON.stringify(summary, null, 2)}\n`);
}

function resolveTargets(records: ComicRecord[], currentNum: number, recentCount: number): number[] {
  const latestPublished = Math.max(0, ...records.map((record) => record.num));
  const targets = new Set<number>();

  for (let num = latestPublished + 1; num <= currentNum; num += 1) {
    targets.add(num);
  }

  const recentStart = Math.max(1, currentNum - Math.max(0, recentCount) + 1);

  for (let num = recentStart; num <= currentNum; num += 1) {
    targets.add(num);
  }

  return Array.from(targets).sort((a, b) => a - b);
}

async function readPublicRecords(filePath: string): Promise<ComicRecord[]> {
  return JSON.parse(await readFile(filePath, "utf8")) as ComicRecord[];
}

async function fetchXkcd(
  num: number,
  gate: ReturnType<typeof createRequestGate>,
): Promise<XkcdRawComic> {
  await gate.wait("xkcd");
  return fetchJson<XkcdRawComic>({
    url: `https://xkcd.com/${num}/info.0.json`,
    label: `xkcd ${num}`,
  });
}

function preserveExistingCommunityTranscript(
  next: ComicRecord,
  previous?: ComicRecord,
): ComicRecord {
  if (next.communityTranscript || !previous?.communityTranscript) {
    return next;
  }

  return {
    ...next,
    communityTranscript: previous.communityTranscript,
    sourceFlags: Array.from(new Set([...next.sourceFlags, ...previous.sourceFlags])),
  };
}

function toPublicRecord(record: ComicRecord): ComicRecord {
  const publicRecord = { ...record };

  delete publicRecord.searchText;

  return publicRecord;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function optionalString(value: string | boolean | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

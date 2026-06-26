import { readFile, writeFile } from "node:fs/promises";

import { normalizeXkcdRecord } from "../src/lib/normalize.ts";
import type { ComicRecord, ExplainXkcdRawPage, XkcdRawComic } from "../src/lib/types.ts";
import {
  DEFAULT_DELAY_MS,
  createRequestGate,
  fetchCurrentXkcd,
  fetchJson,
  parseArgs,
} from "./lib/corpus.ts";

const DEFAULT_SEARCH_INDEX = "public/search-index.json";
const DEFAULT_RECENT_COUNT = 10;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = String(args.get("output") ?? DEFAULT_SEARCH_INDEX);
  const delayMs = Number.parseInt(String(args.get("delay-ms") ?? DEFAULT_DELAY_MS), 10);
  const recentCount = Number.parseInt(String(args.get("recent-count") ?? DEFAULT_RECENT_COUNT), 10);
  const records = await readPublicRecords(outputPath);
  const recordsByNum = new Map(records.map((record) => [record.num, record]));
  const current = await fetchCurrentXkcd();
  const currentNum = Number(current.num);
  const targets = resolveTargets(records, currentNum, recentCount);
  const gate = createRequestGate(delayMs);
  let changed = false;

  if (targets.length === 0) {
    console.log(`No update targets; current xkcd is #${currentNum}.`);
    return;
  }

  console.log(`Refreshing ${targets.length} public records through xkcd #${currentNum}.`);

  for (const num of targets) {
    const previous = recordsByNum.get(num);
    const xkcd = num === currentNum ? current : await fetchXkcd(num, gate);
    const explain = await fetchExplain(num, xkcd, gate).catch((error) => {
      console.warn(`explainxkcd ${num} skipped: ${formatError(error)}`);
      return null;
    });
    const normalized = normalizeXkcdRecord(xkcd, explain);

    if (!normalized) {
      console.warn(`xkcd ${num} did not normalize to a public record.`);
      continue;
    }

    const next = preserveExistingCommunityTranscript(toPublicRecord(normalized), previous);

    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      recordsByNum.set(num, next);
      changed = true;
      console.log(`Updated #${num} ${next.title}`);
    } else {
      console.log(`Unchanged #${num} ${next.title}`);
    }
  }

  if (!changed) {
    console.log("Public search index already up to date.");
    return;
  }

  const nextRecords = Array.from(recordsByNum.values()).sort((a, b) => a.num - b.num);

  await writeFile(outputPath, `${JSON.stringify(nextRecords)}\n`);
  console.log(`Wrote ${nextRecords.length} records to ${outputPath}`);
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

async function fetchExplain(
  num: number,
  xkcdData: XkcdRawComic,
  gate: ReturnType<typeof createRequestGate>,
): Promise<ExplainXkcdRawPage> {
  const title = String(xkcdData.safe_title ?? xkcdData.title ?? "").replaceAll(" ", "_");
  const params = new URLSearchParams({
    action: "parse",
    page: `${num}:_${title}`,
    prop: "wikitext",
    format: "json",
  });

  await gate.wait("explainxkcd");
  return fetchJson<ExplainXkcdRawPage>({
    url: `https://www.explainxkcd.com/wiki/api.php?${params.toString()}`,
    label: `explainxkcd ${num}`,
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

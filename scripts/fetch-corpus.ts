import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  buildManifest,
  comicPath,
  createRequestGate,
  createRunLogger,
  DEFAULT_DELAY_MS,
  ensureRawDirs,
  EXPLAIN_DIR,
  fetchCurrentXkcd,
  fetchJson,
  listComicNums,
  parseArgs,
  parseRange,
  withFetchLock,
  writeJsonIfMissing,
  writeManifest,
  XKCD_DIR,
} from "./lib/corpus.ts";
import type { ExplainXkcdRawPage, XkcdRawComic } from "../src/lib/types.ts";

interface RunCounts {
  fetched: number;
  skipped: number;
  failed: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const delayMs = Number.parseInt(String(args.get("delay-ms") ?? DEFAULT_DELAY_MS), 10);
  const refresh = args.has("refresh");
  const fetchXkcd = !args.has("explain-only");
  const fetchExplain = !args.has("xkcd-only");

  await withFetchLock(async () => {
    await ensureRawDirs();

    const current = await fetchCurrentXkcd();
    const upstreamNum = Number(current.num);
    const targets = await resolveTargets(args, upstreamNum);
    const gate = createRequestGate(delayMs);
    const logger = await createRunLogger();
    const startedAt = new Date().toISOString();
    const counts: RunCounts = { fetched: 0, skipped: 0, failed: 0 };
    let interrupted = false;

    await logger.log({
      event: "start",
      mode: describeMode(args),
      targets: targets.length,
      delayMs,
      refresh,
      fetchXkcd,
      fetchExplain,
      upstreamNum,
    });

    const interruptHandler = () => {
      interrupted = true;
      console.warn("\nInterrupted. Finishing current item and cleaning up.");
    };

    process.once("SIGINT", interruptHandler);

    for (let index = 0; index < targets.length; index += 1) {
      if (interrupted) {
        break;
      }

      const num = targets[index];
      const prefix = `${index + 1}/${targets.length} #${num}`;
      let xkcdData: XkcdRawComic | null = null;

      if (fetchXkcd) {
        const status = await fetchAndStoreXkcd(num, refresh, gate).catch(async (error) => {
          counts.failed += 1;
          await logger.log({ event: "error", source: "xkcd", num, error: formatError(error) });
          console.log(`${prefix} xkcd failed`);
          return "failed" as const;
        });

        if (status === "written") counts.fetched += 1;
        if (status === "skipped") counts.skipped += 1;
      }

      if (fetchExplain) {
        xkcdData = await readOrFetchXkcdForExplain(num, refresh, gate);
        const status = await fetchAndStoreExplain(num, xkcdData, refresh, gate).catch(
          async (error) => {
            counts.failed += 1;
            await logger.log({
              event: "error",
              source: "explainxkcd",
              num,
              error: formatError(error),
            });
            console.log(`${prefix} explain failed`);
            return "failed" as const;
          },
        );

        if (status === "written") counts.fetched += 1;
        if (status === "skipped") counts.skipped += 1;
      }

      await logger.log({ event: "progress", num, ...counts });
      console.log(
        `${prefix} fetched=${counts.fetched} skipped=${counts.skipped} failed=${counts.failed}`,
      );

      if (counts.failed >= 5) {
        throw new Error("Too many failures; stopping fetch run.");
      }
    }

    process.off("SIGINT", interruptHandler);

    const finishedAt = new Date().toISOString();
    const manifest = await buildManifest({
      checkedAt: new Date().toISOString(),
      latestNum: upstreamNum,
      title: String(current.safe_title ?? current.title ?? ""),
    });

    manifest.lastRun = {
      id: logger.id,
      mode: describeMode(args),
      startedAt,
      finishedAt,
      ...counts,
    };

    await writeManifest(manifest);
    await logger.log({ event: "finish", ...counts });
    console.log(`Run log: ${logger.path}`);
  });
}

async function resolveTargets(args: Map<string, string | boolean>, upstreamNum: number): Promise<number[]> {
  if (typeof args.get("range") === "string") {
    const { start, end } = parseRange(String(args.get("range")));
    return range(start, Math.min(end, upstreamNum));
  }

  if (args.has("recent")) {
    const xkcdNums = await listComicNums(XKCD_DIR);
    const start = (xkcdNums.at(-1) ?? 0) + 1;
    return start <= upstreamNum ? range(start, upstreamNum) : [];
  }

  if (args.has("missing")) {
    const xkcdNums = new Set(await listComicNums(XKCD_DIR));
    const explainNums = new Set(await listComicNums(EXPLAIN_DIR));
    const targets: number[] = [];

    for (let num = 1; num <= upstreamNum; num += 1) {
      if (!xkcdNums.has(num) || !explainNums.has(num)) {
        targets.push(num);
      }
    }

    return targets;
  }

  throw new Error("Choose one mode: --recent, --missing, or --range START-END.");
}

async function fetchAndStoreXkcd(
  num: number,
  refresh: boolean,
  gate: ReturnType<typeof createRequestGate>,
): Promise<"written" | "skipped"> {
  const filePath = comicPath(XKCD_DIR, num);

  if (!refresh && existsSync(filePath)) {
    return "skipped";
  }

  await gate.wait("xkcd");
  const data = await fetchJson<XkcdRawComic>({
    url: `https://xkcd.com/${num}/info.0.json`,
    label: `xkcd ${num}`,
  });

  return writeJsonIfMissing(filePath, data, refresh);
}

async function readOrFetchXkcdForExplain(
  num: number,
  refresh: boolean,
  gate: ReturnType<typeof createRequestGate>,
): Promise<XkcdRawComic> {
  const filePath = comicPath(XKCD_DIR, num);

  if (existsSync(filePath)) {
    return readFile(filePath, "utf8").then((content) => JSON.parse(content) as XkcdRawComic);
  }

  await fetchAndStoreXkcd(num, refresh, gate);
  return readFile(filePath, "utf8").then((content) => JSON.parse(content) as XkcdRawComic);
}

async function fetchAndStoreExplain(
  num: number,
  xkcdData: XkcdRawComic,
  refresh: boolean,
  gate: ReturnType<typeof createRequestGate>,
): Promise<"written" | "skipped"> {
  const filePath = comicPath(EXPLAIN_DIR, num);

  if (!refresh && existsSync(filePath)) {
    return "skipped";
  }

  const title = String(xkcdData.safe_title ?? xkcdData.title ?? "").replaceAll(" ", "_");
  const params = new URLSearchParams({
    action: "parse",
    page: `${num}:_${title}`,
    prop: "wikitext",
    format: "json",
  });

  await gate.wait("explainxkcd");
  const data = await fetchJson<ExplainXkcdRawPage>({
    url: `https://www.explainxkcd.com/wiki/api.php?${params.toString()}`,
    label: `explainxkcd ${num}`,
  });

  return writeJsonIfMissing(filePath, data, refresh);
}

function range(start: number, end: number): number[] {
  const nums: number[] = [];

  for (let num = start; num <= end; num += 1) {
    nums.push(num);
  }

  return nums;
}

function describeMode(args: Map<string, string | boolean>): string {
  if (typeof args.get("range") === "string") return `range ${args.get("range")}`;
  if (args.has("recent")) return "recent";
  if (args.has("missing")) return "missing";
  return "unknown";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

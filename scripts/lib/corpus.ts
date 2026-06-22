import { existsSync } from "node:fs";
import { mkdir, open, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { XkcdRawComic } from "../../src/lib/types.ts";

export const RAW_DATA_DIR = "raw_data";
export const XKCD_DIR = path.join(RAW_DATA_DIR, "xkcd");
export const EXPLAIN_DIR = path.join(RAW_DATA_DIR, "explainxkcd");
export const RUNS_DIR = path.join(RAW_DATA_DIR, "runs");
export const MANIFEST_PATH = path.join(RAW_DATA_DIR, "manifest.json");
export const LOCK_PATH = path.join(RAW_DATA_DIR, ".fetch.lock");
export const DEFAULT_DELAY_MS = 1500;
export const USER_AGENT =
  "Relevant-xkcd personal search corpus updater; contact: https://github.com/taylorvance";

export interface CorpusManifest {
  updatedAt: string;
  xkcd: CorpusSourceSummary;
  explainxkcd: CorpusSourceSummary;
  upstream?: {
    checkedAt: string;
    latestNum: number;
    title: string;
  };
  lastRun?: {
    id: string;
    mode: string;
    startedAt: string;
    finishedAt: string;
    fetched: number;
    skipped: number;
    failed: number;
  };
}

export interface CorpusSourceSummary {
  count: number;
  min: number | null;
  max: number | null;
  missing: number[];
}

export interface FetchJsonOptions {
  url: string;
  label: string;
  timeoutMs?: number;
}

export interface RequestGate {
  wait(source: string): Promise<void>;
}

export interface RunLogger {
  id: string;
  path: string;
  log(event: Record<string, unknown>): Promise<void>;
}

export function parseArgs(argv: string[]): Map<string, string | boolean> {
  const args = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      args.set("_", arg);
      continue;
    }

    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    const next = argv[index + 1];

    if (rawValue !== undefined) {
      args.set(rawKey, rawValue);
    } else if (next && !next.startsWith("--")) {
      args.set(rawKey, next);
      index += 1;
    } else {
      args.set(rawKey, true);
    }
  }

  return args;
}

export function parseRange(value: string): { start: number; end: number } {
  const match = value.match(/^(\d+)-(\d+)$/);

  if (!match) {
    throw new Error(`Invalid range "${value}". Expected START-END.`);
  }

  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);

  if (start <= 0 || end < start) {
    throw new Error(`Invalid range "${value}".`);
  }

  return { start, end };
}

export async function ensureRawDirs(): Promise<void> {
  await mkdir(XKCD_DIR, { recursive: true });
  await mkdir(EXPLAIN_DIR, { recursive: true });
  await mkdir(RUNS_DIR, { recursive: true });
}

export async function listComicNums(dir: string): Promise<number[]> {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => Number.parseInt(entry.name, 10))
    .filter((num) => Number.isInteger(num) && num > 0)
    .sort((a, b) => a - b);
}

export function summarizeNums(nums: number[], through?: number): CorpusSourceSummary {
  const max = nums.at(-1) ?? null;
  const min = nums[0] ?? null;
  const upper = through ?? max ?? 0;
  const present = new Set(nums);
  const missing: number[] = [];

  for (let num = 1; num <= upper; num += 1) {
    if (!present.has(num)) {
      missing.push(num);
    }
  }

  return {
    count: nums.length,
    min,
    max,
    missing,
  };
}

export async function readManifest(): Promise<CorpusManifest | null> {
  if (!existsSync(MANIFEST_PATH)) {
    return null;
  }

  return JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as CorpusManifest;
}

export async function writeManifest(manifest: CorpusManifest): Promise<void> {
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function buildManifest(upstream?: CorpusManifest["upstream"]): Promise<CorpusManifest> {
  const xkcdNums = await listComicNums(XKCD_DIR);
  const explainNums = await listComicNums(EXPLAIN_DIR);
  const through = upstream?.latestNum ?? Math.max(xkcdNums.at(-1) ?? 0, explainNums.at(-1) ?? 0);
  const existing = await readManifest();

  return {
    updatedAt: new Date().toISOString(),
    xkcd: summarizeNums(xkcdNums, through),
    explainxkcd: summarizeNums(explainNums, through),
    ...(upstream ? { upstream } : existing?.upstream ? { upstream: existing.upstream } : {}),
    ...(existing?.lastRun ? { lastRun: existing.lastRun } : {}),
  };
}

export async function fetchCurrentXkcd(): Promise<XkcdRawComic> {
  return fetchJson<XkcdRawComic>({
    url: "https://xkcd.com/info.0.json",
    label: "xkcd current",
  });
}

export async function fetchJson<T>({ url, label, timeoutMs = 15000 }: FetchJsonOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });

    if (response.status === 429 || response.status === 503) {
      const retryAfter = response.headers.get("retry-after");
      throw new Error(`${label} returned ${response.status}; retry-after=${retryAfter ?? "none"}`);
    }

    if (!response.ok) {
      throw new Error(`${label} returned ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function createRequestGate(delayMs: number): RequestGate {
  const lastBySource = new Map<string, number>();

  return {
    async wait(source: string): Promise<void> {
      const last = lastBySource.get(source) ?? 0;
      const elapsed = Date.now() - last;
      const waitMs = Math.max(0, delayMs - elapsed);

      if (waitMs > 0) {
        await sleep(waitMs);
      }

      lastBySource.set(source, Date.now());
    },
  };
}

export async function createRunLogger(): Promise<RunLogger> {
  await mkdir(RUNS_DIR, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(RUNS_DIR, `${id}.jsonl`);

  return {
    id,
    path: logPath,
    async log(event: Record<string, unknown>): Promise<void> {
      await writeFile(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, {
        flag: "a",
      });
    },
  };
}

export async function withFetchLock<T>(fn: () => Promise<T>): Promise<T> {
  await mkdir(RAW_DATA_DIR, { recursive: true });
  const handle = await open(LOCK_PATH, "wx").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") {
      throw new Error(`Fetch lock exists at ${LOCK_PATH}. Another fetch may be running.`);
    }

    throw error;
  });

  try {
    await handle.writeFile(
      JSON.stringify(
        {
          pid: process.pid,
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    return await fn();
  } finally {
    await handle.close();
    await rm(LOCK_PATH, { force: true });
  }
}

export function comicPath(dir: string, num: number): string {
  return path.join(dir, `${num}.json`);
}

export async function writeJsonIfMissing(
  filePath: string,
  data: unknown,
  refresh: boolean,
): Promise<"written" | "skipped"> {
  if (!refresh && existsSync(filePath)) {
    return "skipped";
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data)}\n`);
  return "written";
}

export function compactMissing(missing: number[], limit = 12): string {
  if (missing.length === 0) {
    return "none";
  }

  const shown = missing.slice(0, limit).join(", ");
  const suffix = missing.length > limit ? `, ... (${missing.length} total)` : "";

  return `${shown}${suffix}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

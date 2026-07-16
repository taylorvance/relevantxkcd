import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { blendSearchResults, decodeSemanticIndex, rankSemantic } from "../src/lib/semantic.ts";
import { createSearchIndex, searchComics, type SearchIndex } from "../src/lib/search.ts";
import type { SemanticIndexFile } from "../src/lib/semantic.ts";
import type { ComicRecord, SearchResult } from "../src/lib/types.ts";
import { SEMANTIC_MODEL_ID } from "./lib/semantic-index.ts";

const DEFAULT_CASES = "search-calibration.json";
const DEFAULT_RECORDS = "public/search-index.json";
const DEFAULT_SEMANTIC = "public/semantic-index.json";
const DEFAULT_LIMIT = 10;

interface CalibrationFile {
  description?: string;
  defaultWithin?: number;
  cases: CalibrationCase[];
}

interface CalibrationCase {
  query: string;
  intent?: string;
  expectedTop?: number[];
  expectedWithin?: number[];
  within?: number;
}

interface EvaluateOptions {
  casesPath: string;
  recordsPath: string;
  semanticPath: string;
  includeSemantic: boolean;
  limit: number;
  strict: boolean;
}

interface SemanticRanker {
  rank(query: string): Promise<Array<{ num: number; score: number }>>;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const calibration = await readJson<CalibrationFile>(options.casesPath);
  const records = await readJson<ComicRecord[]>(options.recordsPath);
  const searchIndex = createSearchIndex(records);
  const semanticRanker = options.includeSemantic
    ? await createSemanticRanker(options.semanticPath)
    : null;
  let failures = 0;

  console.log(
    `Search calibration (${semanticRanker ? "lexical + semantic blend" : "lexical"})`,
  );
  if (calibration.description) {
    console.log(calibration.description);
  }
  console.log("");

  for (const calibrationCase of calibration.cases) {
    const results = await evaluateCase(
      records,
      searchIndex,
      calibrationCase,
      calibration.defaultWithin ?? options.limit,
      options.limit,
      semanticRanker,
    );

    if (!results.passed) {
      failures += 1;
    }

    printCase(calibrationCase, results, options.limit);
  }

  if (failures > 0) {
    const message = `${failures} calibration case${failures === 1 ? "" : "s"} need attention.`;

    if (options.strict) {
      console.error(message);
      process.exitCode = 1;
    } else {
      console.log(message);
    }
  } else {
    console.log("All calibration cases passed.");
  }
}

async function evaluateCase(
  records: ComicRecord[],
  searchIndex: SearchIndex,
  calibrationCase: CalibrationCase,
  defaultWithin: number,
  limit: number,
  semanticRanker: SemanticRanker | null,
): Promise<{
  passed: boolean;
  results: SearchResult[];
  topPass: boolean;
  withinPass: boolean;
  within: number;
}> {
  const lexicalResults = searchComics(searchIndex, calibrationCase.query, limit);
  const semanticResults = semanticRanker
    ? await semanticRanker.rank(calibrationCase.query)
    : [];
  const results = semanticRanker
    ? blendSearchResults(records, lexicalResults, semanticResults, limit)
    : lexicalResults;
  const within = calibrationCase.within ?? defaultWithin;
  const topPass = expectedTopPass(results, calibrationCase.expectedTop);
  const withinPass = expectedWithinPass(
    results,
    calibrationCase.expectedWithin,
    within,
  );

  return {
    passed: topPass && withinPass,
    results,
    topPass,
    withinPass,
    within,
  };
}

function expectedTopPass(results: SearchResult[], expectedTop?: number[]): boolean {
  if (!expectedTop?.length) {
    return true;
  }

  const topNum = results[0]?.num;

  return topNum !== undefined && expectedTop.includes(topNum);
}

function expectedWithinPass(
  results: SearchResult[],
  expectedWithin: number[] | undefined,
  within: number,
): boolean {
  if (!expectedWithin?.length) {
    return true;
  }

  const topNums = results.slice(0, within).map((result) => result.num);

  return expectedWithin.every((num) => topNums.includes(num));
}

function printCase(
  calibrationCase: CalibrationCase,
  evaluation: {
    passed: boolean;
    results: SearchResult[];
    topPass: boolean;
    withinPass: boolean;
    within: number;
  },
  limit: number,
): void {
  const status = evaluation.passed ? "PASS" : "FAIL";
  const top = evaluation.results
    .slice(0, limit)
    .map((result, index) => `${index + 1}. #${result.num} ${result.title}`)
    .join(" | ");
  const checks = [
    evaluation.topPass ? null : `expected top: ${calibrationCase.expectedTop?.join(", ")}`,
    evaluation.withinPass
      ? null
      : `expected within ${evaluation.within}: ${calibrationCase.expectedWithin?.join(", ")}`,
  ].filter(Boolean);

  console.log(`${status} ${JSON.stringify(calibrationCase.query)}`);
  if (calibrationCase.intent) {
    console.log(`  ${calibrationCase.intent}`);
  }
  if (checks.length > 0) {
    console.log(`  ${checks.join("; ")}`);
  }
  console.log(`  ${top || "No results"}`);
  console.log("");
}

async function createSemanticRanker(semanticPath: string): Promise<SemanticRanker> {
  if (!existsSync(semanticPath)) {
    throw new Error(`Semantic index not found at ${semanticPath}`);
  }

  const [{ env, pipeline }, semantic] = await Promise.all([
    import("@huggingface/transformers"),
    readJson<SemanticIndexFile>(semanticPath),
  ]);
  const decoded = decodeSemanticIndex(semantic);

  env.allowLocalModels = false;
  env.cacheDir = path.join(process.env.HOME ?? ".", ".cache", "xkcd-transformers");

  const extractor = await pipeline("feature-extraction", SEMANTIC_MODEL_ID, {
    dtype: "q8",
  });

  return {
    async rank(query: string) {
      const output = await extractor(query, {
        pooling: "mean",
        normalize: true,
      });

      return rankSemantic(decoded, output.data as unknown as ArrayLike<number>, 48);
    },
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function parseOptions(args: string[]): EvaluateOptions {
  const options: EvaluateOptions = {
    casesPath: DEFAULT_CASES,
    recordsPath: DEFAULT_RECORDS,
    semanticPath: DEFAULT_SEMANTIC,
    includeSemantic: false,
    limit: DEFAULT_LIMIT,
    strict: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--cases") {
      options.casesPath = requiredValue(args, index);
      index += 1;
      continue;
    }

    if (arg === "--records") {
      options.recordsPath = requiredValue(args, index);
      index += 1;
      continue;
    }

    if (arg === "--semantic-index") {
      options.semanticPath = requiredValue(args, index);
      index += 1;
      continue;
    }

    if (arg === "--semantic") {
      options.includeSemantic = true;
      continue;
    }

    if (arg === "--strict") {
      options.strict = true;
      continue;
    }

    if (arg === "--limit") {
      options.limit = Number.parseInt(requiredValue(args, index), 10);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option ${arg}`);
  }

  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error("--limit must be a positive integer.");
  }

  return options;
}

function requiredValue(args: string[], index: number): string {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${args[index]}`);
  }

  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

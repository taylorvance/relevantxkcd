import { blendSearchResults, decodeSemanticIndex, rankSemantic } from "./lib/semantic";
import { buildResultExcerpt, searchComics } from "./lib/search";
import { embedQuery, loadSemanticIndex } from "./lib/semanticModel";
import type { ComicRecord, SearchResult } from "./lib/types";

const RESULT_LIMIT = 24;

interface SearchRequest {
  id: number;
  type: "search";
  query: string;
  semanticEnabled: boolean;
}

interface SelectRequest {
  id: number;
  type: "select";
  num: number;
}

type WorkerRequest = SearchRequest | SelectRequest;

interface WorkerResponse {
  id: number;
  type: "ready" | "results" | "selected" | "status" | "error";
  count?: number;
  results?: SearchResult[];
  selected?: ComicRecord | null;
  status?: string;
  error?: string;
}

let records: ComicRecord[] = [];
let recordsByNum = new Map<number, ComicRecord>();
let latestSearchId = 0;
let semanticIndexLoaded = false;
let semanticIndexPromise: Promise<ReturnType<typeof decodeSemanticIndex>> | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "search") {
    latestSearchId = message.id;
    search(message).catch((error) => {
      post({ id: message.id, type: "error", error: formatError(error) });
    });
    return;
  }

  if (message.type === "select") {
    post({
      id: message.id,
      type: "selected",
      selected: recordsByNum.get(message.num) ?? null,
    });
  }
};

loadRecords().catch((error) => {
  post({ id: 0, type: "error", error: formatError(error) });
});

async function loadRecords(): Promise<void> {
  const response = await fetch("/search-index.json", { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`Index request failed: ${response.status}`);
  }

  records = (await response.json()) as ComicRecord[];
  recordsByNum = new Map(records.map((record) => [record.num, record]));
  post({ id: 0, type: "ready", count: records.length });
  post({
    id: 0,
    type: "results",
    count: records.length,
    results: recentRecords(),
  });
}

async function search(message: SearchRequest): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const trimmedQuery = message.query.trim();
  const lexicalResults = trimmedQuery ? searchComics(records, trimmedQuery, RESULT_LIMIT) : recentRecords();

  if (!message.semanticEnabled || !trimmedQuery) {
    post({
      id: message.id,
      type: "results",
      count: records.length,
      results: lexicalResults,
      status: "",
    });
    return;
  }

  post({
    id: message.id,
    type: "results",
    count: records.length,
    results: lexicalResults,
    status: "Semantic loading",
  });
  post({ id: message.id, type: "status", status: semanticIndexLoaded ? "Embedding query" : "Loading semantic index" });

  const semanticIndex = await getSemanticIndex();

  if (message.id !== latestSearchId) {
    return;
  }

  const embedding = await embedQuery(trimmedQuery);

  if (message.id !== latestSearchId) {
    return;
  }

  const semanticResults = rankSemantic(semanticIndex, embedding, 48);
  const results = blendSearchResults(records, lexicalResults, semanticResults, RESULT_LIMIT);

  post({
    id: message.id,
    type: "results",
    count: records.length,
    results,
    status: "Semantic ready",
  });
}

async function getSemanticIndex(): Promise<ReturnType<typeof decodeSemanticIndex>> {
  semanticIndexPromise ??= loadSemanticIndex().then((indexFile) => {
    semanticIndexLoaded = true;
    return decodeSemanticIndex(indexFile);
  });

  return semanticIndexPromise;
}

function recentRecords(): SearchResult[] {
  return records
    .slice()
    .sort((a, b) => b.num - a.num)
    .slice(0, RESULT_LIMIT)
    .map((record) => {
      const excerpt = buildResultExcerpt(record);

      return {
        ...record,
        score: 0,
        ...excerpt,
        matchSource: excerpt.excerptSource,
        matchedFields: [],
      };
    });
}

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

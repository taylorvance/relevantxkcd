import { blendSearchResults, decodeSemanticIndex, rankSemantic } from "./lib/semantic";
import { buildResultExcerpt, searchComics } from "./lib/search";
import { embedQuery, loadSemanticIndex } from "./lib/semanticModel";
import { isSupportedIndexManifest, type IndexManifestFile } from "./lib/indexManifest";
import type { ComicRecord, SearchResult } from "./lib/types";

const RESULT_LIMIT = 24;
const BASE_URL = import.meta.env.BASE_URL ?? "/";

interface SearchRequest {
  id: number;
  type: "search";
  query: string;
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
let indexManifest: IndexManifestFile | null = null;
let latestSearchId = 0;
let semanticIndexLoaded = false;
let semanticIndexPromise: Promise<ReturnType<typeof decodeSemanticIndex>> | null = null;
let semanticUnavailable = false;

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
  const loaded = await loadSearchRecords();

  records = loaded.records;
  indexManifest = loaded.manifest;
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
  const semanticUrl = getSemanticIndexUrl();

  if (!trimmedQuery || !semanticUrl || semanticUnavailable) {
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
    status: "Refining",
  });
  post({
    id: message.id,
    type: "status",
    status: semanticIndexLoaded ? "Refining" : "Loading ranking data",
  });

  const semanticIndex = await getSemanticIndex(semanticUrl).catch((error) => {
    semanticUnavailable = true;
    console.warn(`Semantic refinement disabled: ${formatError(error)}`);
    return null;
  });

  if (!semanticIndex) {
    if (message.id === latestSearchId) {
      post({
        id: message.id,
        type: "results",
        count: records.length,
        results: lexicalResults,
        status: "",
      });
    }
    return;
  }

  if (message.id !== latestSearchId) {
    return;
  }

  const embedding = await embedQuery(trimmedQuery).catch((error) => {
    semanticUnavailable = true;
    console.warn(`Semantic embedding disabled: ${formatError(error)}`);
    return null;
  });

  if (!embedding) {
    if (message.id === latestSearchId) {
      post({
        id: message.id,
        type: "results",
        count: records.length,
        results: lexicalResults,
        status: "",
      });
    }
    return;
  }

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
    status: "",
  });
}

async function loadSearchRecords(): Promise<{
  records: ComicRecord[];
  manifest: IndexManifestFile | null;
}> {
  const manifest = await loadIndexManifest();

  if (manifest) {
    const response = await fetch(publicAssetUrl(manifest.assets.search.url), { cache: "no-cache" });

    if (!response.ok) {
      throw new Error(`Index request failed: ${response.status}`);
    }

    const manifestRecords = (await response.json()) as ComicRecord[];

    if (manifestRecords.length !== manifest.corpus.recordCount) {
      throw new Error("Index manifest record count does not match search records.");
    }

    return {
      records: manifestRecords,
      manifest,
    };
  }

  const response = await fetch(publicAssetUrl("search-index.json"), { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`Index request failed: ${response.status}`);
  }

  return {
    records: (await response.json()) as ComicRecord[],
    manifest: null,
  };
}

async function loadIndexManifest(): Promise<IndexManifestFile | null> {
  const response = await fetch(publicAssetUrl("index-manifest.json"), {
    cache: "no-cache",
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const manifest = (await response.json()) as unknown;

  return isSupportedIndexManifest(manifest) ? manifest : null;
}

async function getSemanticIndex(
  semanticUrl: string,
): Promise<ReturnType<typeof decodeSemanticIndex>> {
  semanticIndexPromise ??= loadSemanticIndex(semanticUrl).then((indexFile) => {
    const decoded = decodeSemanticIndex(indexFile);

    validateSemanticAlignment(decoded);
    semanticIndexLoaded = true;
    return decoded;
  });

  return semanticIndexPromise;
}

function getSemanticIndexUrl(): string | null {
  if (indexManifest) {
    return indexManifest.assets.semantic
      ? publicAssetUrl(indexManifest.assets.semantic.url)
      : null;
  }

  return publicAssetUrl("semantic-index.json");
}

function validateSemanticAlignment(index: ReturnType<typeof decodeSemanticIndex>): void {
  if (index.nums.length !== records.length) {
    throw new Error("Semantic index record count does not match search index.");
  }

  for (let indexRow = 0; indexRow < index.nums.length; indexRow += 1) {
    if (index.nums[indexRow] !== records[indexRow]?.num) {
      throw new Error(`Semantic index nums diverge at row ${indexRow}.`);
    }
  }

  const expectedVectorLength = records.length * index.dimensions;

  if (index.vectors.length !== expectedVectorLength) {
    throw new Error("Semantic index vector length does not match metadata.");
  }
}

function publicAssetUrl(assetPath: string): string {
  if (/^https?:\/\//.test(assetPath)) {
    return assetPath;
  }

  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const normalizedPath = assetPath.replace(/^\/+/, "");

  return new URL(normalizedPath, new URL(base, self.location.origin)).toString();
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

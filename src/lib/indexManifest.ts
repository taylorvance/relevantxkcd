export const INDEX_MANIFEST_SCHEMA = "index-manifest@1";
export const SEARCH_INDEX_SCHEMA = "comic-record-array@1";
export const SEMANTIC_INDEX_SCHEMA = "semantic-index@1";

export interface IndexManifestFile {
  schema: string;
  buildId: string;
  generatedAt: string;
  corpus: {
    latestNum: number;
    recordCount: number;
    contentHash: string;
    numsHash: string;
  };
  assets: {
    search: IndexAsset;
    semantic?: SemanticIndexAsset;
  };
}

export interface IndexAsset {
  schema: string;
  url: string;
  sha256: string;
  bytes: number;
  recordCount: number;
}

export interface SemanticIndexAsset extends IndexAsset {
  numsHash: string;
  model: string;
  dimensions: number;
  scale: number;
}

export function isSupportedIndexManifest(value: unknown): value is IndexManifestFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const manifest = value as Partial<IndexManifestFile>;

  return (
    manifest.schema === INDEX_MANIFEST_SCHEMA &&
    typeof manifest.buildId === "string" &&
    typeof manifest.generatedAt === "string" &&
    isCorpus(manifest.corpus) &&
    Boolean(manifest.assets) &&
    isIndexAsset(manifest.assets?.search, SEARCH_INDEX_SCHEMA) &&
    (manifest.assets?.semantic === undefined ||
      isSemanticIndexAsset(manifest.assets.semantic))
  );
}

function isCorpus(value: unknown): value is IndexManifestFile["corpus"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const corpus = value as Partial<IndexManifestFile["corpus"]>;

  return (
    typeof corpus.latestNum === "number" &&
    typeof corpus.recordCount === "number" &&
    typeof corpus.contentHash === "string" &&
    typeof corpus.numsHash === "string"
  );
}

function isIndexAsset(value: unknown, schema: string): value is IndexAsset {
  if (!value || typeof value !== "object") {
    return false;
  }

  const asset = value as Partial<IndexAsset>;

  return (
    asset.schema === schema &&
    typeof asset.url === "string" &&
    typeof asset.sha256 === "string" &&
    typeof asset.bytes === "number" &&
    typeof asset.recordCount === "number"
  );
}

function isSemanticIndexAsset(value: unknown): value is SemanticIndexAsset {
  if (!isIndexAsset(value, SEMANTIC_INDEX_SCHEMA)) {
    return false;
  }

  const asset = value as Partial<SemanticIndexAsset>;

  return (
    typeof asset.numsHash === "string" &&
    typeof asset.model === "string" &&
    typeof asset.dimensions === "number" &&
    typeof asset.scale === "number"
  );
}

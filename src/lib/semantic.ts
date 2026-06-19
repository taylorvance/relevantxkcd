import type { ComicRecord, SearchResult } from "./types";

export interface SemanticIndexFile {
  model: string;
  dimensions: number;
  scale: number;
  nums: number[];
  vectors: string;
}

export interface DecodedSemanticIndex {
  model: string;
  dimensions: number;
  scale: number;
  nums: number[];
  vectors: Int8Array;
}

export interface SemanticResult {
  num: number;
  score: number;
}

export function decodeSemanticIndex(file: SemanticIndexFile): DecodedSemanticIndex {
  const binary = decodeBase64(file.vectors);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    model: file.model,
    dimensions: file.dimensions,
    scale: file.scale,
    nums: file.nums,
    vectors: new Int8Array(bytes.buffer),
  };
}

function decodeBase64(value: string): string {
  if (typeof atob === "function") {
    return atob(value);
  }

  return Buffer.from(value, "base64").toString("binary");
}

export function rankSemantic(
  index: DecodedSemanticIndex,
  queryEmbedding: ArrayLike<number>,
  limit = 40,
): SemanticResult[] {
  const results: SemanticResult[] = [];

  for (let row = 0; row < index.nums.length; row += 1) {
    const offset = row * index.dimensions;
    let dot = 0;

    for (let dim = 0; dim < index.dimensions; dim += 1) {
      dot += queryEmbedding[dim] * index.vectors[offset + dim];
    }

    results.push({
      num: index.nums[row],
      score: dot / index.scale,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function blendSearchResults(
  records: ComicRecord[],
  lexicalResults: SearchResult[],
  semanticResults: SemanticResult[],
  limit = 24,
): SearchResult[] {
  const recordsByNum = new Map(records.map((record) => [record.num, record]));
  const lexicalByNum = new Map(lexicalResults.map((result) => [result.num, result]));
  const maxLexicalScore = Math.max(1, ...lexicalResults.map((result) => result.score));
  const candidates = new Map<number, SearchResult>();

  for (const result of lexicalResults) {
    candidates.set(result.num, result);
  }

  for (const result of semanticResults) {
    const record = recordsByNum.get(result.num);

    if (!record || candidates.has(result.num)) {
      continue;
    }

    candidates.set(result.num, {
      ...record,
      score: 0,
      excerpt: record.alt || record.transcript || record.title,
      matchedFields: ["semantic"],
    });
  }

  return Array.from(candidates.values())
    .map((candidate) => {
      const lexical = lexicalByNum.get(candidate.num);
      const semantic = semanticResults.find((result) => result.num === candidate.num);
      const lexicalScore = lexical ? lexical.score / maxLexicalScore : 0;
      const semanticScore = semantic ? Math.max(0, (semantic.score + 1) / 2) : 0;

      return {
        ...candidate,
        score: lexicalScore * 0.42 + semanticScore * 0.58,
        matchedFields: Array.from(
          new Set([...candidate.matchedFields, ...(semantic ? ["semantic"] : [])]),
        ),
      };
    })
    .sort((a, b) => b.score - a.score || a.num - b.num)
    .slice(0, limit);
}

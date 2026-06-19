import type { ComicRecord, SearchResult } from "./types";

const FIELD_WEIGHTS = {
  title: 80,
  alt: 24,
  transcript: 14,
  communityTranscript: 10,
  explainReferences: 10,
  explanation: 6,
  phraseTitle: 420,
  phraseAlt: 120,
  phraseTranscript: 70,
  phraseCommunityTranscript: 54,
  phraseExplainReferences: 54,
  phraseExplanation: 38,
};

export function searchComics(
  records: ComicRecord[],
  query: string,
  limit = 20,
): SearchResult[] {
  const parsed = parseQuery(query);

  if (!parsed.tokens.length && !parsed.phrases.length) {
    return [];
  }

  return records
    .map((record) => scoreRecord(record, parsed))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.num - b.num)
    .slice(0, limit);
}

export function parseQuery(query: string): {
  normalized: string;
  tokens: string[];
  phrases: string[];
} {
  const phrases = Array.from(query.matchAll(/"([^"]+)"/g), (match) =>
    normalizeForComparison(match[1]),
  ).filter(Boolean);
  const normalized = normalizeForComparison(query.replace(/"[^"]+"/g, " "));
  const tokens = unique(tokenize(normalized));

  return { normalized, tokens, phrases };
}

export function tokenize(value: string): string[] {
  return normalizeForComparison(value)
    .match(/[a-z0-9]+/g)
    ?.map(stemToken) ?? [];
}

function scoreRecord(
  record: ComicRecord,
  query: ReturnType<typeof parseQuery>,
): SearchResult {
  const fields = {
    title: normalizeForComparison(record.title),
    alt: normalizeForComparison(record.alt),
    transcript: normalizeForComparison(record.transcript),
    communityTranscript: normalizeForComparison(record.communityTranscript),
    explainReferences: normalizeForComparison(record.explainReferences ?? ""),
    explanation: normalizeForComparison(record.explanation ?? ""),
  };
  const titleTokens = new Set(tokenize(record.title));
  const altTokens = new Set(tokenize(record.alt));
  const transcriptTokens = new Set(tokenize(record.transcript));
  const communityTranscriptTokens = new Set(tokenize(record.communityTranscript));
  const explainReferencesTokens = new Set(tokenize(record.explainReferences ?? ""));
  const explanationTokens = new Set(tokenize(record.explanation ?? ""));
  const matchedFields = new Set<string>();
  let score = 0;

  if (query.normalized && fields.title === query.normalized) {
    score += 1200;
    matchedFields.add("title");
  }

  for (const phrase of query.phrases) {
    if (fields.title.includes(phrase)) {
      score += FIELD_WEIGHTS.phraseTitle;
      matchedFields.add("title");
    }

    if (fields.alt.includes(phrase)) {
      score += FIELD_WEIGHTS.phraseAlt;
      matchedFields.add("alt");
    }

    if (fields.transcript.includes(phrase)) {
      score += FIELD_WEIGHTS.phraseTranscript;
      matchedFields.add("transcript");
    }

    if (fields.communityTranscript.includes(phrase)) {
      score += FIELD_WEIGHTS.phraseCommunityTranscript;
      matchedFields.add("communityTranscript");
    }

    if (fields.explainReferences.includes(phrase)) {
      score += FIELD_WEIGHTS.phraseExplainReferences;
      matchedFields.add("explainReferences");
    }

    if (fields.explanation.includes(phrase)) {
      score += FIELD_WEIGHTS.phraseExplanation;
      matchedFields.add("explanation");
    }
  }

  const uniqueHits = new Set<string>();

  for (const token of query.tokens) {
    if (titleTokens.has(token)) {
      score += FIELD_WEIGHTS.title;
      matchedFields.add("title");
      uniqueHits.add(token);
    }

    if (altTokens.has(token)) {
      score += FIELD_WEIGHTS.alt;
      matchedFields.add("alt");
      uniqueHits.add(token);
    }

    if (transcriptTokens.has(token)) {
      score += FIELD_WEIGHTS.transcript;
      matchedFields.add("transcript");
      uniqueHits.add(token);
    }

    if (communityTranscriptTokens.has(token)) {
      score += FIELD_WEIGHTS.communityTranscript;
      matchedFields.add("communityTranscript");
      uniqueHits.add(token);
    }

    if (explainReferencesTokens.has(token)) {
      score += FIELD_WEIGHTS.explainReferences;
      matchedFields.add("explainReferences");
      uniqueHits.add(token);
    }

    if (explanationTokens.has(token)) {
      score += FIELD_WEIGHTS.explanation;
      matchedFields.add("explanation");
      uniqueHits.add(token);
    }
  }

  if (query.tokens.length > 1 && uniqueHits.size > 1) {
    score += uniqueHits.size * 32;
  }

  if (query.tokens.length > 0 && uniqueHits.size === query.tokens.length) {
    score += 60;
  }

  return {
    ...record,
    score,
    excerpt: buildExcerpt(record, query.tokens),
    matchedFields: Array.from(matchedFields),
  };
}

function buildExcerpt(record: ComicRecord, tokens: string[]): string {
  const fields = [
    record.alt,
    record.transcript,
    record.communityTranscript,
    record.explainReferences ?? "",
    record.explanation ?? "",
  ].filter(Boolean);
  const tokenSet = new Set(tokens);

  for (const field of fields) {
    const sentences = field.split(/(?<=[.!?])\s+/);
    const match = sentences.find((sentence) =>
      tokenize(sentence).some((token) => tokenSet.has(token)),
    );

    if (match) {
      return truncate(match, 190);
    }
  }

  return truncate(
    record.alt ||
      record.transcript ||
      record.communityTranscript ||
      record.explainReferences ||
      record.explanation ||
      record.title,
    190,
  );
}

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9"']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

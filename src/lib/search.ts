import type { ComicRecord, ExcerptSource, MatchSource, SearchResult } from "./types";

interface Excerpt {
  excerpt: string;
  excerptSource: ExcerptSource;
}

interface ExcerptCandidate {
  source: ExcerptSource;
  value: string;
}

const FIELD_WEIGHTS = {
  number: 1800,
  title: 80,
  alt: 24,
  transcript: 14,
  communityTranscript: 14,
  communityTranscriptSupplemental: 6,
  phraseTitle: 420,
  phraseAlt: 120,
  phraseTranscript: 150,
  phraseCommunityTranscript: 70,
  phraseCommunityTranscriptSupplemental: 50,
};

export function searchComics(
  records: ComicRecord[],
  query: string,
  limit = 20,
): SearchResult[] {
  const parsed = parseQuery(query);

  if (!parsed.tokens.length && !parsed.phrases.length && !parsed.comicNumber) {
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
  comicNumber: number | null;
} {
  const comicNumber = parseComicNumber(query);
  const quotedPhrases = Array.from(query.matchAll(/"([^"]+)"/g), (match) =>
    normalizeForComparison(match[1]),
  ).filter(Boolean);
  const normalized = normalizeForComparison(query.replace(/"[^"]+"/g, " "));
  const tokens = unique(tokenize(normalized));
  const implicitPhrases = tokens.length > 1 && normalized ? [normalized] : [];
  const phrases = unique([...quotedPhrases, ...implicitPhrases]);

  return { normalized, tokens, phrases, comicNumber };
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
  };
  const titleTokens = new Set(tokenize(record.title));
  const altTokens = new Set(tokenize(record.alt));
  const transcriptTokens = new Set(tokenize(record.transcript));
  const communityTranscriptTokens = new Set(tokenize(record.communityTranscript));
  const hasOfficialTranscript = record.transcript.trim().length > 0;
  const matchedFields = new Set<string>();
  let score = 0;

  if (query.comicNumber === record.num) {
    score += FIELD_WEIGHTS.number;
    matchedFields.add("number");
  }

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
      score += hasOfficialTranscript
        ? FIELD_WEIGHTS.phraseCommunityTranscriptSupplemental
        : FIELD_WEIGHTS.phraseCommunityTranscript;
      matchedFields.add("communityTranscript");
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
      score += hasOfficialTranscript
        ? FIELD_WEIGHTS.communityTranscriptSupplemental
        : FIELD_WEIGHTS.communityTranscript;
      matchedFields.add("communityTranscript");
      uniqueHits.add(token);
    }
  }

  if (query.tokens.length > 1 && uniqueHits.size > 1) {
    score += uniqueHits.size * 32;
  }

  if (query.tokens.length > 0 && uniqueHits.size === query.tokens.length) {
    score += 60;
  }

  const matchSource = pickMatchSource(matchedFields);

  return {
    ...record,
    score,
    ...buildResultExcerpt(
      record,
      unique([...query.tokens, ...query.phrases.flatMap(tokenize)]),
      matchSource,
    ),
    matchSource,
    matchedFields: Array.from(matchedFields),
  };
}

function pickMatchSource(matchedFields: Set<string>): MatchSource {
  for (const field of ["number", "title", "alt", "transcript", "communityTranscript"] as const) {
    if (matchedFields.has(field)) {
      return field;
    }
  }

  return "title";
}

export function buildResultExcerpt(
  record: ComicRecord,
  tokens: string[] = [],
  matchSource?: MatchSource,
): Excerpt {
  if (matchSource === "number" || matchSource === "title") {
    return buildContextExcerpt(record);
  }

  if (
    matchSource === "alt" ||
    matchSource === "transcript" ||
    matchSource === "communityTranscript"
  ) {
    return buildFieldMatchExcerpt(record, tokens, matchSource);
  }

  return buildContextExcerpt(record);
}

function buildFieldMatchExcerpt(
  record: ComicRecord,
  tokens: string[],
  source: ExcerptSource,
): Excerpt {
  const value = record[source];
  const field = { source, value };
  const excerpt = findMatchingExcerpt([field], tokens);

  if (excerpt) {
    return excerpt;
  }

  if (cleanExcerpt(value).length > 0) {
    return {
      excerpt: truncate(cleanExcerpt(value), 190),
      excerptSource: source,
    };
  }

  return buildContextExcerpt(record);
}

function findMatchingExcerpt(
  fields: ExcerptCandidate[],
  tokens: string[],
): Excerpt | null {
  const tokenSet = new Set(tokens);

  for (const field of fields) {
    const sentences = field.value.split(/(?<=[.!?])\s+/);
    const match = sentences.find((sentence) =>
      tokenize(sentence).some((token) => tokenSet.has(token)),
    );

    if (match) {
      return {
        excerpt: truncate(cleanExcerpt(match), 190),
        excerptSource: field.source,
      };
    }
  }

  return null;
}

function buildContextExcerpt(record: ComicRecord): Excerpt {
  const contextualFields: ExcerptCandidate[] = [
    { source: "alt", value: record.alt },
    { source: "title", value: record.title },
  ];
  const excerpt = contextualFields.find(
    (field) => cleanExcerpt(field.value).length > 0,
  ) ?? { source: "title" as const, value: record.title };

  return {
    excerpt: truncate(cleanExcerpt(excerpt.value), 190),
    excerptSource: excerpt.source,
  };
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

function parseComicNumber(query: string): number | null {
  const match = query.trim().match(/^(?:#\s*)?(\d+)$/);

  if (!match) {
    return null;
  }

  const num = Number(match[1]);

  return Number.isInteger(num) && num > 0 ? num : null;
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

function cleanExcerpt(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

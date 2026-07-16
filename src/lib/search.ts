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

interface RecordTokenIndex {
  title: Set<string>;
  alt: Set<string>;
  transcript: Set<string>;
  communityTranscript: Set<string>;
}

interface NormalizedRecordFields {
  title: string;
  alt: string;
  transcript: string;
  communityTranscript: string;
}

interface IndexedRecord {
  record: ComicRecord;
  fields: NormalizedRecordFields;
  tokens: RecordTokenIndex;
  hasOfficialTranscript: boolean;
}

export interface SearchIndex {
  records: ComicRecord[];
  recordCount: number;
  indexedRecords: IndexedRecord[];
  rowsByNum: Map<number, number>;
  postings: Map<string, Set<number>>;
  documentFrequencies: Map<string, number>;
}

interface ScoredIndexedRecord {
  indexedRecord: IndexedRecord;
  score: number;
  matchedFields: Set<string>;
}

const IDF_BASELINE = 0.5;
const IDF_SCALE = 0.5;
const searchIndexCache = new WeakMap<ComicRecord[], SearchIndex>();

export function searchComics(
  source: ComicRecord[] | SearchIndex,
  query: string,
  limit = 20,
): SearchResult[] {
  const parsed = parseQuery(query);

  if (!parsed.tokens.length && !parsed.phrases.length && !parsed.comicNumber) {
    return [];
  }

  const index = Array.isArray(source) ? createSearchIndex(source) : source;
  const candidateRows = candidateRowsForQuery(index, parsed);

  return Array.from(candidateRows)
    .map((row) => scoreIndexedRecord(index.indexedRecords[row], parsed, index))
    .filter((result) => result.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.indexedRecord.record.num - b.indexedRecord.record.num,
    )
    .slice(0, limit)
    .map((result) => buildSearchResult(result, parsed));
}

export function createSearchIndex(records: ComicRecord[]): SearchIndex {
  const cached = searchIndexCache.get(records);

  if (cached) {
    return cached;
  }

  const index: SearchIndex = {
    records,
    recordCount: records.length,
    indexedRecords: [],
    rowsByNum: new Map(),
    postings: new Map(),
    documentFrequencies: new Map(),
  };

  records.forEach((record, row) => {
    const indexedRecord = buildIndexedRecord(record);
    const documentTokens = new Set([
      ...indexedRecord.tokens.title,
      ...indexedRecord.tokens.alt,
      ...indexedRecord.tokens.transcript,
      ...indexedRecord.tokens.communityTranscript,
    ]);

    index.indexedRecords.push(indexedRecord);
    index.rowsByNum.set(record.num, row);

    for (const token of documentTokens) {
      let postings = index.postings.get(token);

      if (!postings) {
        postings = new Set();
        index.postings.set(token, postings);
      }

      postings.add(row);
      index.documentFrequencies.set(
        token,
        (index.documentFrequencies.get(token) ?? 0) + 1,
      );
    }
  });

  searchIndexCache.set(records, index);
  return index;
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
  const tokens = unique(tokenizeNormalized(normalized));
  const implicitPhrases = tokens.length > 1 && normalized ? [normalized] : [];
  const phrases = unique([...quotedPhrases, ...implicitPhrases]);

  return { normalized, tokens, phrases, comicNumber };
}

export function tokenize(value: string): string[] {
  return tokenizeNormalized(normalizeForComparison(value));
}

function tokenizeNormalized(value: string): string[] {
  return value.match(/[a-z0-9]+/g)?.map(stemToken) ?? [];
}

function scoreIndexedRecord(
  indexedRecord: IndexedRecord,
  query: ReturnType<typeof parseQuery>,
  index: SearchIndex,
): ScoredIndexedRecord {
  const { fields, tokens: recordTokens, hasOfficialTranscript, record } = indexedRecord;
  const matchedFields = new Set<string>();
  const uniqueHits = new Set<string>();
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

  for (const token of query.tokens) {
    const tokenWeight = tokenRarityMultiplier(index, token);

    if (recordTokens.title.has(token)) {
      score += FIELD_WEIGHTS.title * tokenWeight;
      matchedFields.add("title");
      uniqueHits.add(token);
    }

    if (recordTokens.alt.has(token)) {
      score += FIELD_WEIGHTS.alt * tokenWeight;
      matchedFields.add("alt");
      uniqueHits.add(token);
    }

    if (recordTokens.transcript.has(token)) {
      score += FIELD_WEIGHTS.transcript * tokenWeight;
      matchedFields.add("transcript");
      uniqueHits.add(token);
    }

    if (recordTokens.communityTranscript.has(token)) {
      const fieldWeight = hasOfficialTranscript
        ? FIELD_WEIGHTS.communityTranscriptSupplemental
        : FIELD_WEIGHTS.communityTranscript;

      score += fieldWeight * tokenWeight;
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

  return {
    indexedRecord,
    score,
    matchedFields,
  };
}

function buildSearchResult(
  result: ScoredIndexedRecord,
  query: ReturnType<typeof parseQuery>,
): SearchResult {
  const matchSource = pickMatchSource(result.matchedFields);
  const record = result.indexedRecord.record;

  return {
    ...record,
    score: result.score,
    ...buildResultExcerpt(
      record,
      unique([...query.tokens, ...query.phrases.flatMap(tokenize)]),
      matchSource,
    ),
    matchSource,
    matchedFields: Array.from(result.matchedFields),
  };
}

function candidateRowsForQuery(
  index: SearchIndex,
  query: ReturnType<typeof parseQuery>,
): Set<number> {
  const candidateRows = new Set<number>();
  const comicRow =
    query.comicNumber === null ? undefined : index.rowsByNum.get(query.comicNumber);

  if (comicRow !== undefined) {
    candidateRows.add(comicRow);
  }

  for (const token of query.tokens) {
    addPostingRows(candidateRows, index.postings.get(token));
  }

  for (const phrase of query.phrases) {
    addPhraseCandidateRows(candidateRows, index, phrase);
  }

  return candidateRows;
}

function addPostingRows(candidateRows: Set<number>, postings?: Set<number>): void {
  if (!postings) {
    return;
  }

  for (const row of postings) {
    candidateRows.add(row);
  }
}

function addPhraseCandidateRows(
  candidateRows: Set<number>,
  index: SearchIndex,
  phrase: string,
): void {
  const phraseTokens = tokenizeNormalized(phrase);
  const candidatePostings = rarestPosting(index, phraseTokens);
  const rowsToCheck =
    candidatePostings ?? index.indexedRecords.map((_record, row) => row);

  for (const row of rowsToCheck) {
    const { fields } = index.indexedRecords[row];

    if (
      fields.title.includes(phrase) ||
      fields.alt.includes(phrase) ||
      fields.transcript.includes(phrase) ||
      fields.communityTranscript.includes(phrase)
    ) {
      candidateRows.add(row);
    }
  }
}

function rarestPosting(
  index: SearchIndex,
  tokens: string[],
): Set<number> | undefined {
  let rarest: Set<number> | undefined;

  for (const token of tokens) {
    const postings = index.postings.get(token);

    if (!postings) {
      return new Set();
    }

    if (!rarest || postings.size < rarest.size) {
      rarest = postings;
    }
  }

  return rarest;
}

function buildIndexedRecord(record: ComicRecord): IndexedRecord {
  const fields = {
    title: normalizeForComparison(record.title),
    alt: normalizeForComparison(record.alt),
    transcript: normalizeForComparison(record.transcript),
    communityTranscript: normalizeForComparison(record.communityTranscript),
  };

  return {
    record,
    fields,
    tokens: buildRecordTokenIndex(fields),
    hasOfficialTranscript: record.transcript.trim().length > 0,
  };
}

function buildRecordTokenIndex(fields: NormalizedRecordFields): RecordTokenIndex {
  return {
    title: new Set(tokenizeNormalized(fields.title)),
    alt: new Set(tokenizeNormalized(fields.alt)),
    transcript: new Set(tokenizeNormalized(fields.transcript)),
    communityTranscript: new Set(tokenizeNormalized(fields.communityTranscript)),
  };
}

function tokenRarityMultiplier(
  index: SearchIndex,
  token: string,
): number {
  const documentFrequency = index.documentFrequencies.get(token) ?? 0;

  return (
    IDF_BASELINE +
    Math.log(
      1 +
        (index.recordCount - documentFrequency + 0.5) /
          (documentFrequency + 0.5),
    ) *
      IDF_SCALE
  );
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

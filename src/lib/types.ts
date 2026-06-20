export interface XkcdRawComic {
  month?: string;
  num?: number;
  link?: string;
  year?: string;
  news?: string;
  safe_title?: string;
  transcript?: string;
  alt?: string;
  img?: string;
  title?: string;
  day?: string;
}

export interface ExplainXkcdRawPage {
  parse?: {
    title?: string;
    pageid?: number;
    wikitext?: {
      "*"?: string;
    };
  };
  error?: {
    code?: string;
    info?: string;
  };
}

export type SourceFlag = "xkcd" | "explainxkcd";

export interface ComicRecord {
  num: number;
  slug: string;
  title: string;
  published: string;
  imageUrl: string;
  canonicalUrl: string;
  alt: string;
  transcript: string;
  communityTranscript: string;
  explanation?: string;
  explainReferences: string;
  explainUrl: string;
  searchText?: string;
  sourceFlags: SourceFlag[];
}

export interface SearchResult extends ComicRecord {
  score: number;
  excerpt: string;
  excerptSource: ExcerptSource;
  matchedFields: string[];
}

export type ExcerptSource =
  | "alt"
  | "transcript"
  | "communityTranscript"
  | "explainReferences"
  | "explanation"
  | "title";

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

export type SourceFlag = "xkcd";

export interface ComicRecord {
  num: number;
  slug: string;
  title: string;
  published: string;
  imageUrl: string;
  canonicalUrl: string;
  alt: string;
  transcript: string;
  searchText: string;
  sourceFlags: SourceFlag[];
}

export interface SearchResult extends ComicRecord {
  score: number;
  excerpt: string;
  matchedFields: string[];
}

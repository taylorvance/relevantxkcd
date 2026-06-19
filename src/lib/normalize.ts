import type { ComicRecord, XkcdRawComic } from "./types";

const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["\u00e2\u0080\u0098", "'"],
  ["\u00e2\u0080\u0099", "'"],
  ["\u00e2\u0080\u009c", '"'],
  ["\u00e2\u0080\u009d", '"'],
  ["\u00e2\u0080\u0093", "-"],
  ["\u00e2\u0080\u0094", "-"],
  ["\u00e2\u0080\u00a6", "..."],
];

export function normalizeXkcdRecord(raw: XkcdRawComic): ComicRecord | null {
  const num = Number(raw.num);

  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }

  const title = cleanText(raw.safe_title || raw.title || `xkcd ${num}`);
  const alt = cleanText(raw.alt);
  const transcript = cleanText(raw.transcript);
  const published = formatDate(raw.year, raw.month, raw.day);
  const imageUrl = String(raw.img || "");
  const canonicalUrl = `https://xkcd.com/${num}/`;

  return {
    num,
    slug: slugify(title, num),
    title,
    published,
    imageUrl,
    canonicalUrl,
    alt,
    transcript,
    searchText: [title, alt, transcript].filter(Boolean).join("\n"),
    sourceFlags: ["xkcd"],
  };
}

export function cleanText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  let text = value;

  for (const [from, to] of MOJIBAKE_REPLACEMENTS) {
    text = text.split(from).join(to);
  }

  return text.replace(/\s+/g, " ").trim();
}

export function slugify(title: string, fallbackNum: number): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `xkcd-${fallbackNum}`;
}

function formatDate(year: unknown, month: unknown, day: unknown): string {
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);

  if (!parsedYear || !parsedMonth || !parsedDay) {
    return "";
  }

  return [
    String(parsedYear).padStart(4, "0"),
    String(parsedMonth).padStart(2, "0"),
    String(parsedDay).padStart(2, "0"),
  ].join("-");
}

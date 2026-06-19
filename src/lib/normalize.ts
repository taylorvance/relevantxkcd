import type { ComicRecord, ExplainXkcdRawPage, XkcdRawComic } from "./types";

const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["\u00e2\u0080\u0098", "'"],
  ["\u00e2\u0080\u0099", "'"],
  ["\u00e2\u0080\u009c", '"'],
  ["\u00e2\u0080\u009d", '"'],
  ["\u00e2\u0080\u0093", "-"],
  ["\u00e2\u0080\u0094", "-"],
  ["\u00e2\u0080\u00a6", "..."],
];

export function normalizeXkcdRecord(
  raw: XkcdRawComic,
  explainRaw?: ExplainXkcdRawPage | null,
): ComicRecord | null {
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
  const explainUrl = `https://www.explainxkcd.com/wiki/index.php/${num}`;
  const explain = explainRaw ? parseExplainXkcdPage(explainRaw) : null;
  const communityTranscript = cleanWikiText(explain?.sections.Transcript ?? "");
  const explanation = cleanWikiText(explain?.sections.Explanation ?? "");
  const explainReferences = cleanWikiText(extractExplainReferences(explain?.wikitext ?? ""));
  const sourceFlags = explainRaw ? (["xkcd", "explainxkcd"] as const) : (["xkcd"] as const);

  return {
    num,
    slug: slugify(title, num),
    title,
    published,
    imageUrl,
    canonicalUrl,
    alt,
    transcript,
    communityTranscript,
    explanation,
    explainReferences,
    explainUrl,
    searchText: [title, alt, transcript, communityTranscript, explainReferences, explanation]
      .filter(Boolean)
      .join("\n"),
    sourceFlags: [...sourceFlags],
  };
}

export function extractExplainReferences(wikitext: string): string {
  const references = new Set<string>();
  const comicLinkPattern = /\[\[(\d+):\s*([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const categoryPattern = /\[\[Category:([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = comicLinkPattern.exec(wikitext)) !== null) {
    references.add(match[3] ?? match[2]);
  }

  while ((match = categoryPattern.exec(wikitext)) !== null) {
    references.add(match[1]);
  }

  return Array.from(references).join(". ");
}

export function parseExplainXkcdPage(raw: ExplainXkcdRawPage): {
  sections: Record<string, string>;
  wikitext: string;
} {
  const wikitext = raw.parse?.wikitext?.["*"] ?? "";
  const sections: Record<string, string> = {};
  const sectionHeaderPattern = /^==\s*([^=\n]+?)\s*==\s*$/gm;
  const headers: Array<{ name: string; contentStart: number; headerStart: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = sectionHeaderPattern.exec(wikitext)) !== null) {
    headers.push({
      name: match[1].trim(),
      contentStart: sectionHeaderPattern.lastIndex,
      headerStart: match.index,
    });
  }

  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    const contentEnd = headers[index + 1]?.headerStart ?? wikitext.length;
    sections[header.name] = wikitext.slice(header.contentStart, contentEnd).trim();
  }

  return { sections, wikitext };
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

export function cleanWikiText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const expandedLinks = value.replace(
    /\{\{w\|([^}|]+)(?:\|([^}]+))?\}\}/g,
    (_match, target: string, label?: string) => label ?? target,
  );

  return cleanText(
    expandedLinks
      .replace(/\{\{[^}]+\}\}/g, " ")
      .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, "$2")
      .replace(/'{2,}/g, "")
      .replace(/^:\s*/gm, "")
      .replace(/\s+/g, " "),
  );
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

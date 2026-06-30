import type { ComicRecord } from "./types";

const TITLE_TEXT_FOOTER_PATTERN =
  /\s*\{\{\s*(?:Title text|Alt-title|Alt|Tag)\s*:[\s\S]*?\}\}\s*$/i;
const BREAK_TAG_PATTERN = /<br\s*\/?>/gi;
const ORDINAL_SUP_TAG_PATTERN = /<sup>\s*(st|nd|rd|th)\s*<\/sup>/gi;
const SUP_TAG_PATTERN = /<sup>([\s\S]*?)<\/sup>/gi;
const SUB_TAG_PATTERN = /<sub>([\s\S]*?)<\/sub>/gi;
const FORMATTING_TAG_PATTERN =
  /<\/?(?:b|big|center|div|em|font|i|nowiki|small|span|strong|u)(?:\s+[^>]*)?>/gi;
const DOUBLE_BRACKET_BLOCK_PATTERN = /\s*\[\[([\s\S]*?)\]\](?!\s*:)\s*/g;
const INLINE_DOUBLE_BRACKET_PATTERN = /\[\[([\s\S]*?)\]\]/g;
const SINGLE_BRACKET_BLOCK_PATTERN = /\s*(\[[^\]\n]{2,260}\])(?!\s*:)\s*/g;
const SPEAKER_LABEL_PATTERN =
  /\s+((?:Beret Guy|Black Hat|Blondie|Character #\d+|Creator of the Universe|Cueball|Danish|Fellow Geek|Geek|Girl|Guy|Hairbun|Hairy|Jill|Kidball|Kid|Man|Megan|Narrator|Off-panel voice|Off-screen voice|Ponytail|Professor|Teacher|Third guy|Tony Hawk|Two guys and a girl|Voice|White Hat|Woman)(?:\s+\[[^\]]+\])?(?:\s*\([^)]*\))?:\s)/g;

export function getTranscript(record: ComicRecord): string {
  const officialTranscript = formatTranscript(record.transcript);

  if (officialTranscript) {
    return officialTranscript;
  }

  return formatTranscript(record.communityTranscript);
}

export function formatTranscript(value: string): string {
  return normalizeDisplayLines(
    decodeBasicEntities(stripTitleTextFooter(value))
      .replace(BREAK_TAG_PATTERN, "\n")
      .replace(ORDINAL_SUP_TAG_PATTERN, "$1")
      .replace(SUP_TAG_PATTERN, "^$1")
      .replace(SUB_TAG_PATTERN, "_$1")
      .replace(FORMATTING_TAG_PATTERN, "")
      .replace(DOUBLE_BRACKET_BLOCK_PATTERN, "\n[$1]\n")
      .replace(INLINE_DOUBLE_BRACKET_PATTERN, "[$1]")
      .replace(SINGLE_BRACKET_BLOCK_PATTERN, "\n$1\n")
      .replace(/\s+(?=Step #\d+\b)/g, "\n")
      .replace(/\s+(?=Soon:\s)/g, "\n")
      .replace(SPEAKER_LABEL_PATTERN, "\n$1"),
  );
}

function stripTitleTextFooter(value: string): string {
  return value.replace(TITLE_TEXT_FOOTER_PATTERN, "");
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function normalizeDisplayLines(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

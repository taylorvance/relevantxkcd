import { createHash } from "node:crypto";

import type { ComicRecord } from "../../src/lib/types.ts";

export const SEMANTIC_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const SEMANTIC_DIMENSIONS = 384;
export const SEMANTIC_SCALE = 127;

export function semanticText(record: ComicRecord): string {
  return [
    record.title,
    record.alt,
    record.transcript,
    record.communityTranscript,
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 3200);
}

export function semanticTextHash(record: ComicRecord): string {
  return `sha256-${createHash("sha256").update(semanticText(record)).digest("hex")}`;
}

export function quantizeSemanticValue(value: number): number {
  return Math.max(-SEMANTIC_SCALE, Math.min(SEMANTIC_SCALE, Math.round(value * SEMANTIC_SCALE)));
}

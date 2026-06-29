import type { ComicRecord } from "../../src/lib/types.ts";

export function publicRecordChangeLabel(previous?: ComicRecord): "Added" | "Updated" {
  return previous ? "Updated" : "Added";
}

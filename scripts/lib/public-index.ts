import type { ComicRecord } from "../../src/lib/types.ts";

export function formatPublicRecords(records: readonly ComicRecord[]): string {
  if (records.length === 0) {
    return "[]\n";
  }

  const lines = records.map((record, index) => {
    const suffix = index === records.length - 1 ? "" : ",";

    return `${JSON.stringify(record)}${suffix}`;
  });

  return `[\n${lines.join("\n")}\n]\n`;
}

export function publicRecordChangeLabel(previous?: ComicRecord): "Added" | "Updated" {
  return previous ? "Updated" : "Added";
}
